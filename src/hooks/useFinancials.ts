// Financials for Insights & Audit, computed from the tables the live database has.
// Replaces the dashboard_* views, which do not exist there. Field names match what the
// panels and the Manager PDF already read, so their layout did not have to change.
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, endOfDay } from 'date-fns';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { KWH_PER_KG_TARGET } from './useDashboardMetrics';

export const GHOST_MILLING_ALERT = '🚨 CRITICAL: GHOST MILLING (Power used, no KGs logged)';
const OPEN_TOO_LONG_HOURS = 24;

interface Sale { created_at: string; transaction_type: string | null; total_price: number | null; amount_cash: number | null; amount_mpesa: number | null; weight_kg: number | null; session_id: string | null }
interface Repayment { amount: number | null; effective_time: string | null; created_at?: string | null }
interface Purchase { created_at: string; product_id: string | null; total_amount: number | null }
interface Production { created_at: string; session_id: string | null; input_kg: number | null; main_output_kg: number | null; output_product_id: string | null }
interface Session { id: string; session_code?: string | null; session_type: string; start_meter: number | null; end_meter: number | null; created_at: string; closed_at?: string | null; power_cost?: number | null }
interface Product { id: string; selling_price: number | null; current_stock: number | null }

const n = (v: unknown) => Number(v) || 0;
const day = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');
const month = (iso: string) => format(new Date(iso), 'yyyy-MM');
const sumBy = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);

function salesQuery(from?: string, to?: string) {
  return fetchAllRows<Sale>((f, t) => {
    let q = supabase.from('sales_transactions').select('created_at, transaction_type, total_price, amount_cash, amount_mpesa, weight_kg, session_id');
    if (from && to) q = q.gte('created_at', from).lte('created_at', to);
    return q.order('created_at').range(f, t);
  });
}
function repaymentsQuery(from?: string, to?: string) {
  return fetchAllRows<Repayment>((f, t) => {
    let q = supabase.from('repayments').select('amount, effective_time');
    if (from && to) q = q.gte('effective_time', from).lte('effective_time', to);
    return q.order('effective_time').range(f, t);
  });
}
function purchasesQuery(from?: string, to?: string) {
  return fetchAllRows<Purchase>((f, t) => {
    let q = supabase.from('purchases').select('created_at, product_id, total_amount');
    if (from && to) q = q.gte('created_at', from).lte('created_at', to);
    return q.order('created_at').range(f, t);
  });
}

// ——— Snapshot: all time, not affected by the date range ————————————————————————————
export interface FinancialSnapshot {
  net_cash_generated: number;   // cash + M-Pesa received (sales + repayments) - purchases & expenses paid
  inventory_asset_value: number; // stock on system x selling price
}

export function useFinancialSnapshot() {
  return useQuery({
    queryKey: ['financials', 'snapshot'],
    queryFn: async (): Promise<FinancialSnapshot> => {
      const [sales, repayments, purchases, products] = await Promise.all([
        salesQuery(), repaymentsQuery(), purchasesQuery(),
        fetchAllRows<Product>((f, t) => supabase.from('products').select('id, selling_price, current_stock').range(f, t)),
      ]);
      const cashIn = sumBy(sales, s => n(s.amount_cash) + n(s.amount_mpesa)) + sumBy(repayments, r => n(r.amount));
      const cashOut = sumBy(purchases, p => n(p.total_amount));
      return {
        net_cash_generated: cashIn - cashOut,
        inventory_asset_value: sumBy(products, p => Math.max(0, n(p.current_stock)) * n(p.selling_price)),
      };
    },
    staleTime: 60_000,
  });
}

// ——— Date-range figures ———————————————————————————————————————————————————————————
export function useFinancials(start: Date, end: Date) {
  const from = startOfDay(start).toISOString();
  const to = endOfDay(end).toISOString();

  return useQuery({
    queryKey: ['financials', 'range', from, to],
    staleTime: 30_000,
    queryFn: async () => {
      const [sales, repayments, purchases, production, sessions, products] = await Promise.all([
        salesQuery(from, to), repaymentsQuery(from, to), purchasesQuery(from, to),
        fetchAllRows<Production>((f, t) => supabase.from('production_logs')
          .select('created_at, session_id, input_kg, main_output_kg, output_product_id')
          .gte('created_at', from).lte('created_at', to).order('created_at').range(f, t)),
        // select * so an optional power_cost column is used when the database has it
        fetchAllRows<Session>((f, t) => supabase.from('milling_sessions').select('*')
          .gte('created_at', from).lte('created_at', to).order('created_at').range(f, t)),
        fetchAllRows<Product>((f, t) => supabase.from('products').select('id, selling_price, current_stock').range(f, t)),
      ]);
      // Till counts from "Log cash drop" (migration 20261109); none yet if that table is missing
      const audits = await fetchAllRows<{ audit_date: string; actual_cash_collected: number | null }>((f, t) =>
        supabase.from('daily_audits').select('audit_date, actual_cash_collected')
          .gte('audit_date', format(start, 'yyyy-MM-dd')).lte('audit_date', format(end, 'yyyy-MM-dd')).range(f, t))
        .catch(() => []);
      const counted = new Map<string, number>();
      audits.forEach(a => counted.set(a.audit_date, (counted.get(a.audit_date) ?? 0) + n(a.actual_cash_collected)));
      const price = new Map(products.map(p => [p.id, n(p.selling_price)]));
      const kwhOf = (s: Session) => (s.end_meter == null ? 0 : Math.max(0, n(s.end_meter) - n(s.start_meter)));

      // P&L by month (revenue includes credit sales; costs are what was bought or spent)
      const months = new Map<string, { revenue: number; cogs: number; other: number; power: number }>();
      const m = (key: string) => months.get(key) ?? (months.set(key, { revenue: 0, cogs: 0, other: 0, power: 0 }), months.get(key)!);
      sales.forEach(s => { m(month(s.created_at)).revenue += n(s.total_price); });
      purchases.forEach(p => { const b = m(month(p.created_at)); if (p.product_id) b.cogs += n(p.total_amount); else b.other += n(p.total_amount); });
      sessions.forEach(s => { m(month(s.created_at)).power += n(s.power_cost); });
      const pl = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({
        month_date: `${key}-01`,
        display_month: format(new Date(`${key}-01T12:00:00`), 'MMM yy'),
        gross_revenue: v.revenue,
        cogs: v.cogs,
        total_purchases: v.cogs,
        other_operating_expenses: v.other,
        direct_power_costs: v.power,
        total_expenses: v.other + v.power,
        net_profit: v.revenue - v.cogs - v.other - v.power,
      }));

      // Cash flow by day
      const days = new Map<string, { revenue: number; expenses: number; debt_collected: number }>();
      const d = (key: string) => days.get(key) ?? (days.set(key, { revenue: 0, expenses: 0, debt_collected: 0 }), days.get(key)!);
      sales.forEach(s => { d(day(s.created_at)).revenue += n(s.amount_cash) + n(s.amount_mpesa); });
      purchases.forEach(p => { d(day(p.created_at)).expenses += n(p.total_amount); });
      repayments.forEach(r => { const at = r.effective_time || r.created_at; if (at) d(day(at)).debt_collected += n(r.amount); });
      const cashFlow = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({
        reconciliation_date: key,
        ...v,
        expected_cash: v.revenue + v.debt_collected,
        actual_cash_collected: counted.has(key) ? counted.get(key)! : null, // null = no cash drop logged that day
      }));

      // Per-session work: kg milled and money expected
      const extKg = new Map<string, number>(), extCash = new Map<string, number>();
      sales.filter(s => s.transaction_type === 'Service').forEach(s => {
        const k = s.session_id ?? 'none';
        extKg.set(k, (extKg.get(k) ?? 0) + n(s.weight_kg));
        extCash.set(k, (extCash.get(k) ?? 0) + n(s.total_price));
      });
      const prodBy = new Map<string, Production[]>();
      production.forEach(p => { const k = p.session_id ?? 'none'; prodBy.set(k, [...(prodBy.get(k) ?? []), p]); });
      const internalKg = (k: string) => sumBy(prodBy.get(k) ?? [], p => n(p.input_kg));

      // Anomaly radar: one row per session started in the range
      const now = Date.now();
      const leakage = sessions.map(s => {
        const kwh = kwhOf(s);
        const kg = (extKg.get(s.id) ?? 0) + internalKg(s.id);
        const openHours = s.end_meter == null ? (now - new Date(s.created_at).getTime()) / 3_600_000 : 0;
        let alert = '';
        if (s.end_meter == null && openHours > OPEN_TOO_LONG_HOURS) alert = `UNRECORDED CLOSE · open ${Math.floor(openHours)}h`;
        else if (s.end_meter != null && kwh > 0.5 && kg === 0) alert = GHOST_MILLING_ALERT;
        else if (kg > 0 && kwh / kg > KWH_PER_KG_TARGET) alert = `HIGH POWER · ${(kwh / kg).toFixed(2)} kWh/kg`;
        return {
          session_id: s.id,
          session_code: s.session_code,
          audit_date: s.closed_at || s.created_at,
          total_power_kwh: kwh,
          total_kgs_processed: kg,
          kwh_per_kg: kg > 0 ? kwh / kg : null,
          expected_money_in: extCash.get(s.id) ?? 0,
          leakage_alert: alert,
        };
      }).sort((a, b) => Number(!!b.leakage_alert) - Number(!!a.leakage_alert));

      // Production yield per session (+ one "No shift" row for work saved without a session)
      const intProd = [
        ...sessions.filter(s => s.session_type === 'Internal').map(s => ({ s, logs: prodBy.get(s.id) ?? [] })),
        ...(prodBy.has('none') ? [{ s: null as Session | null, logs: prodBy.get('none')! }] : []),
      ].map(({ s, logs }) => {
        const input = sumBy(logs, p => n(p.input_kg));
        const output = sumBy(logs, p => n(p.main_output_kg));
        return {
          session_id: s?.id ?? null,
          session_code: s ? s.session_code : 'No shift',
          production_date: s?.created_at ?? logs[0]?.created_at,
          total_input_kg: input,
          kgs_processed: input,
          net_output_kg: output,
          total_yield_kg: output,
          power_consumed_kwh: s ? kwhOf(s) : 0,
          exact_power_cost_ksh: s ? n(s.power_cost) : 0,
          efficiency_score: input > 0 ? (output / input) * 100 : null, // flour yield %
          projected_retail_value: sumBy(logs, p => n(p.main_output_kg) * (price.get(p.output_product_id ?? '') ?? 0)),
        };
      });

      const extProd = [
        ...sessions.filter(s => s.session_type === 'External').map(s => ({ id: s.id as string, s })),
        ...(extKg.has('none') ? [{ id: 'none', s: null as Session | null }] : []),
      ].map(({ id, s }) => ({
        session_id: s?.id ?? null,
        session_code: s ? s.session_code : 'No shift',
        production_date: s?.created_at ?? from,
        kgs_processed: extKg.get(id) ?? 0,
        total_input_kg: extKg.get(id) ?? 0,
        expected_cash: extCash.get(id) ?? 0,
        power_consumed_kwh: s ? kwhOf(s) : 0,
        exact_power_cost_ksh: s ? n(s.power_cost) : 0,
        efficiency_score: null as number | null,
      }));

      return { pl, cashFlow, leakage, intProd, extProd };
    },
  });
}

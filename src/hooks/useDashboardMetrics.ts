import { useQuery } from '@tanstack/react-query';
import { startOfDay, endOfDay, subDays, startOfWeek } from 'date-fns';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';

// ——— Date range ———————————————————————————————————————————————————————————————
export type RangePreset = 'today' | 'yesterday' | 'week' | 'custom';
export interface DayRange { start: Date; end: Date } // whole local days, inclusive

export function presetRange(preset: Exclude<RangePreset, 'custom'>, now = new Date()): DayRange {
  switch (preset) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': { const y = subDays(now, 1); return { start: startOfDay(y), end: endOfDay(y) }; }
    case 'week': return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfDay(now) }; // Monday to now
  }
}

/** Local-day bounds as UTC ISO strings. The device clock is the shop's clock, so no manual offset. */
export const rangeBounds = (r: DayRange) => ({ from: startOfDay(r.start).toISOString(), to: endOfDay(r.end).toISOString() });
const bounds = rangeBounds;

// ——— Result shapes —————————————————————————————————————————————————————————————
export interface ProductLine { productId: string; name: string; kg: number; revenue: number; count: number }

export interface DashboardMetrics {
  retail: { lines: ProductLine[]; kg: number; revenue: number; cash: number; mpesa: number; inflow: number; count: number };
  milling: { lines: ProductLine[]; kg: number; revenue: number; count: number };
  internal: { inputKg: number; outputKg: number; byproductKg: number; runs: number };
  power: {
    kwh: number;            // metered kWh of closed sessions started in the range
    kgProcessed: number;    // internal input kg + external milling kg
    kwhPerKg: number | null;
    sessionsMetered: number;
    sessionsOpen: number;   // started in range but no end meter yet, so not in kwh
  };
}

/** At or below this the mill is running efficiently (matches the previous dashboard badge). */
export const KWH_PER_KG_TARGET = 0.25;

interface SaleRow {
  product_id: string | null; transaction_type: string | null; weight_kg: number | null; total_price: number | null;
  amount_cash: number | null; amount_mpesa: number | null; products: { name: string } | { name: string }[] | null;
}
interface ProductionRow { input_kg: number | null; main_output_kg: number | null; byproduct_kg: number | null }
interface SessionRow { start_meter: number | null; end_meter: number | null; is_closed: boolean | null }

const n = (v: unknown) => Number(v) || 0;
const productName = (p: SaleRow['products']) => (Array.isArray(p) ? p[0]?.name : p?.name) || 'Unknown product';

function groupByProduct(rows: SaleRow[]): ProductLine[] {
  const map = new Map<string, ProductLine>();
  for (const r of rows) {
    const id = r.product_id ?? 'none';
    const line = map.get(id) ?? { productId: id, name: productName(r.products), kg: 0, revenue: 0, count: 0 };
    line.kg += n(r.weight_kg);
    line.revenue += n(r.total_price);
    line.count += 1;
    map.set(id, line);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.kg - a.kg);
}

async function loadMetrics(range: DayRange): Promise<DashboardMetrics> {
  const { from, to } = bounds(range);

  const [sales, production, sessions] = await Promise.all([
    // Sales are backdated through created_at (sales_transactions has no effective_time)
    fetchAllRows<SaleRow>((f, t) => supabase.from('sales_transactions')
      .select('product_id, transaction_type, weight_kg, total_price, amount_cash, amount_mpesa, products(name)')
      .gte('created_at', from).lte('created_at', to).order('created_at').range(f, t)),
    fetchAllRows<ProductionRow>((f, t) => supabase.from('production_logs')
      .select('input_kg, main_output_kg, byproduct_kg')
      .gte('created_at', from).lte('created_at', to).order('created_at').range(f, t)),
    fetchAllRows<SessionRow>((f, t) => supabase.from('milling_sessions')
      .select('start_meter, end_meter, is_closed')
      .gte('created_at', from).lte('created_at', to).order('created_at').range(f, t)),
  ]);

  const retailRows = sales.filter(s => s.transaction_type === 'Product');
  const millingRows = sales.filter(s => s.transaction_type === 'Service');

  const retailCash = retailRows.reduce((a, r) => a + n(r.amount_cash), 0);
  const retailMpesa = retailRows.reduce((a, r) => a + n(r.amount_mpesa), 0);
  const retail = {
    lines: groupByProduct(retailRows),
    kg: retailRows.reduce((a, r) => a + n(r.weight_kg), 0),
    revenue: retailRows.reduce((a, r) => a + n(r.total_price), 0),
    cash: retailCash,
    mpesa: retailMpesa,
    inflow: retailCash + retailMpesa, // money actually received; the debt part of a sale is not inflow
    count: retailRows.length,
  };

  const milling = {
    lines: groupByProduct(millingRows),
    kg: millingRows.reduce((a, r) => a + n(r.weight_kg), 0),
    revenue: millingRows.reduce((a, r) => a + n(r.total_price), 0),
    count: millingRows.length,
  };

  const internal = {
    inputKg: production.reduce((a, r) => a + n(r.input_kg), 0),
    outputKg: production.reduce((a, r) => a + n(r.main_output_kg), 0),
    byproductKg: production.reduce((a, r) => a + n(r.byproduct_kg), 0),
    runs: production.length,
  };

  // Only sessions with a closing meter have a known consumption
  const metered = sessions.filter(s => s.end_meter != null);
  const kwh = metered.reduce((a, s) => a + Math.max(0, n(s.end_meter) - n(s.start_meter)), 0);
  // Power is spent on grain going through the mill: customer grain (external) + own maize (internal input)
  const kgProcessed = milling.kg + internal.inputKg;

  return {
    retail, milling, internal,
    power: {
      kwh,
      kgProcessed,
      kwhPerKg: kgProcessed > 0 && metered.length > 0 ? kwh / kgProcessed : null,
      sessionsMetered: metered.length,
      sessionsOpen: sessions.length - metered.length,
    },
  };
}

export function useDashboardMetrics(range: DayRange) {
  const { from, to } = bounds(range);
  return useQuery({
    queryKey: ['dashboard-metrics', from, to],
    queryFn: () => loadMetrics(range),
    staleTime: 30_000,
  });
}

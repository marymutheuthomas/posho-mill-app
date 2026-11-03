// Customer debt ledger maths. Balances are always derived from history:
//   balance = opening balances + credit sales (amount_debt) - repayments
// Nothing here reads a stored balance field.

export type EntryKind = 'opening' | 'sale' | 'repayment';

export interface LedgerEntry {
  id: string;
  customerId: string;
  kind: EntryKind;
  at: string;            // effective time (ISO)
  amount: number;        // + increases what the customer owes, - reduces it
  ref?: string;          // receipt code etc.
  detail?: string;       // product / note
  method?: string;       // repayment method
  pending?: boolean;     // queued offline, not yet synced
}

export interface OpeningRow { id: string; customer_id: string; amount: number | string; effective_time: string; note?: string | null }
export interface CreditSaleRow { id: string; customer_id: string | null; amount_debt: number | string | null; effective_time?: string | null; created_at?: string | null; receipt_code?: string | null; transaction_type?: string | null; weight_kg?: number | string | null }
export interface RepaymentRow { id: string; customer_id: string | null; amount: number | string; effective_time?: string | null; created_at?: string | null; method?: string | null; notes?: string | null }

const DAY = 864e5;
const num = (v: unknown) => Number(v) || 0;
export const round2 = (n: number) => Math.round(n * 100) / 100 || 0;

export function toEntries(rows: { openings: OpeningRow[]; sales: CreditSaleRow[]; repayments: RepaymentRow[] }, pendingIds: Set<string> = new Set()): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const o of rows.openings) {
    if (!num(o.amount)) continue;
    out.push({ id: o.id, customerId: o.customer_id, kind: 'opening', at: o.effective_time, amount: num(o.amount), detail: o.note || 'Opening balance' });
  }
  for (const s of rows.sales) {
    if (!s.customer_id || !num(s.amount_debt)) continue;
    out.push({
      id: s.id, customerId: s.customer_id, kind: 'sale', at: s.effective_time || s.created_at || '',
      amount: num(s.amount_debt), ref: s.receipt_code || undefined,
      detail: [s.transaction_type === 'Service' ? 'Milling' : s.transaction_type === 'Product' ? 'Retail' : '', s.weight_kg ? `${num(s.weight_kg)} kg` : ''].filter(Boolean).join(' · '),
      pending: pendingIds.has(s.id),
    });
  }
  for (const r of rows.repayments) {
    if (!r.customer_id || !num(r.amount)) continue;
    out.push({
      id: r.id, customerId: r.customer_id, kind: 'repayment', at: r.effective_time || r.created_at || '',
      amount: -num(r.amount), method: r.method || 'Cash', detail: r.notes || undefined, pending: pendingIds.has(r.id),
    });
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export const balanceOf = (entries: LedgerEntry[]) => round2(entries.reduce((s, e) => s + e.amount, 0));

export interface Aging {
  current: number;   // 0–14 days
  due: number;       // 15–30 days
  overdue: number;   // over 30 days
  total: number;     // = balance (negative = customer is in credit)
  oldestOpenDays: number | null;
}

export const AGING_DUE_AFTER_DAYS = 14;
export const AGING_OVERDUE_AFTER_DAYS = 30;

// Payments settle the OLDEST debt first, so paying this week's invoice does not hide
// a three-month-old one.
export function ageDebt(entries: LedgerEntry[], asOf = new Date()): Aging {
  const charges = entries.filter(e => e.amount > 0).map(e => ({ at: Date.parse(e.at), left: e.amount })).sort((a, b) => a.at - b.at);
  let credit = entries.filter(e => e.amount < 0).reduce((s, e) => s - e.amount, 0);
  for (const c of charges) {
    const used = Math.min(c.left, credit);
    c.left -= used; credit -= used;
    if (credit <= 0) break;
  }
  const aging: Aging = { current: 0, due: 0, overdue: 0, total: balanceOf(entries), oldestOpenDays: null };
  for (const c of charges) {
    if (c.left <= 0.004) continue;
    const days = Math.max(0, Math.floor((asOf.getTime() - c.at) / DAY));
    if (aging.oldestOpenDays === null || days > aging.oldestOpenDays) aging.oldestOpenDays = days;
    if (days > AGING_OVERDUE_AFTER_DAYS) aging.overdue += c.left;
    else if (days > AGING_DUE_AFTER_DAYS) aging.due += c.left;
    else aging.current += c.left;
  }
  aging.current = round2(aging.current); aging.due = round2(aging.due); aging.overdue = round2(aging.overdue);
  return aging;
}

export type Risk = 'clear' | 'current' | 'due' | 'overdue';
export const riskOf = (a: Aging): Risk => a.total <= 0 ? 'clear' : a.overdue > 0 ? 'overdue' : a.due > 0 ? 'due' : 'current';

export type CreditLevel = 'no-limit' | 'ok' | 'near' | 'over';
export const CREDIT_WARN_RATIO = 0.8;

// Soft check only: the POS warns, it never blocks the sale.
export function creditCheck(balance: number, limit: number, additionalDebt = 0) {
  const projected = round2(balance + Math.max(0, additionalDebt));
  if (!limit || limit <= 0) return { level: 'no-limit' as CreditLevel, projected, ratio: null as number | null, headroom: null as number | null };
  const ratio = projected / limit;
  const level: CreditLevel = ratio > 1 ? 'over' : ratio >= CREDIT_WARN_RATIO ? 'near' : 'ok';
  return { level, projected, ratio, headroom: round2(limit - projected) };
}

export interface StatementLine extends LedgerEntry { running: number }
export interface Statement { opening: number; lines: StatementLine[]; charges: number; payments: number; closing: number }

export function buildStatement(entries: LedgerEntry[], from: Date, to: Date): Statement {
  const fromMs = from.getTime(), toMs = to.getTime();
  let running = round2(entries.filter(e => Date.parse(e.at) < fromMs).reduce((s, e) => s + e.amount, 0));
  const opening = running;
  let charges = 0, payments = 0;
  const lines: StatementLine[] = [];
  for (const e of entries) {
    const at = Date.parse(e.at);
    if (at < fromMs || at > toMs) continue;
    running = round2(running + e.amount);
    if (e.amount > 0) charges += e.amount; else payments -= e.amount;
    lines.push({ ...e, running });
  }
  return { opening, lines, charges: round2(charges), payments: round2(payments), closing: running };
}

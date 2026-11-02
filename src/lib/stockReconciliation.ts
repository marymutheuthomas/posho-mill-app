// Per-product stock reconciliation over inventory_ledger.
//
// Movements are classified by source_table (and, for production, by the sign of change_kg)
// rather than by transaction_type, so the audit does not depend on the enum's labels.

export interface LedgerRow {
  product_id: string;
  change_kg: number | string;
  effective_time: string;
  source_table: string;
  reference_id: string;
}

export interface ProductRow {
  id: string;
  product_code: string;
  name: string;
  current_stock: number | string | null;
}

export interface PhysicalCount {
  id: string;
  product_id: string | null;
  physical_stock: number | string;
  effective_time: string | null;
  created_at: string | null;
}

export type ReconStatus = 'clean' | 'variance-minor' | 'variance-major' | 'drift' | 'no-count';

export interface ReconRow {
  productId: string;
  code: string;
  name: string;
  opening: number;
  purchases: number;
  productionOut: number;
  productionIn: number;   // consumed as milling input (positive number)
  sales: number;          // net of voids/edits (positive number = stock out)
  adjustments: number;    // stock-take corrections (signed)
  other: number;          // ledger rows from any other source (signed), shown so nothing is hidden
  expected: number;       // stock the ledger says should exist at the end of the range
  currentStock: number;
  ledgerTotal: number;    // all-time sum of change_kg
  drift: number;          // current_stock - ledgerTotal; non-zero = stock changed outside the ledger
  count: { physical: number; at: string; expectedAtCount: number; variance: number } | null;
  status: ReconStatus;
}

// products.current_stock is numeric(10,2): anything under half a cent is rounding, not drift.
export const DRIFT_TOLERANCE_KG = 0.005;
// Physical variance bands: within the first band is normal handling loss/scale error.
export const VARIANCE_MINOR = { kg: 1, pct: 0.01 };
export const VARIANCE_MAJOR = { kg: 5, pct: 0.03 };

const r2 = (n: number) => Math.round(n * 100) / 100 || 0; // `|| 0` folds -0
const num = (v: unknown) => Number(v) || 0;
const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

function varianceBand(variance: number, expected: number): ReconStatus {
  const size = Math.abs(variance);
  const base = Math.abs(expected);
  if (size <= Math.max(VARIANCE_MINOR.kg, base * VARIANCE_MINOR.pct)) return 'clean';
  if (size <= Math.max(VARIANCE_MAJOR.kg, base * VARIANCE_MAJOR.pct)) return 'variance-minor';
  return 'variance-major';
}

export function reconcileStock(
  products: ProductRow[],
  ledger: LedgerRow[],
  counts: PhysicalCount[],
  rangeStart: Date,
  rangeEnd: Date
): ReconRow[] {
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const byProduct = new Map<string, LedgerRow[]>();
  for (const row of ledger) {
    const list = byProduct.get(row.product_id);
    if (list) list.push(row); else byProduct.set(row.product_id, [row]);
  }

  return products.map(product => {
    const rows = byProduct.get(product.id) ?? [];
    let opening = 0, purchases = 0, productionOut = 0, productionIn = 0, sales = 0, adjustments = 0, other = 0, ledgerTotal = 0;

    for (const row of rows) {
      const change = num(row.change_kg);
      const at = time(row.effective_time);
      ledgerTotal += change;
      if (at < startMs) { opening += change; continue; }
      if (at > endMs) continue;
      switch (row.source_table) {
        case 'purchases': purchases += change; break;
        case 'production_logs':
          if (change >= 0) productionOut += change; else productionIn -= change;
          break;
        case 'sales_transactions': sales -= change; break;
        case 'stock_take_history': adjustments += change; break;
        default: other += change;
      }
    }

    const expected = opening + purchases + productionOut - productionIn - sales + adjustments + other;
    const currentStock = num(product.current_stock);
    const drift = r2(currentStock - ledgerTotal);

    // Latest physical count inside the range, compared with what the ledger expected just
    // before that count (excluding the count's own adjustment entry).
    const latest = counts
      .filter(c => c.product_id === product.id)
      .map(c => ({ c, at: time(c.effective_time ?? c.created_at) }))
      .filter(({ at }) => at >= startMs && at <= endMs)
      .sort((a, b) => b.at - a.at)[0];

    let count: ReconRow['count'] = null;
    if (latest) {
      const expectedAtCount = rows
        .filter(row => time(row.effective_time) <= latest.at
          && !(row.source_table === 'stock_take_history' && row.reference_id === latest.c.id))
        .reduce((sum, row) => sum + num(row.change_kg), 0);
      const physical = num(latest.c.physical_stock);
      count = {
        physical: r2(physical),
        at: latest.c.effective_time ?? latest.c.created_at ?? '',
        expectedAtCount: r2(expectedAtCount),
        variance: r2(physical - expectedAtCount),
      };
    }

    const status: ReconStatus = Math.abs(drift) > DRIFT_TOLERANCE_KG
      ? 'drift'
      : count ? varianceBand(count.variance, count.expectedAtCount) : 'no-count';

    return {
      productId: product.id,
      code: product.product_code,
      name: product.name,
      opening: r2(opening),
      purchases: r2(purchases),
      productionOut: r2(productionOut),
      productionIn: r2(productionIn),
      sales: r2(sales),
      adjustments: r2(adjustments),
      other: r2(other),
      expected: r2(expected),
      currentStock: r2(currentStock),
      ledgerTotal: r2(ledgerTotal),
      drift,
      count,
      status,
    };
  });
}

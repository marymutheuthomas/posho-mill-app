import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Scale } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import {
  reconcileStock, DRIFT_TOLERANCE_KG, VARIANCE_MINOR, VARIANCE_MAJOR,
  type LedgerRow, type PhysicalCount, type ProductRow, type ReconRow, type ReconStatus
} from '../lib/stockReconciliation';

const STATUS: Record<ReconStatus, { label: string; badge: string; row: string }> = {
  'drift':          { label: 'Un-ledgered drift', badge: 'bg-red-100 text-red-700 border-red-200',             row: 'bg-red-50/50' },
  'variance-major': { label: 'High variance',     badge: 'bg-red-100 text-red-700 border-red-200',             row: 'bg-red-50/30' },
  'variance-minor': { label: 'Review variance',   badge: 'bg-amber-100 text-amber-700 border-amber-200',       row: 'bg-amber-50/30' },
  'clean':          { label: 'Balanced',          badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', row: '' },
  'no-count':       { label: 'No count',          badge: 'bg-slate-100 text-slate-500 border-slate-200',       row: '' },
};
const SEVERITY: ReconStatus[] = ['drift', 'variance-major', 'variance-minor', 'no-count', 'clean'];

const kg = (n: number) => n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => (n > 0 ? '+' : '') + kg(n);

export default function StockReconciliation({ start, end }: { start: Date; end: Date }) {
  const [issuesOnly, setIssuesOnly] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['stock-reconciliation'],
    queryFn: async () => {
      const [products, ledger, counts] = await Promise.all([
        fetchAllRows<ProductRow>((f, t) => supabase.from('products').select('id, product_code, name, current_stock').order('product_code').range(f, t)),
        fetchAllRows<LedgerRow>((f, t) => supabase.from('inventory_ledger').select('product_id, change_kg, effective_time, source_table, reference_id').order('id').range(f, t)),
        fetchAllRows<PhysicalCount>((f, t) => supabase.from('stock_take_history').select('id, product_id, physical_stock, effective_time, created_at').order('id').range(f, t)),
      ]);
      return { products, ledger, counts };
    },
    staleTime: 1000 * 60 * 2,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(23, 59, 59, 999);
    return reconcileStock(data.products, data.ledger, data.counts, s, e)
      .sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status) || a.code.localeCompare(b.code));
  }, [data, start, end]);

  const tally = useMemo(() => {
    const t: Partial<Record<ReconStatus, number>> = {};
    for (const r of rows) t[r.status] = (t[r.status] ?? 0) + 1;
    return t;
  }, [rows]);

  const visible = issuesOnly ? rows.filter(r => r.status !== 'clean' && r.status !== 'no-count') : rows;
  const showOther = rows.some(r => r.other !== 0);

  const num = (n: number, tone = 'text-slate-600') => <td className={`px-3 py-2.5 text-right text-[11px] font-mono whitespace-nowrap ${n === 0 ? 'text-slate-300' : tone}`}>{kg(n)}</td>;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Scale className="text-brand shrink-0" size={18} />
          <div>
            <h3 className="text-sm font-black text-brand uppercase tracking-tight">Stock Reconciliation</h3>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Inventory ledger vs product stock vs physical counts</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SEVERITY.filter(s => tally[s]).map(s => (
            <span key={s} className={`px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-widest border ${STATUS[s].badge}`}>
              {tally[s]} {STATUS[s].label}
            </span>
          ))}
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer ml-1">
            <input type="checkbox" checked={issuesOnly} onChange={e => setIssuesOnly(e.target.checked)} className="accent-brand" />
            Issues only
          </label>
        </div>
      </div>

      {error ? (
        <p className="p-8 text-center text-[11px] font-bold text-red-600 uppercase tracking-widest">
          Could not load the inventory ledger: {(error as any).message}
        </p>
      ) : isLoading ? (
        <p className="p-12 text-center text-[11px] font-bold text-slate-300 uppercase tracking-widest animate-pulse">Reconciling ledger…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-3 py-3 border-b border-slate-100">Product</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">Opening</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">Purchases</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">Prod. Out</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">Prod. In</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">Sales</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">Adjust.</th>
                {showOther && <th className="px-3 py-3 border-b border-slate-100 text-right">Other</th>}
                <th className="px-3 py-3 border-b border-slate-100 text-right text-brand">Expected</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">On System</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">Drift</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">Last Count</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">Variance</th>
                <th className="px-3 py-3 border-b border-slate-100 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visible.map((r: ReconRow) => (
                <tr key={r.productId} className={`${STATUS[r.status].row} hover:bg-slate-50 transition-colors`}>
                  <td className="px-3 py-2.5">
                    <p className="text-[11px] font-bold text-slate-800 uppercase whitespace-nowrap">{r.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{r.code}</p>
                  </td>
                  {num(r.opening)}
                  {num(r.purchases, 'text-emerald-600')}
                  {num(r.productionOut, 'text-emerald-600')}
                  {num(r.productionIn, 'text-slate-600')}
                  {num(r.sales, 'text-slate-600')}
                  <td className={`px-3 py-2.5 text-right text-[11px] font-mono whitespace-nowrap ${r.adjustments === 0 ? 'text-slate-300' : 'text-amber-600'}`}>{signed(r.adjustments)}</td>
                  {showOther && <td className={`px-3 py-2.5 text-right text-[11px] font-mono ${r.other === 0 ? 'text-slate-300' : 'text-amber-600'}`}>{signed(r.other)}</td>}
                  <td className="px-3 py-2.5 text-right text-[11px] font-mono font-bold text-brand whitespace-nowrap">{kg(r.expected)}</td>
                  {num(r.currentStock)}
                  <td className={`px-3 py-2.5 text-right text-[11px] font-mono whitespace-nowrap ${r.status === 'drift' ? 'font-bold text-red-600' : 'text-slate-300'}`}>{signed(r.drift)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {r.count ? (
                      <>
                        <p className="text-[11px] font-mono text-slate-700">{kg(r.count.physical)}</p>
                        <p className="text-[11px] text-slate-400">{new Date(r.count.at).toLocaleDateString()} · exp. {kg(r.count.expectedAtCount)}</p>
                      </>
                    ) : <span className="text-[11px] text-slate-300">—</span>}
                  </td>
                  <td className={`px-3 py-2.5 text-right text-[11px] font-mono whitespace-nowrap ${!r.count ? 'text-slate-300' : r.status === 'variance-major' ? 'font-bold text-red-600' : r.status === 'variance-minor' ? 'font-bold text-amber-600' : 'text-emerald-600'}`}>
                    {r.count ? signed(r.count.variance) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-widest border whitespace-nowrap ${STATUS[r.status].badge}`}>{STATUS[r.status].label}</span>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={showOther ? 14 : 13} className="px-4 py-12 text-center text-[11px] font-bold text-slate-300 uppercase tracking-widest italic">
                  {issuesOnly ? 'No discrepancies in this period' : 'No products found'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="px-5 py-3 border-t border-slate-100 text-[11px] font-semibold text-slate-400 leading-relaxed">
        Expected = opening + purchases + production out − production in − sales ± adjustments (kg, by ledger effective time).
        Drift = on-system stock − all-time ledger total; anything beyond {DRIFT_TOLERANCE_KG} kg means stock changed without a ledger entry.
        Variance = latest count in the period − stock the ledger expected just before that count; amber beyond {VARIANCE_MINOR.kg} kg / {VARIANCE_MINOR.pct * 100}%, red beyond {VARIANCE_MAJOR.kg} kg / {VARIANCE_MAJOR.pct * 100}%.
      </p>
    </div>
  );
}

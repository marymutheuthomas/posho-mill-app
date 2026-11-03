import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ScrollText, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FIELD, FIELD_LABEL, SECTION_TITLE, btn } from '../lib/ui';
import { rangeBounds, type DayRange } from '../hooks/useDashboardMetrics';
import { useProductNames } from '../hooks/useLookups';

interface LedgerEntry {
  id: number | string;
  product_id: string;
  change_kg: number | string;
  transaction_type: string | null;
  source_table: string | null;
  reference_id: string | null;
  effective_time: string;
}

const PAGE = 100;
const SOURCES: { value: string; label: string }[] = [
  { value: '', label: 'All sources' },
  { value: 'sales_transactions', label: 'Sales' },
  { value: 'production_logs', label: 'Production' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'stock_take_history', label: 'Stock takes' },
];
const SOURCE_LABEL = Object.fromEntries(SOURCES.filter(s => s.value).map(s => [s.value, s.label]));

// Read-only view: the ledger is written by database triggers, never edited from the app.
export default function LedgerStream({ range }: { range: DayRange }) {
  const productNames = useProductNames();
  const [productId, setProductId] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const { from, to } = rangeBounds(range);

  const query = useInfiniteQuery({
    queryKey: ['audit-desk', 'ledger', from, to, productId, source],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let q = supabase.from('inventory_ledger')
        .select('id, product_id, change_kg, transaction_type, source_table, reference_id, effective_time')
        .gte('effective_time', from).lte('effective_time', to);
      if (productId) q = q.eq('product_id', productId);
      if (source) q = q.eq('source_table', source);
      const { data, error } = await q
        .order('effective_time', { ascending: false }).order('id', { ascending: false })
        .range(pageParam, pageParam + PAGE - 1);
      if (error) throw error;
      return (data ?? []) as LedgerEntry[];
    },
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.length * PAGE : undefined),
  });

  const loaded = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  const term = search.trim().toLowerCase();
  const rows = term
    ? loaded.filter(r => [productNames.get(r.product_id), r.transaction_type, r.source_table, r.reference_id]
        .some(v => v?.toLowerCase().includes(term)))
    : loaded;
  const products = useMemo(() => [...productNames.entries()].sort((a, b) => a[1].localeCompare(b[1])), [productNames]);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 space-y-3" aria-labelledby="ledger-title">
      <header>
        <h2 id="ledger-title" className={`${SECTION_TITLE} text-slate-900 flex items-center gap-2`}>
          <ScrollText size={20} className="text-brand" /> Inventory ledger
        </h2>
        <p className="text-xs text-slate-500">Every stock movement, newest first. Read-only: entries are written by the database.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label htmlFor="ledger-product" className={FIELD_LABEL}>Product</label>
          <select id="ledger-product" className={FIELD} value={productId} onChange={e => setProductId(e.target.value)}>
            <option value="">All products</option>
            {products.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ledger-source" className={FIELD_LABEL}>Source</label>
          <select id="ledger-source" className={FIELD} value={source} onChange={e => setSource(e.target.value)}>
            {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ledger-search" className={FIELD_LABEL}>Search loaded entries</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input id="ledger-search" type="search" className={`${FIELD} !pl-9`} placeholder="Reference, type…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <div className="h-32 rounded-xl bg-slate-50 animate-pulse" aria-busy="true" />
      ) : query.error ? (
        <p role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">Could not load the ledger: {(query.error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="p-4 rounded-xl bg-slate-50 text-sm text-slate-500 text-center">{term ? 'No loaded entries match the search.' : 'No stock movements in this period.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Change</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => {
                const change = Number(r.change_kg) || 0;
                return (
                  <tr key={String(r.id)}>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{format(new Date(r.effective_time), 'd MMM yyyy, HH:mm:ss')}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{productNames.get(r.product_id) ?? 'Unknown product'}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold whitespace-nowrap ${change < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                      {change > 0 ? '+' : ''}{change.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{r.transaction_type ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{(r.source_table && SOURCE_LABEL[r.source_table]) || r.source_table || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 truncate max-w-[160px]" title={r.reference_id ?? ''}>{r.reference_id ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Showing <span className="font-mono">{rows.length}</span>{term && <> of <span className="font-mono">{loaded.length}</span> loaded</>} entr{rows.length === 1 ? 'y' : 'ies'}
        </p>
        {query.hasNextPage && (
          <button type="button" className={btn.secondary} onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : `Load ${PAGE} more`}
          </button>
        )}
      </div>
    </section>
  );
}

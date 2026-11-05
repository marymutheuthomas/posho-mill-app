import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Scale, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { SECTION_TITLE, chip } from '../lib/ui';
import { rangeBounds, type DayRange } from '../hooks/useDashboardMetrics';
import { useProductNames, useProfileNames, describeRecorder } from '../hooks/useLookups';
import { usePagination } from '../hooks/usePagination';
import Pagination from './Pagination';

interface CountRow {
  id: string;
  product_id: string | null;
  product_name: string | null;
  system_stock: number | null;
  physical_stock: number | null;
  discrepancy: number | null;
  recorded_by: string | null;
  effective_time: string | null;
  created_at: string;
}

const n = (v: unknown) => Number(v) || 0;
const kg = (v: number, signed = false) =>
  `${signed && v > 0 ? '+' : ''}${v.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

export default function StockDiscrepancyMatrix({ range }: { range: DayRange }) {
  const [missingOnly, setMissingOnly] = useState(false);
  const productNames = useProductNames();
  const people = useProfileNames();
  const { from, to } = rangeBounds(range);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['audit-desk', 'stock-counts', from, to],
    queryFn: () => fetchAllRows<CountRow>((f, t) => supabase.from('stock_take_history')
      .select('id, product_id, product_name, system_stock, physical_stock, discrepancy, recorded_by, effective_time, created_at')
      // created_at is the (back-dated) count time set by the Stock Take screen
      .gte('created_at', from).lte('created_at', to)
      .order('created_at', { ascending: false }).range(f, t)),
  });

  const rows = missingOnly ? data.filter(r => n(r.discrepancy) < 0) : data;
  const { pageItems, pager } = usePagination(rows, { resetKey: `${from}|${to}|${missingOnly}` });
  const missing = data.filter(r => n(r.discrepancy) < 0);
  const missingKg = missing.reduce((a, r) => a + n(r.discrepancy), 0);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 space-y-3" aria-labelledby="matrix-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="matrix-title" className={`${SECTION_TITLE} text-slate-900 flex items-center gap-2`}>
            <Scale size={20} className="text-brand" /> Physical count discrepancies
          </h2>
          <p className="text-xs text-slate-500">Stock takes: what the system expected vs what was counted</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={chip(!missingOnly)} aria-pressed={!missingOnly} onClick={() => setMissingOnly(false)}>All counts</button>
          <button type="button" className={chip(missingOnly)} aria-pressed={missingOnly} onClick={() => setMissingOnly(true)}>Missing only</button>
        </div>
      </header>

      {missing.length > 0 && (
        <p role="status" className="flex items-center gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          <AlertTriangle size={16} className="shrink-0" />
          <span><span className="font-mono font-semibold">{missing.length}</span> count{missing.length === 1 ? '' : 's'} short, <span className="font-mono font-semibold">{kg(Math.abs(missingKg))}</span> missing in total.</span>
        </p>
      )}

      {isLoading ? (
        <div className="h-32 rounded-xl bg-slate-50 animate-pulse" aria-busy="true" />
      ) : error ? (
        <p role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">Could not load stock counts: {(error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="p-4 rounded-xl bg-slate-50 text-sm text-slate-500 text-center">{missingOnly ? 'No missing stock in this period.' : 'No stock takes in this period.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">System</th>
                <th className="px-3 py-2 text-right">Counted</th>
                <th className="px-3 py-2 text-right">Discrepancy</th>
                <th className="px-3 py-2">Recorded by</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map(r => {
                const d = n(r.discrepancy);
                return (
                  <tr key={r.id} className={d < 0 ? 'bg-red-50/40' : undefined}>
                    <td className="px-3 py-2 font-medium text-slate-800">{r.product_name || (r.product_id && productNames.get(r.product_id)) || 'Unknown product'}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600 whitespace-nowrap">{kg(n(r.system_stock))}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800 whitespace-nowrap">{kg(n(r.physical_stock))}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-md font-mono text-xs font-semibold ${
                        d < 0 ? 'bg-red-50 text-red-700 border border-red-200' : d > 0 ? 'bg-slate-100 text-slate-700' : 'text-slate-500'}`}>
                        {d < 0 && <span className="sr-only">Missing: </span>}{kg(d, true)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{describeRecorder(r.recorded_by, people)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{format(new Date(r.effective_time || r.created_at), 'd MMM yyyy, HH:mm')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pager={pager} noun="counts" />
    </section>
  );
}

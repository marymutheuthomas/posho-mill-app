import { useId } from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS, type PagerState } from '../hooks/usePagination';
import { btn } from '../lib/ui';

const NAV = `${btn.icon} border border-slate-200 bg-white disabled:hover:bg-white`;

/** Standard table footer: "Showing 1–25 of 142 entries", rows per page, first/prev/next/last. */
export default function Pagination({ pager, noun = 'entries', className = '' }: { pager: PagerState; noun?: string; className?: string }) {
  const sizeId = useId();
  const { page, pageCount, pageSize, total, from, to, setPage, setPageSize } = pager;
  if (total === 0) return null;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 ${className}`}>
      <p className="text-xs text-slate-600" aria-live="polite">
        Showing <span className="font-mono font-semibold text-slate-900">{from}–{to}</span> of{' '}
        <span className="font-mono font-semibold text-slate-900">{total.toLocaleString('en-KE')}</span> {noun}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={sizeId} className="text-xs font-semibold uppercase tracking-wider text-slate-600">Rows</label>
        <select id={sizeId} value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
          className="h-11 min-w-[4.5rem] px-3 rounded-lg border border-slate-300 bg-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand">
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <nav aria-label="Pages" className="flex items-center gap-1 ml-auto sm:ml-2">
          <button type="button" className={NAV} onClick={() => setPage(1)} disabled={page <= 1} aria-label="First page"><ChevronsLeft size={18} /></button>
          <button type="button" className={NAV} onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={18} /></button>
          <span className="min-h-11 px-3 inline-flex items-center rounded-lg border border-brand/40 bg-brand-soft text-xs font-semibold text-brand whitespace-nowrap" aria-current="page">
            Page&nbsp;<span className="font-mono">{page}</span>&nbsp;of&nbsp;<span className="font-mono">{pageCount}</span>
          </span>
          <button type="button" className={NAV} onClick={() => setPage(page + 1)} disabled={page >= pageCount} aria-label="Next page"><ChevronRight size={18} /></button>
          <button type="button" className={NAV} onClick={() => setPage(pageCount)} disabled={page >= pageCount} aria-label="Last page"><ChevronsRight size={18} /></button>
        </nav>
      </div>
    </div>
  );
}

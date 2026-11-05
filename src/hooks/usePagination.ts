import { useMemo, useState } from 'react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** What the <Pagination> control needs. Server-paged tables build this themselves. */
export interface PagerState {
  page: number;          // 1-based, always within 1..pageCount
  pageSize: number;
  total: number;
  pageCount: number;
  from: number;          // 1-based index of the first row shown (0 when empty)
  to: number;            // index of the last row shown
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

export function pagerFor(page: number, pageSize: number, total: number,
  setPage: (p: number) => void, setPageSize: (s: number) => void): PagerState {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  return { page: current, pageSize, total, pageCount, from, to: Math.min(current * pageSize, total), setPage, setPageSize };
}

/**
 * Client-side pagination of an array: only the current page is rendered.
 * `resetKey` (e.g. a filter or search term) sends the view back to page 1 when it changes.
 */
export function usePagination<T>(items: T[], { initialPageSize = DEFAULT_PAGE_SIZE, resetKey }: { initialPageSize?: number; resetKey?: unknown } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState(initialPageSize);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) { setLastKey(resetKey); setPage(1); } // adjust during render, no extra effect pass

  const setPageSize = (size: number) => { setSize(size); setPage(1); };
  const pager = pagerFor(page, pageSize, items.length, setPage, setPageSize);
  const pageItems = useMemo(
    () => items.slice((pager.page - 1) * pageSize, pager.page * pageSize),
    [items, pager.page, pageSize],
  );
  return { pageItems, pager };
}

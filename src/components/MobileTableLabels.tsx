import { useEffect } from 'react';

/**
 * Gives every cell of a `table.mobile-cards` a data-label with its column heading, so the
 * phone layout in index.css can show "Product ..... Maize Bulk" inside each card.
 * One observer for the whole app: tables only need the class, nothing else.
 * Cells that span several columns (empty states, totals) get an empty label.
 */
function labelTable(table: HTMLTableElement) {
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headRow) return;
  const headings: string[] = [];
  for (const th of Array.from(headRow.cells)) {
    const text = (th.textContent ?? '').trim();
    for (let i = 0; i < (th.colSpan || 1); i++) headings.push(text);
  }
  const rows = [...Array.from(table.tBodies).flatMap(b => Array.from(b.rows)), ...Array.from(table.tFoot?.rows ?? [])];
  for (const row of rows) {
    let col = 0;
    for (const cell of Array.from(row.cells)) {
      const label = cell.colSpan > 1 ? '' : (headings[col] ?? '');
      if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
      col += cell.colSpan || 1;
    }
  }
}

export default function MobileTableLabels() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>('table.mobile-cards').forEach(labelTable);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return null;
}

import { ClipboardCheck, X } from 'lucide-react';

interface StockTakeReminderProps {
  closedAt: string;
  onStockTake: () => void;
  onDismiss: () => void;
}

// Non-blocking nudge after a late close, kept to one slim row so it doesn't push the till down.
export default function StockTakeReminder({ closedAt, onStockTake, onDismiss }: StockTakeReminderProps) {
  const closed = new Date(closedAt).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi', weekday: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex items-center gap-2">
      <ClipboardCheck size={14} className="text-amber-600 shrink-0" />
      <p className="text-[11px] font-semibold flex-1 min-w-0 truncate" title="Operations are not affected.">
        Stock take recommended <span className="font-normal text-amber-700">· late close {closed}</span>
      </p>
      <button onClick={onStockTake} className="shrink-0 px-3 py-1 rounded-lg bg-amber-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-amber-700">
        Count now
      </button>
      <button onClick={onDismiss} aria-label="Dismiss reminder" className="shrink-0 p-1 rounded-md text-amber-700 hover:bg-amber-100">
        <X size={14} />
      </button>
    </div>
  );
}

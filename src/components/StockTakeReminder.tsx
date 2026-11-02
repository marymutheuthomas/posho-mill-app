import { ClipboardCheck, X } from 'lucide-react';

interface StockTakeReminderProps {
  closedAt: string;
  onStockTake: () => void;
  onDismiss: () => void;
}

// Non-blocking nudge after a late close. POS, Production and Session Control stay fully usable.
export default function StockTakeReminder({ closedAt, onStockTake, onDismiss }: StockTakeReminderProps) {
  const closed = new Date(closedAt).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi', weekday: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="mb-4 p-3 md:p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <ClipboardCheck size={18} className="text-amber-600 shrink-0" />
        <p className="text-xs font-semibold">
          Stock take recommended: the last session closed late ({closed}) and no count has been recorded since.
          Operations are not affected.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onStockTake} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-700">
          Do Stock Take
        </button>
        <button onClick={onDismiss} aria-label="Dismiss reminder" className="p-2 rounded-lg text-amber-700 hover:bg-amber-100">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RotateCcw, Trash2, Pencil, X } from 'lucide-react';
import { db, type DeadLetter } from '../lib/db';
import { requeueDeadLetter, discardDeadLetter } from '../lib/offlineSync';

// Admin review of records the sync engine gave up on. Nothing here is deleted without an explicit discard.
export default function DeadLetterQueue() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id: number; text: string; error: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<number | null>(null);

  const { data: letters = [] } = useQuery({
    queryKey: ['dead-letters'],
    queryFn: async () => await db.dead_letter_queue.orderBy('failedAt').reverse().toArray(),
    refetchInterval: 5000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dead-letters'] });
    queryClient.invalidateQueries({ queryKey: ['dead-letter-count'] });
    queryClient.invalidateQueries({ queryKey: ['pending-tx-count'] });
  };

  const retry = async (letter: DeadLetter, payload?: any) => {
    await requeueDeadLetter(letter.id!, payload);
    setEditing(null);
    refresh();
  };

  const saveAndRetry = async (letter: DeadLetter) => {
    if (!editing) return;
    try {
      await retry(letter, JSON.parse(editing.text));
    } catch {
      setEditing({ ...editing, error: 'Invalid JSON. Fix the payload before retrying.' });
    }
  };

  const discard = async (id: number) => {
    await discardDeadLetter(id);
    setConfirmDiscard(null);
    refresh();
  };

  if (letters.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0">
          <AlertTriangle size={20} />
        </div>
        <div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
            {letters.length} Failed Sync {letters.length === 1 ? 'Record' : 'Records'}
          </h2>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
            Rejected by the database after repeated attempts. Review, correct and retry, or discard.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {letters.map(letter => (
          <div key={letter.id} className="border border-slate-200 rounded-xl p-3 md:p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-900 uppercase tracking-wider">{letter.type.replace(/_/g, ' ')}</p>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Recorded {new Date(letter.timestamp).toLocaleString()} · Failed {new Date(letter.failedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => retry(letter)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800">
                  <RotateCcw size={12} /> Retry
                </button>
                <button onClick={() => setEditing({ id: letter.id!, text: JSON.stringify(letter.payload, null, 2), error: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50">
                  <Pencil size={12} /> Edit
                </button>
                {confirmDiscard === letter.id ? (
                  <>
                    <button onClick={() => discard(letter.id!)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700">Confirm</button>
                    <button onClick={() => setConfirmDiscard(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50"><X size={14} /></button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDiscard(letter.id!)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-50">
                    <Trash2 size={12} /> Discard
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs font-mono text-red-700 bg-red-50 rounded-lg p-2 break-words">
              {letter.error.message}
              {letter.error.code && <span className="text-red-400"> ({letter.error.code})</span>}
              {letter.error.details && <span className="block text-red-500">{letter.error.details}</span>}
            </p>

            {editing && editing.id === letter.id && (
              <div className="space-y-2">
                <textarea
                  value={editing.text}
                  onChange={e => setEditing({ ...editing, text: e.target.value, error: '' })}
                  rows={10}
                  spellCheck={false}
                  className="w-full font-mono text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
                {editing.error && <p className="text-[10px] font-bold text-red-600 uppercase">{editing.error}</p>}
                <div className="flex gap-2">
                  <button onClick={() => saveAndRetry(letter)} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800">Save & Retry</button>
                  <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

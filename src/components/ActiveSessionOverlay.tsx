import { useState } from 'react';
import { Zap, Square, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useMillingSession } from '../hooks/useMillingSession';
import { btn } from '../lib/ui';

export default function ActiveSessionOverlay() {
  const { activeSession, closeSession: closeMutation } = useMillingSession();
  const [endMeter, setEndMeter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleClose = () => {
    setError(null);
    if (!endMeter) { setError('End meter reading is required.'); return; }
    if (window.confirm("ARE YOU SURE? This will PERMANENTLY CLOSE the current milling session and finalize meter readings. You cannot undo this action.")) {
      closeMutation.mutate(parseFloat(endMeter), {
        onSuccess: (result) => {
          setEndMeter('');
          setSuccess(result.offline ? 'Shutdown saved locally.' : 'Session closed successfully.');
          setTimeout(() => setSuccess(null), 4000);
        },
        // Surface the EXACT error from the DB (trigger messages, RLS errors, etc.)
        onError: (err: any) => setError(err?.message || err?.details || 'An unknown error occurred.'),
      });
    }
  };

  // Don't render if no active session
  if (!activeSession) return null;

  // One slim row at every width so the till form starts near the top of the screen.
  return (
    <div className="mb-3 relative">
      <div className="bg-slate-900 text-white rounded-xl shadow-md border border-white/10 px-3 py-2 flex items-center gap-2 md:gap-3">

          {/* Session info */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Zap size={14} className="text-emerald-400 animate-pulse shrink-0" />
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-300 truncate">
              {activeSession.session_type} session · started @ <span className="text-white font-mono">{activeSession.start_meter}</span> kWh
            </p>
          </div>

          {/* End meter input */}
          <input
            type="number"
            step="0.01"
            value={endMeter}
            onChange={e => setEndMeter(e.target.value)}
            placeholder="End kWh"
            className="w-24 md:w-32 h-11 bg-white/5 border border-white/10 rounded-lg px-2 py-1 font-mono focus:bg-white/10 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-600"
          />

          {/* Shutdown button */}
          <button
            onClick={handleClose}
            disabled={closeMutation.isPending}
            className={`${btn.danger} shrink-0 !h-11 !px-3`}
          >
            {closeMutation.isPending
              ? <><RotateCcw className="animate-spin" size={12} /> Closing</>
              : <><Square size={12} fill="currentColor" /> <span className="hidden sm:inline">Shutdown</span><span className="sm:hidden">Stop</span></>
            }
          </button>
        </div>

        {/* Toasts sit below the bar so they never cover the header */}
        {(error || success) && (
          <div className="absolute top-full left-0 right-0 mt-1 z-20 flex justify-center pointer-events-none">
            <div className={`${error ? 'bg-red-500' : 'bg-emerald-500'} text-white text-[11px] font-black px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg max-w-full text-center`}>
              {error ? <AlertTriangle size={12} className="shrink-0" /> : <CheckCircle size={12} />}
              <span className="leading-tight">{error || success}</span>
            </div>
          </div>
        )}
    </div>
  );
}

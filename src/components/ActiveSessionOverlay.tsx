import { useState } from 'react';
import { Zap, Square, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useMillingSession } from '../hooks/useMillingSession';

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

  return (
    <div className="mb-6 animate-in slide-in-from-top-10 duration-500">
      <div className="bg-slate-900 text-white rounded-2xl shadow-xl border border-white/10 p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-xl bg-slate-900/90">

          {/* Session info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
              <Zap size={20} className="animate-pulse" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-tight">
                Active {activeSession.session_type} Session
              </p>
              <div className="flex items-baseline gap-2">
                <h4 className="text-lg font-black text-white leading-none">
                  Started @ {activeSession.start_meter}
                </h4>
                <span className="text-[9px] text-slate-500 font-mono">kWh</span>
              </div>
            </div>
          </div>

          {/* End meter input + error/success toasts */}
          <div className="flex-1 w-full md:max-w-[200px] relative">
            <input
              type="number"
              step="0.01"
              value={endMeter}
              onChange={e => setEndMeter(e.target.value)}
              placeholder="End Odometer..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-lg font-black font-mono focus:bg-white/10 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-600"
            />
            {error && (
              <div className="absolute -top-12 left-0 right-0 flex justify-center">
                <div className="bg-red-500 text-white text-[10px] font-black px-4 py-2 rounded-full flex items-center gap-2 shadow-lg max-w-full text-center">
                  <AlertTriangle size={12} className="shrink-0" />
                  <span className="leading-tight">{error}</span>
                </div>
              </div>
            )}
            {success && (
              <div className="absolute -top-12 left-0 right-0 flex justify-center">
                <div className="bg-emerald-500 text-white text-[10px] font-black px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
                  <CheckCircle size={12} />
                  {success}
                </div>
              </div>
            )}
          </div>

          {/* Shutdown button */}
          <button
            onClick={handleClose}
            disabled={closeMutation.isPending}
            className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-emerald-900/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {closeMutation.isPending
              ? <><RotateCcw className="animate-spin" size={14} /> Closing...</>
              : <><Square size={14} fill="currentColor" /> Shutdown Shift</>
            }
          </button>
        </div>
    </div>
  );
}

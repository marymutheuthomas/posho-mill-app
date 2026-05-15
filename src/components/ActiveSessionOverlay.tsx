import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Zap, Square, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '../lib/db';

interface ActiveSessionOverlayProps {
  activeSession: any;
}

export default function ActiveSessionOverlay({ activeSession }: ActiveSessionOverlayProps) {
  const queryClient = useQueryClient();
  const [endMeter, setEndMeter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── MUTATION: Close Session (STRICT UPDATE on existing row by ID) ────────────
  const closeMutation = useMutation({
    mutationFn: async () => {
      const endMeterValue = parseFloat(endMeter);

      // Client-side validation before touching the DB
      if (!endMeter || isNaN(endMeterValue)) {
        throw new Error('End meter reading is required.');
      }
      if (endMeterValue < parseFloat(activeSession.start_meter)) {
        throw new Error(`Invalid meter: must be ≥ ${activeSession.start_meter} kWh.`);
      }
      if (!activeSession.id) {
        throw new Error('CRITICAL: Session ID is missing. Cannot close session.');
      }

      // CLEAN CLOSE PAYLOAD — only the fields we are updating, never the PK
      const updatePayload = {
        end_meter: endMeterValue,
        is_closed: true,
        status: 'Completed',         // Exact case required by DB constraint
        closed_at: new Date().toISOString(),
      };

      console.log('[closeMutation] UPDATE payload for session', activeSession.id, ':', updatePayload);

      // OFFLINE PATH — queue the update for replay when back online
      if (!navigator.onLine) {
        await db.pendingTransactions.add({
          type: 'milling_session_update',
          payload: { id: activeSession.id, ...updatePayload },
          timestamp: Date.now(),
          retryCount: 0,
        });
        return { offline: true };
      }

      // ONLINE PATH — strict UPDATE on the specific session row
      const { error } = await supabase
        .from('milling_sessions')
        .update(updatePayload)
        .eq('id', activeSession.id);

      if (error) {
        console.error('[closeMutation] DB error:', error);
        throw error;
      }

      console.log('[closeMutation] Session closed successfully.');
      return { offline: false };
    },
    onSuccess: (result) => {
      setError(null);
      setEndMeter('');
      setSuccess(result.offline ? 'Shutdown saved locally.' : 'Session closed successfully.');

      // Invalidate ALL relevant queries so UI updates everywhere
      queryClient.invalidateQueries({ queryKey: ['active-session'] });
      queryClient.invalidateQueries({ queryKey: ['last-end-meter'] });
      queryClient.invalidateQueries({ queryKey: ['milling_sessions'] });

      setTimeout(() => setSuccess(null), 4000);
    },
    onError: (err: any) => {
      // Surface the EXACT error from the DB (trigger messages, RLS errors, etc.)
      const message = err?.message || err?.details || 'An unknown error occurred.';
      console.error('[closeMutation] Error:', message);
      setError(message);
    },
  });

  const handleClose = () => {
    setError(null);
    if (window.confirm("ARE YOU SURE? This will PERMANENTLY CLOSE the current milling session and finalize meter readings. You cannot undo this action.")) {
      closeMutation.mutate();
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

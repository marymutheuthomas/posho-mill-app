import React, { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseUrl, supabaseKey } from '../lib/supabase';
import { Database, RefreshCw, X } from 'lucide-react';
import { btn } from '../lib/ui';

interface DatabaseHealthProps {
  children: React.ReactNode;
}

const PING_TIMEOUT_MS = 5000;

type Problem = { kind: 'unreachable' | 'rejected'; message: string; detail?: string };

/**
 * Startup connection check that never holds up the till.
 *
 * The app opens straight away and works offline as designed; the database is pinged in the
 * background (5 s limit) and a small notice appears only if it cannot be reached or refuses the
 * app's key. Only a build with no database URL/key at all is blocked, since nothing could work.
 */
export default function DatabaseHealth({ children }: DatabaseHealthProps) {
  const misconfigured = !supabaseUrl?.trim() || !supabaseKey?.trim();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkHealth = useCallback(async () => {
    if (misconfigured || !navigator.onLine) return; // offline: the top bar already says so
    setChecking(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
      // products is the one table readable before sign-in
      const { error } = await supabase.from('products').select('id').limit(1).abortSignal(controller.signal);
      if (!error) { setProblem(null); return; }
      const aborted = controller.signal.aborted || /abort|fetch|network/i.test(error.message);
      console.error('[DatabaseHealth]', error);
      setProblem(aborted
        ? { kind: 'unreachable', message: "Can't reach the database. Keep working: your records are saved on this device and will sync later." }
        : { kind: 'rejected', message: 'The database refused the connection. Tell an admin.', detail: `${error.code || ''} ${error.message}`.trim() });
    } catch (err) {
      console.error('[DatabaseHealth] network error:', err);
      setProblem({ kind: 'unreachable', message: "Can't reach the database. Keep working: your records are saved on this device and will sync later." });
    } finally {
      clearTimeout(timer);
      setChecking(false);
      setDismissed(false);
    }
  }, [misconfigured]);

  useEffect(() => {
    const first = setTimeout(checkHealth, 0); // after first paint, never before it
    window.addEventListener('online', checkHealth);
    return () => { clearTimeout(first); window.removeEventListener('online', checkHealth); };
  }, [checkHealth]);

  // A build without the database settings cannot do anything useful: this is the one hard stop.
  if (misconfigured) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-canvas p-6">
        <div role="alert" className="bg-white p-6 rounded-2xl max-w-md w-full shadow-lg border border-red-200">
          <div className="flex items-center gap-3 mb-3">
            <Database size={24} className="text-red-600" />
            <h1 className="text-lg font-bold text-slate-900">App not configured</h1>
          </div>
          <p className="text-sm text-slate-700">The database address or key is missing from this build. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {problem && !dismissed && (
        <div role="status"
          className={`fixed z-[65] left-4 right-4 bottom-16 md:bottom-4 md:left-auto md:max-w-sm rounded-xl border shadow-lg p-3 flex items-start gap-2 ${
            problem.kind === 'rejected' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <Database size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{problem.message}</p>
            {problem.detail && <p className="mt-1 text-xs font-mono break-words opacity-80">{problem.detail}</p>}
            <button type="button" onClick={checkHealth} disabled={checking} className={`${btn.secondary} mt-2 !h-11`}>
              <RefreshCw size={16} className={checking ? 'animate-spin' : ''} /> {checking ? 'Checking…' : 'Retry'}
            </button>
          </div>
          <button type="button" onClick={() => setDismissed(true)} className={btn.icon} aria-label="Hide connection notice">
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

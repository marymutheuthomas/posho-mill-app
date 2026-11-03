import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ShieldAlert, Lock, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SECTION_TITLE, btn } from '../lib/ui';
import { usePendingExceptions, type ExceptionType } from '../hooks/useAuditExceptions';

const TYPE_LABEL: Record<ExceptionType, string> = {
  INVENTORY_DRIFT: 'Inventory drift',
  POWER_YIELD_MISMATCH: 'Power / yield mismatch',
  UNMETERED_TRANSACTION: 'Un-metered transaction',
};

export default function AnomalyQueue({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const { data = [], isLoading, error } = usePendingExceptions(isAdmin);

  const approve = useMutation({
    mutationFn: async (id: string) => {
      if (!navigator.onLine) throw new Error('Approving needs an internet connection.');
      const { data: { session } } = await supabase.auth.getSession();
      const adminId = session?.user?.id;
      if (!adminId) throw new Error('Sign in online as an admin to approve.');
      const { data, error } = await supabase.from('audit_exceptions')
        .update({ status: 'APPROVED', approved_by: adminId, approved_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'PENDING_ADMIN_APPROVAL') // never re-approve or overwrite an earlier approval
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not approved: it was already approved, or your account is not an admin.');
    },
    onSuccess: () => {
      setFlash({ ok: true, text: 'Exception approved and locked.' });
      queryClient.invalidateQueries({ queryKey: ['audit-exceptions'] });
    },
    onError: (err: Error) => setFlash({ ok: false, text: err.message }),
  });

  const missingTable = (error as { code?: string } | null)?.code === 'PGRST205' || (error as { code?: string } | null)?.code === '42P01';
  const critical = data.filter(e => e.severity === 'CRITICAL').length;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 space-y-3" aria-labelledby="anomaly-queue-title">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert size={20} className="text-brand" />
          <h2 id="anomaly-queue-title" className={`${SECTION_TITLE} text-slate-900`}>Anomaly review queue</h2>
        </div>
        {data.length > 0 && (
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {data.length} pending{critical > 0 && <span className="text-red-700"> · {critical} critical</span>}
          </p>
        )}
      </header>

      {flash && (
        <p role="status" className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium ${flash.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {flash.ok ? <CheckCircle size={16} /> : <AlertTriangle size={16} />} {flash.text}
        </p>
      )}

      {isLoading ? (
        <div className="h-24 rounded-xl bg-slate-50 animate-pulse" aria-busy="true" />
      ) : error ? (
        <p role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          {missingTable
            ? 'The audit_exceptions table is not in the database yet. Run migration 20261105000000_audit_exceptions.sql.'
            : `Could not load the queue: ${(error as Error).message}`}
        </p>
      ) : data.length === 0 ? (
        <p className="p-4 rounded-xl bg-slate-50 text-sm text-slate-500 text-center">No exceptions waiting for review.</p>
      ) : (
        <ul className="space-y-2">
          {data.map(ex => {
            const when = ex.effective_time || ex.created_at;
            const recorder = Array.isArray(ex.recorder) ? ex.recorder[0]?.username : ex.recorder?.username;
            const isCritical = ex.severity === 'CRITICAL';
            return (
              <li key={ex.id} className={`rounded-xl border p-3 flex flex-col md:flex-row md:items-center gap-3 ${isCritical ? 'border-red-300 bg-red-50/50' : 'border-amber-200 bg-amber-50/40'}`}>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${isCritical ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
                      {ex.severity}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{TYPE_LABEL[ex.exception_type] ?? ex.exception_type}</span>
                    <span className="font-mono text-xs text-slate-500">{format(new Date(when), 'd MMM yyyy, HH:mm')}</span>
                  </div>
                  <p className="text-sm text-slate-700">{ex.description}</p>
                  {recorder && <p className="text-xs text-slate-500">Recorded by {recorder}</p>}
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => { setFlash(null); approve.mutate(ex.id); }}
                    disabled={approve.isPending && approve.variables === ex.id}
                    className={`${btn.primary} md:w-auto w-full shrink-0`}
                  >
                    <Lock size={16} /> {approve.isPending && approve.variables === ex.id ? 'Approving…' : 'Approve & Lock'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

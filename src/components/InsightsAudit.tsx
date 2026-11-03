import { useState } from 'react';
import { format } from 'date-fns';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import AnomalyQueue from './AnomalyQueue';
import { usePendingExceptions } from '../hooks/useAuditExceptions';
import StockDiscrepancyMatrix from './StockDiscrepancyMatrix';
import LedgerStream from './LedgerStream';
import MasterDashboard from './MasterDashboard';
import { presetRange, type RangePreset, type DayRange } from '../hooks/useDashboardMetrics';
import { FIELD, FIELD_LABEL, chip } from '../lib/ui';

type Section = 'audit' | 'financials';

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'custom', label: 'Custom' },
];
const toInput = (d: Date) => format(d, 'yyyy-MM-dd');
const fromInput = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };

/**
 * Insights & Audit: the loss-prevention desk (exception queue, physical count discrepancies,
 * inventory ledger) and the existing financial insights, as two sections of one page.
 */
export default function InsightsAudit({ role }: { role?: string | null }) {
  const isAdmin = role === 'ADMIN';
  const [section, setSection] = useState<Section>('audit');
  const [preset, setPreset] = useState<RangePreset>('week');
  const [range, setRange] = useState<DayRange>(() => presetRange('week'));
  const { data: pending = [] } = usePendingExceptions(isAdmin);
  const critical = pending.filter(e => e.severity === 'CRITICAL').length;

  const choosePreset = (p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ShieldCheck size={24} className="text-brand" /> Insights &amp; Audit
          </h1>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Loss prevention and operator accountability</p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto" role="tablist" aria-label="Section">
          <button type="button" role="tab" aria-selected={section === 'audit'} className={chip(section === 'audit')} onClick={() => setSection('audit')}>Audit desk</button>
          <button type="button" role="tab" aria-selected={section === 'financials'} className={chip(section === 'financials')} onClick={() => setSection('financials')}>Financials</button>
        </div>
      </div>

      {/* Soft warning only: nothing in the app is blocked while exceptions wait */}
      {pending.length > 0 && (
        <button type="button" onClick={() => setSection('audit')}
          className={`w-full text-left flex items-center gap-2 p-3 min-h-11 rounded-xl border text-sm font-medium ${critical > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            <span className="font-mono font-semibold">{pending.length}</span> exception{pending.length === 1 ? '' : 's'} waiting for review
            {critical > 0 && <>, <span className="font-mono font-semibold">{critical}</span> critical</>}. Work carries on as normal.
          </span>
        </button>
      )}

      {section === 'financials' ? (
        <div className="-mx-4 md:-mx-6"><MasterDashboard /></div>
      ) : (
        <div className="space-y-4">
          <AnomalyQueue isAdmin={isAdmin} />

          <div className="bg-white border border-slate-200 rounded-2xl p-3 md:p-4 flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="lg:flex-1">
              <p className={FIELD_LABEL}>Period for counts and ledger</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESETS.map(p => (
                  <button key={p.id} type="button" onClick={() => choosePreset(p.id)} className={chip(preset === p.id)} aria-pressed={preset === p.id}>{p.label}</button>
                ))}
              </div>
            </div>
            {preset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 lg:w-[360px]">
                <div>
                  <label htmlFor="audit-from" className={FIELD_LABEL}>From</label>
                  <input id="audit-from" type="date" className={FIELD} value={toInput(range.start)} max={toInput(range.end)}
                    onChange={e => e.target.value && setRange(r => ({ ...r, start: fromInput(e.target.value) }))} />
                </div>
                <div>
                  <label htmlFor="audit-to" className={FIELD_LABEL}>To</label>
                  <input id="audit-to" type="date" className={FIELD} value={toInput(range.end)} min={toInput(range.start)}
                    onChange={e => e.target.value && setRange(r => ({ ...r, end: fromInput(e.target.value) }))} />
                </div>
              </div>
            )}
          </div>

          <StockDiscrepancyMatrix range={range} />
          <LedgerStream range={range} />
        </div>
      )}
    </div>
  );
}

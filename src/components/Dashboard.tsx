import { useState } from 'react';
import { format } from 'date-fns';
import { TrendingUp, Activity, Scale, Zap, Wallet, AlertTriangle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DeadLetterQueue from './DeadLetterQueue';
import {
  useDashboardMetrics, presetRange, KWH_PER_KG_TARGET,
  type RangePreset, type DayRange, type ProductLine,
} from '../hooks/useDashboardMetrics';
import { FIELD, FIELD_NUM, FIELD_LABEL, SECTION_TITLE, btn, chip } from '../lib/ui';

interface DashboardProps {
  onNavigate?: (tab: string) => void;
  role?: string | null;
  isOnline?: boolean;
  pendingCount?: number;
}

const ksh = (v: number) => `KSh ${Math.round(v || 0).toLocaleString('en-KE')}`;
const kg = (v: number) => `${(v || 0).toLocaleString('en-KE', { maximumFractionDigits: 1 })} kg`;
const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'custom', label: 'Custom' },
];

const toInput = (d: Date) => format(d, 'yyyy-MM-dd');
const fromInput = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };

export default function Dashboard({ role = 'EMPLOYEE', isOnline = true, pendingCount = 0 }: DashboardProps = {}) {
  const [preset, setPreset] = useState<RangePreset>('today');
  const [range, setRange] = useState<DayRange>(() => presetRange('today'));
  const [cashDropOpen, setCashDropOpen] = useState(false);

  const { data: m, isLoading, isFetching, error } = useDashboardMetrics(range);

  const choosePreset = (p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };

  const rangeLabel = toInput(range.start) === toInput(range.end)
    ? format(range.start, 'EEE d MMM yyyy')
    : `${format(range.start, 'd MMM')} – ${format(range.end, 'd MMM yyyy')}`;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">

      {/* ── Title + sync status ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sales, milling and production · {rangeLabel}</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wider ${
          !isOnline ? 'bg-red-50 border-red-200 text-red-700' : pendingCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
          <span className={`w-2 h-2 rounded-full ${!isOnline ? 'bg-red-500' : pendingCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {!isOnline ? 'Offline' : pendingCount > 0 ? `${pendingCount} waiting to sync` : 'Synced'}
        </div>
      </div>

      {role === 'ADMIN' && <DeadLetterQueue />}

      {/* ── Date range ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 md:p-4 flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:flex-1">
          {PRESETS.map(p => (
            <button key={p.id} type="button" onClick={() => choosePreset(p.id)} className={chip(preset === p.id)} aria-pressed={preset === p.id}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2 lg:w-[360px]">
            <div>
              <label htmlFor="range-from" className={FIELD_LABEL}>From</label>
              <input id="range-from" type="date" className={FIELD} value={toInput(range.start)} max={toInput(range.end)}
                onChange={e => e.target.value && setRange(r => ({ ...r, start: fromInput(e.target.value) }))} />
            </div>
            <div>
              <label htmlFor="range-to" className={FIELD_LABEL}>To</label>
              <input id="range-to" type="date" className={FIELD} value={toInput(range.end)} min={toInput(range.start)}
                onChange={e => e.target.value && setRange(r => ({ ...r, end: fromInput(e.target.value) }))} />
            </div>
          </div>
        )}
        {isFetching && <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 lg:pb-3">Updating…</span>}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{isOnline ? `Could not load the figures: ${(error as Error).message}` : 'You are offline. Figures load when the connection returns.'}</span>
        </div>
      )}

      {isLoading && !m ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" aria-busy="true">
          {[0, 1, 2].map(i => <div key={i} className="h-80 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}
        </div>
      ) : m && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{/* cards stretch to the tallest one */}

          {/* ── Pillar 1: Retail sales ── */}
          <Pillar title="Retail Sales" subtitle="Products sold over the counter" icon={TrendingUp}>
            <Stat label="Total inflow (cash + M-Pesa)" value={ksh(m.retail.inflow)} big />
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Cash" value={ksh(m.retail.cash)} />
              <Stat label="M-Pesa" value={ksh(m.retail.mpesa)} />
              <Stat label="Sales value" value={ksh(m.retail.revenue)} />
              <Stat label="Sold" value={kg(m.retail.kg)} />
            </div>
            <ProductTable lines={m.retail.lines} moneyLabel="Revenue" empty="No retail sales in this period" />
            <button type="button" onClick={() => setCashDropOpen(true)} className={`${btn.secondary} w-full mt-auto`}>
              <Wallet size={16} /> Log cash drop
            </button>
          </Pillar>

          {/* ── Pillar 2: External milling ── */}
          <Pillar title="External Milling" subtitle="Customers' grain milled for a fee" icon={Activity}>
            <Stat label="Milling revenue" value={ksh(m.milling.revenue)} big />
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Grain milled" value={kg(m.milling.kg)} />
              <Stat label="Jobs" value={m.milling.count.toLocaleString()} />
            </div>
            <ProductTable lines={m.milling.lines} moneyLabel="Fees" empty="No milling jobs in this period" />
          </Pillar>

          {/* ── Pillar 3: Internal production + power efficiency ── */}
          <Pillar title="Internal Production" subtitle="Own maize milled into flour" icon={Scale}>
            <Stat label="Flour produced (main output)" value={kg(m.internal.outputKg)} big />
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Maize milled (input)" value={kg(m.internal.inputKg)} />
              <Stat label="By-products" value={kg(m.internal.byproductKg)} />
              <Stat label="Production runs" value={m.internal.runs.toLocaleString()} />
              <Stat label="Yield" value={m.internal.inputKg > 0 ? `${((m.internal.outputKg / m.internal.inputKg) * 100).toFixed(1)}%` : '—'} />
            </div>
            <PowerCard power={m.power} />
          </Pillar>
        </div>
      )}

      {cashDropOpen && <CashDropModal onClose={() => setCashDropOpen(false)} />}
    </div>
  );
}

// ——— Building blocks ————————————————————————————————————————————————————————————

function Pillar({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: typeof Zap; children: React.ReactNode }) {
  return (
    <section className="h-full bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 flex flex-col gap-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className={`${SECTION_TITLE} text-slate-900`}>{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <Icon size={20} className="text-brand shrink-0" />
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`rounded-xl border border-slate-100 bg-slate-50 ${big ? 'p-3' : 'px-3 py-2'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`font-mono font-semibold text-slate-900 ${big ? 'text-2xl mt-0.5' : 'text-base'}`}>{value}</p>
    </div>
  );
}

function ProductTable({ lines, moneyLabel, empty }: { lines: ProductLine[]; moneyLabel: string; empty: string }) {
  if (lines.length === 0) return <p className="text-xs text-slate-400 italic px-1 py-3">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2 text-right">Kg</th>
            <th className="px-3 py-2 text-right">{moneyLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map(l => (
            <tr key={l.productId}>
              <td className="px-3 py-2 font-medium text-slate-700">{l.name}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-600 whitespace-nowrap">{l.kg.toLocaleString('en-KE', { maximumFractionDigits: 1 })}</td>
              <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">{ksh(l.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PowerCard({ power }: { power: NonNullable<ReturnType<typeof useDashboardMetrics>['data']>['power'] }) {
  const ratio = power.kwhPerKg;
  const status = ratio == null ? 'none' : ratio <= KWH_PER_KG_TARGET ? 'good' : 'high';
  return (
    <div className={`mt-auto rounded-xl border p-3 ${status === 'high' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
          <Zap size={14} className="text-brand" /> Power efficiency · whole mill
        </p>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
          status === 'good' ? 'bg-emerald-100 text-emerald-800' : status === 'high' ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>
          {status === 'good' ? 'On target' : status === 'high' ? 'Above target' : 'No data'}
        </span>
      </div>
      <p className="font-mono text-3xl font-semibold text-slate-900 mt-1">
        {ratio == null ? '—' : ratio.toFixed(3)} <span className="text-sm text-slate-500">kWh/kg</span>
      </p>
      <p className="font-mono text-xs text-slate-600 mt-1">
        {power.kwh.toLocaleString('en-KE', { maximumFractionDigits: 1 })} kWh ÷ {power.kgProcessed.toLocaleString('en-KE', { maximumFractionDigits: 1 })} kg milled
      </p>
      <p className="text-[11px] text-slate-500 mt-1">
        Target ≤ {KWH_PER_KG_TARGET} kWh/kg · {power.sessionsMetered} metered session{power.sessionsMetered === 1 ? '' : 's'}
        {power.sessionsOpen > 0 && ` · ${power.sessionsOpen} still open (not counted until closed)`}
      </p>
    </div>
  );
}

function CashDropModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ cash: '', mpesa: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('daily_audits').insert([{
        audit_date: format(new Date(), 'yyyy-MM-dd'),
        actual_cash_collected: (parseFloat(form.cash) || 0) + (parseFloat(form.mpesa) || 0),
        recorded_by: user?.id || null,
      }]);
      if (error) throw error;
      setMessage({ ok: true, text: 'Cash drop logged.' });
      setTimeout(onClose, 1200);
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message || 'Could not log the cash drop.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cash-drop-title">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 bg-brand text-white flex items-center justify-between">
          <h3 id="cash-drop-title" className={`${SECTION_TITLE} text-white flex items-center gap-2`}><Wallet size={20} /> Log cash drop</h3>
          <button type="button" onClick={onClose} aria-label="Close" className={btn.iconOnDark}><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {message && (
            <p role="status" className={`p-3 rounded-xl text-sm font-medium border ${message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{message.text}</p>
          )}
          <div>
            <label htmlFor="drop-cash" className={FIELD_LABEL}>Physical cash (KSh)</label>
            <input id="drop-cash" type="number" required min="0" step="1" placeholder="0" className={FIELD_NUM}
              value={form.cash} onChange={e => setForm({ ...form, cash: e.target.value })} />
          </div>
          <div>
            <label htmlFor="drop-mpesa" className={FIELD_LABEL}>M-Pesa collected (KSh)</label>
            <input id="drop-mpesa" type="number" required min="0" step="1" placeholder="0" className={FIELD_NUM}
              value={form.mpesa} onChange={e => setForm({ ...form, mpesa: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={`${btn.secondary} flex-1`}>Cancel</button>
            <button type="submit" disabled={saving} className={`${btn.confirm} flex-[2]`}>{saving ? 'Saving…' : 'Submit cash drop'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

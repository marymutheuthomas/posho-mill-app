import { ShieldAlert } from 'lucide-react';
import type { CustomerWithLedger } from '../hooks/useCustomers';
import { AGING_DUE_AFTER_DAYS, AGING_OVERDUE_AFTER_DAYS } from '../lib/customerLedger';

const ksh = (n: number) => `KSh ${Math.round(n).toLocaleString('en-KE')}`;

// Lifetime receivables split into age buckets (oldest debt is settled first by payments).
export default function DebtAging({ customers }: { customers: CustomerWithLedger[] }) {
  const owing = customers
    .filter(c => c.balance > 0.004)
    .sort((a, b) => b.aging.overdue - a.aging.overdue || b.aging.due - a.aging.due || b.balance - a.balance);

  const sum = (k: 'current' | 'due' | 'overdue') => owing.reduce((s, c) => s + c.aging[k], 0);
  const buckets = [
    { label: `Current 0–${AGING_DUE_AFTER_DAYS}d`, value: sum('current'), count: owing.filter(c => c.risk === 'current').length, tone: 'text-brand', bar: 'bg-brand' },
    { label: `Due ${AGING_DUE_AFTER_DAYS + 1}–${AGING_OVERDUE_AFTER_DAYS}d`, value: sum('due'), count: owing.filter(c => c.risk === 'due').length, tone: 'text-amber-600', bar: 'bg-amber-500' },
    { label: `Overdue ${AGING_OVERDUE_AFTER_DAYS}d+`, value: sum('overdue'), count: owing.filter(c => c.risk === 'overdue').length, tone: 'text-red-600', bar: 'bg-red-500' },
  ];
  const total = buckets.reduce((s, b) => s + b.value, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col h-[420px] overflow-hidden">
      <div className="p-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-black text-brand uppercase tracking-tight">Debt Aging</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Lifetime · {owing.length} owing · {ksh(total)}</p>
          </div>
          <ShieldAlert className="text-accent" size={18} />
        </div>
        {total > 0 && (
          <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 mb-2">
            {buckets.map(b => <div key={b.label} className={b.bar} style={{ width: `${(b.value / total) * 100}%` }} />)}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {buckets.map(b => (
            <div key={b.label}>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{b.label}</p>
              <p className={`text-xs font-mono font-bold ${b.value ? b.tone : 'text-slate-300'}`}>{ksh(b.value)}</p>
              <p className="text-[9px] text-slate-400">{b.count} customer{b.count === 1 ? '' : 's'}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <tr><th className="px-4 py-2">Customer</th><th className="px-4 py-2 text-right">Balance</th><th className="px-4 py-2 text-right">Overdue</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {owing.length ? owing.map(c => (
              <tr key={c.id} className={c.risk === 'overdue' ? 'bg-red-50/50' : c.risk === 'due' ? 'bg-amber-50/40' : ''}>
                <td className="px-4 py-2">
                  <p className={`text-[11px] font-medium uppercase truncate ${c.risk === 'overdue' ? 'text-red-800' : 'text-slate-700'}`}>{c.name}</p>
                  <p className="text-[9px] text-slate-400 font-mono">{c.aging.oldestOpenDays ?? 0}d oldest{c.phone ? ` · ${c.phone}` : ''}</p>
                </td>
                <td className="px-4 py-2 text-right text-[11px] font-mono text-slate-700">{ksh(c.balance)}</td>
                <td className={`px-4 py-2 text-right text-[11px] font-mono ${c.aging.overdue ? 'font-bold text-red-600' : c.aging.due ? 'text-amber-600' : 'text-slate-300'}`}>
                  {c.aging.overdue ? ksh(c.aging.overdue) : c.aging.due ? `${ksh(c.aging.due)} due` : '—'}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={3} className="px-4 py-12 text-center text-[11px] font-bold text-slate-300 uppercase tracking-widest italic">No outstanding debt</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

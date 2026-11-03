import { useMemo, useState } from 'react';
import { Users, Plus, Search, X, Wallet, FileDown, Pencil, Save, CloudOff, AlertTriangle, CheckCircle } from 'lucide-react';
import { useCustomers, useCustomerMutations, type CustomerWithLedger } from '../hooks/useCustomers';
import { useMillingSession } from '../hooks/useMillingSession';
import { buildStatement, creditCheck, type Risk } from '../lib/customerLedger';
import { generateCustomerStatementPDF } from '../lib/pdfGenerator';

const ksh = (n: number) => `KSh ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateOnly = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const RISK: Record<Risk, { label: string; badge: string }> = {
  overdue: { label: 'Overdue', badge: 'bg-red-100 text-red-700 border-red-200' },
  due:     { label: 'Due',     badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  current: { label: 'Current', badge: 'bg-brand-soft text-brand border-blue-100' },
  clear:   { label: 'Clear',   badge: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
};

type Filter = 'all' | 'owing' | 'overdue' | 'near-limit';
type FormState = { name: string; phone: string; location: string; kra_pin: string; credit_limit: string; notes: string };
const EMPTY_FORM: FormState = { name: '', phone: '', location: '', kra_pin: '', credit_limit: '0', notes: '' };

export default function Customers({ role }: { role: 'ADMIN' | 'EMPLOYEE' }) {
  const isAdmin = role === 'ADMIN';
  const { customers, byId, isLoading, error } = useCustomers();
  const { createCustomer, updateCustomer, recordRepayment, repaying } = useCustomerMutations();
  const { activeSession } = useMillingSession();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [payment, setPayment] = useState({ amount: '', method: 'Cash' as 'Cash' | 'M-Pesa' | 'Bank', notes: '' });
  const [range, setRange] = useState(() => {
    const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30);
    return { from: dateOnly(from), to: dateOnly(to) };
  });

  const flash = (tone: 'ok' | 'error', text: string) => { setMessage({ tone, text }); setTimeout(() => setMessage(null), 4000); };
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  const totals = useMemo(() => ({
    owed: customers.reduce((s, c) => s + Math.max(0, c.balance), 0),
    owing: customers.filter(c => c.balance > 0).length,
    overdue: customers.reduce((s, c) => s + c.aging.overdue, 0),
    overdueCount: customers.filter(c => c.risk === 'overdue').length,
  }), [customers]);

  const visible = customers.filter(c => {
    const q = search.trim().toLowerCase();
    if (q && !(c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.location || '').toLowerCase().includes(q))) return false;
    if (filter === 'owing') return c.balance > 0;
    if (filter === 'overdue') return c.risk === 'overdue';
    if (filter === 'near-limit') return ['near', 'over'].includes(creditCheck(c.balance, c.credit_limit).level);
    return true;
  });

  // Soft duplicate check: same phone or same name already in the directory
  const duplicate = (f: FormState, ignoreId?: string) => {
    const name = f.name.trim().toLowerCase(), phone = f.phone.trim();
    return customers.find(c => c.id !== ignoreId && ((phone && c.phone === phone) || c.name.trim().toLowerCase() === name));
  };

  const toPayload = (f: FormState) => ({
    name: f.name.trim(),
    phone: f.phone.trim() || null,
    location: f.location.trim() || null,
    kra_pin: f.kra_pin.trim().toUpperCase() || null,
    notes: f.notes.trim() || null,
    ...(isAdmin ? { credit_limit: Math.max(0, Number(f.credit_limit) || 0) } : {}),
  });

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return flash('error', 'Customer name is required.');
    createCustomer.mutate(toPayload(form), {
      onSuccess: (res) => { flash('ok', res.offline ? 'Customer saved offline. It will sync when back online.' : 'Customer added.'); setAdding(false); setForm(EMPTY_FORM); },
      onError: (err: any) => flash('error', err.message || 'Could not add customer.'),
    });
  };

  const startEdit = (c: CustomerWithLedger) => {
    setForm({ name: c.name, phone: c.phone || '', location: c.location || '', kra_pin: c.kra_pin || '', credit_limit: String(c.credit_limit || 0), notes: c.notes || '' });
    setEditing(true);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!form.name.trim()) return flash('error', 'Customer name is required.');
    updateCustomer.mutate({ id: selected.id, ...toPayload(form) }, {
      onSuccess: (res) => { flash('ok', res.offline ? 'Changes saved offline.' : 'Customer updated.'); setEditing(false); },
      onError: (err: any) => flash('error', err.message || 'Could not update customer.'),
    });
  };

  const submitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const amount = Math.round((Number(payment.amount) || 0) * 100) / 100;
    if (amount <= 0) return flash('error', 'Enter a payment amount greater than 0.');
    recordRepayment({ customer_id: selected.id, amount, method: payment.method, notes: payment.notes.trim() }, {
      onSuccess: (res) => { flash('ok', `${ksh(amount)} recorded${res.offline ? ' offline (will sync)' : ''}.`); setPayment({ amount: '', method: payment.method, notes: '' }); },
      onError: (err: any) => flash('error', err.message || 'Could not record payment.'),
    });
  };

  const statement = useMemo(() => {
    if (!selected) return null;
    const from = new Date(`${range.from}T00:00:00`), to = new Date(`${range.to}T23:59:59.999`);
    return { from, to, ...buildStatement(selected.entries, from, to) };
  }, [selected, range]);

  const inputClass = 'mill-input w-full text-sm';
  const label = 'block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1';

  // Plain render function, not a nested component: a nested component remounts on every
  // keystroke and the inputs lose focus.
  const renderProfileFields = (f: FormState, set: (f: FormState) => void, ignoreId?: string) => {
    const dup = f.name.trim() ? duplicate(f, ignoreId) : undefined;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className={label}>Name *</label><input required className={inputClass} value={f.name} onChange={e => set({ ...f, name: e.target.value })} /></div>
        <div><label className={label}>Phone</label><input className={inputClass} inputMode="tel" value={f.phone} onChange={e => set({ ...f, phone: e.target.value })} placeholder="07XX XXX XXX" /></div>
        <div><label className={label}>Location</label><input className={inputClass} value={f.location} onChange={e => set({ ...f, location: e.target.value })} placeholder="e.g. Kitale market" /></div>
        <div><label className={label}>KRA PIN</label><input className={inputClass} value={f.kra_pin} onChange={e => set({ ...f, kra_pin: e.target.value })} placeholder="A000000000X" /></div>
        <div>
          <label className={label}>Credit limit (KSh){!isAdmin && ' · admin only'}</label>
          <input type="number" min="0" step="1" disabled={!isAdmin} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`} value={f.credit_limit} onChange={e => set({ ...f, credit_limit: e.target.value })} />
        </div>
        <div className="sm:col-span-2"><label className={label}>Notes</label><input className={inputClass} value={f.notes} onChange={e => set({ ...f, notes: e.target.value })} /></div>
        {dup && (
          <p className="sm:col-span-2 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <AlertTriangle size={13} className="shrink-0" /> Possible duplicate: {dup.name}{dup.phone ? ` (${dup.phone})` : ''} is already in the directory.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-3 md:space-y-4">
      {message && (
        <div className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 text-white ${message.tone === 'ok' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {message.tone === 'ok' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}{message.text}
        </div>
      )}

      {/* Header + totals */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="text-brand" size={20} />
          <div>
            <h1 className="text-lg font-black text-brand uppercase tracking-tight">Customers & Debt</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Balances are calculated from sales and payments</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
          <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600">{customers.length} customers</span>
          <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-brand">{totals.owing} owing · {ksh(totals.owed)}</span>
          {totals.overdueCount > 0 && <span className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700">{totals.overdueCount} overdue · {ksh(totals.overdue)}</span>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input className="mill-input w-full pl-9 text-sm" placeholder="Search name, phone or location" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 overflow-x-auto">
          {([['all', 'All'], ['owing', 'Owing'], ['overdue', 'Overdue'], ['near-limit', 'Near limit']] as [Filter, string][]).map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${filter === f ? 'bg-brand text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => { setForm(EMPTY_FORM); setAdding(true); }} className="mill-btn-primary flex items-center justify-center gap-2 text-xs uppercase tracking-widest">
          <Plus size={14} /> Add customer
        </button>
      </div>

      {error && <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">Could not load customers: {(error as any).message}. If this is a new install, the customer migration may not have been run yet.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-4">
        {/* Directory */}
        <div className={`${selected ? 'lg:col-span-2' : 'lg:col-span-5'} bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden`}>
          {isLoading ? (
            <p className="p-10 text-center text-[11px] font-bold text-slate-300 uppercase tracking-widest animate-pulse">Loading customers…</p>
          ) : visible.length === 0 ? (
            <p className="p-10 text-center text-[11px] font-bold text-slate-300 uppercase tracking-widest">{customers.length ? 'No customers match' : 'No customers yet'}</p>
          ) : (
            <div className="divide-y divide-slate-50 max-h-[70vh] overflow-y-auto">
              {visible.map(c => {
                const credit = creditCheck(c.balance, c.credit_limit);
                return (
                  <button key={c.id} onClick={() => { setSelectedId(c.id); setEditing(false); }}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors ${selectedId === c.id ? 'bg-brand-soft' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-slate-800 truncate flex items-center gap-1.5">
                        {c.name}{c.pending && <CloudOff size={11} className="text-amber-500 shrink-0" aria-label="Not synced yet" />}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{[c.phone, c.location].filter(Boolean).join(' · ') || 'No contact details'}</p>
                      {credit.ratio !== null && (
                        <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden" title={`${Math.round(credit.ratio * 100)}% of ${ksh(c.credit_limit)} limit`}>
                          <div className={`h-full ${credit.level === 'over' ? 'bg-red-500' : credit.level === 'near' ? 'bg-amber-500' : 'bg-brand'}`} style={{ width: `${Math.min(100, credit.ratio * 100)}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[12px] font-mono font-bold ${c.balance > 0 ? 'text-slate-800' : c.balance < 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{ksh(c.balance)}</p>
                      <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${RISK[c.risk].badge}`}>{RISK[c.risk].label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail */}
        {selected && statement && (
          <div className="lg:col-span-3 space-y-3">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-base font-black text-brand truncate">{selected.name}</h2>
                  <p className="text-[11px] text-slate-500">{[selected.phone, selected.location, selected.kra_pin && `PIN ${selected.kra_pin}`].filter(Boolean).join(' · ') || 'No contact details'}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!editing && <button onClick={() => startEdit(selected)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-brand" aria-label="Edit customer"><Pencil size={15} /></button>}
                  <button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50" aria-label="Close"><X size={15} /></button>
                </div>
              </div>

              {editing ? (
                <form onSubmit={submitEdit} className="space-y-3">
                  {renderProfileFields(form, setForm, selected.id)}
                  <div className="flex gap-2">
                    <button type="submit" disabled={updateCustomer.isPending} className="mill-btn-primary flex items-center gap-2 text-xs uppercase tracking-widest"><Save size={14} /> Save</button>
                    <button type="button" onClick={() => setEditing(false)} className="px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Balance, limit and aging */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      ['Balance', ksh(selected.balance), selected.balance > 0 ? 'text-slate-900' : 'text-emerald-600'],
                      ['Current 0–14d', ksh(selected.aging.current), 'text-brand'],
                      ['Due 15–30d', ksh(selected.aging.due), selected.aging.due ? 'text-amber-600' : 'text-slate-300'],
                      ['Overdue 30d+', ksh(selected.aging.overdue), selected.aging.overdue ? 'text-red-600' : 'text-slate-300'],
                    ].map(([l, v, tone]) => (
                      <div key={l} className="rounded-lg border border-slate-100 bg-canvas px-3 py-2">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{l}</p>
                        <p className={`text-sm font-mono font-bold ${tone}`}>{v}</p>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const c = creditCheck(selected.balance, selected.credit_limit);
                    if (c.level === 'no-limit') return <p className="mt-2 text-[10px] text-slate-400">No credit limit set{isAdmin ? ' — edit the customer to add one.' : '.'}</p>;
                    return <p className={`mt-2 text-[11px] font-semibold ${c.level === 'over' ? 'text-red-600' : c.level === 'near' ? 'text-amber-700' : 'text-slate-500'}`}>
                      {Math.round((c.ratio || 0) * 100)}% of {ksh(selected.credit_limit)} limit used · {c.headroom! >= 0 ? `${ksh(c.headroom!)} available` : `${ksh(-c.headroom!)} over limit`}
                    </p>;
                  })()}
                </>
              )}
            </div>

            {/* Record payment */}
            <form onSubmit={submitPayment} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-2">
              <h3 className="text-[11px] font-black text-brand uppercase tracking-widest flex items-center gap-2"><Wallet size={14} /> Record payment</h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input type="number" min="0" step="0.01" required placeholder="Amount (KSh)" className={`${inputClass} sm:col-span-1`} value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} />
                <select className={inputClass} value={payment.method} onChange={e => setPayment({ ...payment, method: e.target.value as any })}>
                  <option>Cash</option><option>M-Pesa</option><option>Bank</option>
                </select>
                <input placeholder="Note / M-Pesa code" className={inputClass} value={payment.notes} onChange={e => setPayment({ ...payment, notes: e.target.value })} />
                <button type="submit" disabled={repaying} className="mill-btn-primary text-xs uppercase tracking-widest">Record</button>
              </div>
              <p className={`text-[10px] font-semibold ${activeSession ? 'text-slate-400' : 'text-amber-700'}`}>
                {activeSession
                  ? `Counts in the open ${activeSession.session_type} session's ${payment.method === 'Cash' ? 'cash drawer' : payment.method + ' total'}.`
                  : 'No session is open, so this payment will not be counted in any shift\'s cash drawer.'}
              </p>
            </form>

            {/* Statement */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <h3 className="text-[11px] font-black text-brand uppercase tracking-widest mr-auto">Statement</h3>
                <input type="date" className="mill-input text-xs py-1" value={range.from} max={range.to} onChange={e => setRange({ ...range, from: e.target.value })} />
                <span className="text-slate-300 text-xs">to</span>
                <input type="date" className="mill-input text-xs py-1" value={range.to} min={range.from} onChange={e => setRange({ ...range, to: e.target.value })} />
                <button onClick={() => generateCustomerStatementPDF({ customer: selected, statement, from: statement.from, to: statement.to })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50">
                  <FileDown size={13} /> PDF
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Charge</th><th className="px-3 py-2 text-right">Payment</th><th className="px-3 py-2 text-right">Balance</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-[11px]">
                    <tr className="bg-canvas"><td className="px-3 py-2 text-slate-500">{new Date(statement.from).toLocaleDateString()}</td><td className="px-3 py-2 font-semibold text-slate-600">Opening balance</td><td /><td /><td className="px-3 py-2 text-right font-mono font-bold">{ksh(statement.opening)}</td></tr>
                    {statement.lines.map(l => (
                      <tr key={l.kind + l.id}>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(l.at).toLocaleDateString()}</td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-slate-700">{l.kind === 'sale' ? 'Credit sale' : l.kind === 'repayment' ? `Payment · ${l.method}` : 'Opening adjustment'}</span>
                          <span className="text-slate-400"> {[l.ref, l.detail].filter(Boolean).join(' · ')}</span>
                          {l.pending && <CloudOff size={10} className="inline ml-1 text-amber-500" aria-label="Not synced yet" />}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">{l.amount > 0 ? ksh(l.amount) : ''}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-600">{l.amount < 0 ? ksh(-l.amount) : ''}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">{ksh(l.running)}</td>
                      </tr>
                    ))}
                    {statement.lines.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">No activity in this period</td></tr>}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white text-[11px] font-bold">
                    <tr><td className="px-3 py-2" colSpan={2}>Closing balance</td><td className="px-3 py-2 text-right font-mono">{ksh(statement.charges)}</td><td className="px-3 py-2 text-right font-mono">{ksh(statement.payments)}</td><td className="px-3 py-2 text-right font-mono">{ksh(statement.closing)}</td></tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add customer */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <form onSubmit={submitNew} className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-brand uppercase tracking-widest">Add customer</h3>
              <button type="button" onClick={() => setAdding(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50" aria-label="Close"><X size={16} /></button>
            </div>
            {renderProfileFields(form, setForm)}
            <button type="submit" disabled={createCustomer.isPending} className="mill-btn-primary w-full text-xs uppercase tracking-widest">Save customer</button>
          </form>
        </div>
      )}
    </div>
  );
}

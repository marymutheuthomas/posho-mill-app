import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart } from 'recharts';
import { subDays, startOfMonth, startOfYear, format } from 'date-fns';
import { Wallet, TrendingUp, Box, Users, Zap, ShieldAlert, Activity, Landmark } from 'lucide-react';

const fmt = (v: number) => `KSh ${Number(v || 0).toLocaleString()}`;

function KpiCard({ label, value, icon: Icon, accent = false, alert = false }: any) {
  return (
    <div className={`bg-white rounded-xl border p-5 flex flex-col justify-between min-h-[120px] shadow-sm ${alert ? 'border-[#F59E0B]/40' : 'border-slate-100'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <Icon size={16} className={alert ? 'text-[#F59E0B]' : 'text-slate-300'} />
      </div>
      <p className={`text-2xl font-black font-mono tracking-tighter ${accent ? 'text-emerald-600' : alert ? 'text-[#F59E0B]' : 'text-[#1E3A8A]'}`}>{value}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2"><span className="w-4 h-px bg-slate-300 inline-block" />{children}</p>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center text-[11px] font-bold text-slate-300 uppercase tracking-widest italic">{text}</div>;
}

export default function MasterDashboard() {
  const today = new Date();
  const [start, setStart] = useState(subDays(today, 29));
  const [end, setEnd] = useState(today);
  const [loading, setLoading] = useState(true);

  const [bs, setBs] = useState<any>(null);
  const [pl, setPl] = useState<any[]>([]);
  const [cashFlow, setCashFlow] = useState<any[]>([]);
  const [leakage, setLeakage] = useState<any[]>([]);
  const [intProd, setIntProd] = useState<any[]>([]);
  const [extProd, setExtProd] = useState<any[]>([]);
  const [debtors, setDebtors] = useState<any[]>([]);

  // Static fetches — run once
  useEffect(() => {
    supabase.from('dashboard_balance_sheet').select('*').maybeSingle().then(({ data }) => { if (data) setBs(data); });
    supabase.from('dashboard_credit_risk').select('*').order('outstanding_balance', { ascending: false }).limit(20).then(({ data }) => { if (data) setDebtors(data); });
  }, []);

  // Date-filtered fetches
  useEffect(() => {
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(23, 59, 59, 999);
    const si = s.toISOString(), ei = e.toISOString();

    async function fetchAll() {
      setLoading(true);
      await Promise.all([
        supabase.from('dashboard_monthly_pl').select('*').gte('month_date', si).lte('month_date', ei).order('month_date', { ascending: true })
          .then(({ data }) => {
            if (data) setPl(data.map(r => ({
              ...r,
              display_month: new Date(r.month_date || r.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
              total_expenses: (Number(r.other_operating_expenses) || 0) + (Number(r.direct_power_costs) || 0),
              gross_revenue: Number(r.gross_revenue) || 0,
              net_profit: Number(r.net_profit) || 0,
            })));
          }),
        supabase.from('dashboard_daily_cash_flow').select('*').gte('reconciliation_date', si).lte('reconciliation_date', ei).order('date', { ascending: true }).limit(30)
          .then(({ data }) => { if (data) setCashFlow(data); }),
        supabase.from('dashboard_power_leakage_radar').select('*').gte('audit_date', si).lte('audit_date', ei).limit(8)
          .then(({ data }) => { if (data) setLeakage(data); }),
        supabase.from('dashboard_internal_production').select('*').gte('production_date', si).lte('production_date', ei).limit(6)
          .then(({ data }) => { if (data) setIntProd(data); }),
        supabase.from('dashboard_external_production').select('*').gte('production_date', si).lte('production_date', ei).limit(6)
          .then(({ data }) => { if (data) setExtProd(data); }),
      ]);
      setLoading(false);
    }
    fetchAll();
  }, [start, end]);

  const equity = bs?.total_business_equity ?? bs?.net_worth ?? 0;
  const liquid = bs?.liquid_cash_capital ?? ((Number(bs?.cash_on_hand) || 0) + (Number(bs?.mpesa_balance) || 0));
  const inv = bs?.inventory_asset_value ?? bs?.inventory_valuation ?? 0;
  const ar = bs?.accounts_receivable ?? bs?.total_debt_receivable ?? 0;

  const presets = [
    { label: '7D', fn: () => { setStart(subDays(today, 6)); setEnd(today); } },
    { label: '30D', fn: () => { setStart(subDays(today, 29)); setEnd(today); } },
    { label: 'Month', fn: () => { setStart(startOfMonth(today)); setEnd(today); } },
    { label: 'YTD', fn: () => { setStart(startOfYear(today)); setEnd(today); } },
  ];

  const leakageBadge = (alert: string) => {
    if (alert === 'GHOST MILLING DETECTED') return 'bg-red-50 text-red-600 border-red-200';
    if (alert === 'UNRECORDED PRODUCTION') return 'bg-amber-50 text-amber-600 border-amber-200';
    return 'bg-emerald-50 text-emerald-600 border-emerald-200';
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* ── Sticky Date Bar ── */}
      <div className="sticky top-0 z-30 bg-[#F8FAFC]/95 backdrop-blur border-b border-slate-200 px-4 md:px-8 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {presets.map(p => (
            <button key={p.label} onClick={p.fn}
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-[#1E3A8A] hover:text-white hover:border-[#1E3A8A] transition-all shadow-sm">
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm ml-auto">
          <input type="date" value={format(start, 'yyyy-MM-dd')}
            onChange={e => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setStart(d); }}
            className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer" />
          <span className="text-slate-300 font-bold text-xs">→</span>
          <input type="date" value={format(end, 'yyyy-MM-dd')}
            onChange={e => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setEnd(d); }}
            className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer" />
        </div>
        {loading && <span className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-widest animate-pulse">Syncing...</span>}
      </div>

      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 space-y-6">

        {/* ── Page Title ── */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#1E3A8A] rounded-xl flex items-center justify-center shadow-lg shadow-[#1E3A8A]/20">
            <Landmark className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-[#1E3A8A] tracking-tight uppercase">Master Control Center</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enterprise Intelligence · Financial & Operational</p>
          </div>
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Sync</span>
          </div>
        </div>

        {/* ══ ROW 1: Balance Sheet Snapshot KPIs (Static) ══ */}
        <div>
          <SectionLabel>Financial Snapshot · Live · Not affected by date range</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Business Equity" value={fmt(equity)} icon={TrendingUp} accent />
            <KpiCard label="Liquid Cash Capital" value={fmt(liquid)} icon={Wallet} />
            <KpiCard label="Inventory Asset Value" value={fmt(inv)} icon={Box} />
            <KpiCard label="Accounts Receivable" value={fmt(ar)} icon={Users} alert />
          </div>
        </div>

        {/* ══ ROW 2: P&L + Cash Flow (Date-Filtered) ══ */}
        <div>
          <SectionLabel>Financial Engine · Filtered by Date Range</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* P&L Visualizer */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 flex flex-col h-[380px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">P&L Visualizer</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Profit & Loss Trend</p>
                </div>
                <TrendingUp className="text-slate-200" size={20} />
              </div>
              <div className="flex-1 w-full">
                {pl.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={pl} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="display_month" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} dy={6} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} dx={-4} />
                      <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }} cursor={{ fill: '#f8fafc' }} formatter={(v: any) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '12px' }} iconType="circle" />
                      <Bar dataKey="gross_revenue" name="Revenue" fill="#1E3A8A" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Line type="monotone" dataKey="total_expenses" name="Expenses" stroke="#e11d48" strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} />
                      <Line type="monotone" dataKey="net_profit" name="Net Profit" stroke="#059669" strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : <EmptyState text="No P&L Data" />}
              </div>
            </div>

            {/* Cash Flow Chart */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 flex flex-col h-[380px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">Cash Flow</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Daily Reconciliation</p>
                </div>
                <Wallet className="text-slate-200" size={20} />
              </div>
              <div className="flex-1 w-full">
                {cashFlow.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashFlow} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} dx={-4} />
                      <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #f1f5f9', fontSize: '12px', fontWeight: 'bold' }} cursor={{ fill: '#f8fafc' }} />
                      <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '12px' }} iconType="circle" />
                      <Bar dataKey="revenue" name="Revenue" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="Expenses" fill="#e11d48" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="debt_collected" name="Repaid" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState text="No Cash Flow Data" />}
              </div>
            </div>
          </div>
        </div>

        {/* ══ ROW 3: Operations & Risk ══ */}
        <div>
          <SectionLabel>Operations & Risk Monitor</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Leakage Radar */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col h-[380px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">Anomaly Radar</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Power Leakage · Date Filtered</p>
                </div>
                <Zap className="text-[#F59E0B]" size={18} />
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {leakage.length > 0 ? leakage.map((a, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">{new Date(a.session_date || Date.now()).toLocaleDateString()}</span>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${leakageBadge(a.leakage_alert)}`}>{a.leakage_alert || '—'}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <p className="text-[11px] font-bold text-slate-600">kWh/kg Efficiency</p>
                      <p className="text-base font-black font-mono text-[#1E3A8A]">{Number(a.kwh_per_kg || 0).toFixed(3)}</p>
                    </div>
                  </div>
                )) : <EmptyState text="No Radar Data" />}
              </div>
            </div>

            {/* Production Yield */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col h-[380px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">Production Yield</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Internal & External · Date Filtered</p>
                </div>
                <Activity className="text-slate-200" size={18} />
              </div>
              <div className="flex-1 overflow-y-auto space-y-5">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">Internal</p>
                  <div className="space-y-3">
                    {intProd.length > 0 ? intProd.map((r, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <p className="text-[11px] font-bold text-slate-700 uppercase">{r.product_name || 'Standard'}</p>
                        <div className="text-right">
                          <p className="text-sm font-black font-mono text-[#1E3A8A]">{Number(r.net_output_kg || 0).toLocaleString()} <span className="text-[9px] text-slate-300">KG</span></p>
                          <p className="text-[9px] font-bold text-red-400">Waste: {Number(r.waste_kg || 0).toLocaleString()} KG</p>
                        </div>
                      </div>
                    )) : <p className="text-[10px] text-slate-300 italic">No internal data</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">External Service</p>
                  <div className="space-y-3">
                    {extProd.length > 0 ? extProd.map((r, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-bold text-slate-700 uppercase">Service Yield</p>
                          <p className="text-[9px] font-bold text-slate-400">{new Date(r.session_date).toLocaleDateString()}</p>
                        </div>
                        <p className="text-sm font-black font-mono text-emerald-600">{Number(r.efficiency_score || 0).toFixed(2)}</p>
                      </div>
                    )) : <p className="text-[10px] text-slate-300 italic">No external data</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* High-Risk Debtors */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col h-[380px] overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">High-Risk Debtors</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Lifetime · Not date filtered</p>
                </div>
                <ShieldAlert className="text-[#F59E0B]" size={18} />
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Customer</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Balance</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {debtors.length > 0 ? debtors.map((d, i) => {
                      const hi = d.days_overdue > 14;
                      return (
                        <tr key={i} className={`${hi ? 'bg-red-50/50' : 'hover:bg-slate-50'} transition-colors`}>
                          <td className="px-4 py-2.5"><p className={`text-[11px] font-medium uppercase ${hi ? 'text-red-800' : 'text-slate-750'}`}>{d.customer_name}</p></td>
                          <td className="px-4 py-2.5 text-right"><p className={`text-[11px] font-normal font-mono ${hi ? 'text-red-600' : 'text-slate-600'}`}>KSh {Number(d.outstanding_balance || 0).toLocaleString()}</p></td>
                          <td className="px-4 py-2.5 text-right"><span className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase ${hi ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{d.days_overdue || 0}d</span></td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={3} className="px-4 py-12 text-center text-[11px] font-bold text-slate-300 uppercase tracking-widest italic">No Debtors Found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>

        {/* ══ ROW 4: P&L Ledger Table ══ */}
        {pl.length > 0 && (
          <div>
            <SectionLabel>Income Statement Ledger · Date Filtered</SectionLabel>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Month', 'Revenue', 'COGS', 'Expenses', 'Power', 'Net Profit'].map((h, i) => (
                        <th key={h} className={`px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 ${i > 0 ? 'text-right' : ''} ${h === 'Net Profit' ? 'bg-slate-100 text-slate-900' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pl.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3 text-xs font-medium text-slate-700">{r.display_month}</td>
                        <td className="px-6 py-3 text-xs font-normal font-mono text-emerald-600 text-right">{fmt(r.gross_revenue)}</td>
                        <td className="px-6 py-3 text-xs font-normal font-mono text-rose-500 text-right">{fmt(r.cogs || r.total_purchases || 0)}</td>
                        <td className="px-6 py-3 text-xs font-normal font-mono text-rose-500 text-right">{fmt(r.other_operating_expenses || 0)}</td>
                        <td className="px-6 py-3 text-xs font-normal font-mono text-rose-500 text-right">{fmt(r.direct_power_costs || 0)}</td>
                        <td className="px-6 py-3 text-xs font-semibold font-mono text-right bg-slate-50">
                          <span className={r.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600'}>{fmt(r.net_profit)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

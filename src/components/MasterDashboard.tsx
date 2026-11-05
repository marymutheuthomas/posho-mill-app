import React, { useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart } from 'recharts';
import { subDays, startOfMonth, startOfYear, format } from 'date-fns';
import { Wallet, TrendingUp, Box, Users, Zap, Activity, Landmark, FileText, AlertOctagon } from 'lucide-react';
import { generateManagerPDF } from '../lib/pdfGenerator';
import StockReconciliation from './StockReconciliation';
import DebtAging from './DebtAging';
import { useCustomers } from '../hooks/useCustomers';
import { AGING_OVERDUE_AFTER_DAYS } from '../lib/customerLedger';
import { btn, chip } from '../lib/ui';
import { useFinancials, useFinancialSnapshot, GHOST_MILLING_ALERT } from '../hooks/useFinancials';

const fmt = (v: number) => `KSh ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function KpiCard({ label, value, icon: Icon, accent = false, alert = false }: any) {
  return (
    <div className={`bg-white rounded-xl border p-5 flex flex-col justify-between min-h-[120px] shadow-sm ${alert ? 'border-accent/40' : 'border-slate-100'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <Icon size={16} className={alert ? 'text-accent' : 'text-slate-300'} />
      </div>
      <p className={`text-2xl font-black font-mono tracking-tighter ${accent ? 'text-emerald-600' : alert ? 'text-accent' : 'text-brand'}`}>{value}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2"><span className="w-4 h-px bg-slate-300 inline-block" />{children}</p>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center text-[11px] font-bold text-slate-300 uppercase tracking-widest italic">{text}</div>;
}

export default function MasterDashboard() {
  const today = new Date();
  const [start, setStart] = useState(subDays(today, 29));
  const [end, setEnd] = useState(today);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Computed from live tables (the old dashboard_* views do not exist in the database)
  const { data: snapshot } = useFinancialSnapshot();
  const { data: fin, isFetching: loading } = useFinancials(start, end);
  const pl = fin?.pl ?? [];
  const cashFlow = fin?.cashFlow ?? [];
  const leakage = fin?.leakage ?? [];
  const intProd = fin?.intProd ?? [];
  const extProd = fin?.extProd ?? [];
  const { customers: crm } = useCustomers();
  // Manager PDF keeps its existing credit-risk table shape, now fed from the customer ledger
  const creditRisk = crm.filter(c => c.balance > 0.004).sort((x, y) => y.aging.overdue - x.aging.overdue || y.balance - x.balance).map(c => ({
    customer_name: c.name,
    outstanding_balance: c.balance,
    days_overdue: Math.max(0, (c.aging.oldestOpenDays ?? 0) - AGING_OVERDUE_AFTER_DAYS),
    risk_status: c.risk === 'overdue' ? 'OVERDUE' : c.risk === 'due' ? 'AGING' : 'ACTIVE',
  }));

  // Snapshot (all time). Opening capital and owner withdrawals are not recorded anywhere,
  // so these are what the records support, not a true balance sheet.
  const liquid = snapshot?.net_cash_generated ?? 0;
  const inv    = snapshot?.inventory_asset_value ?? 0;
  const ar     = crm.reduce((sum, c) => sum + Math.max(0, c.balance), 0);
  const equity = liquid + inv + ar;

  const presets = [
    { label: '7D',    fn: () => { setStart(subDays(today, 6));        setEnd(today); } },
    { label: '30D',   fn: () => { setStart(subDays(today, 29));       setEnd(today); } },
    { label: 'Month', fn: () => { setStart(startOfMonth(today));      setEnd(today); } },
    { label: 'YTD',   fn: () => { setStart(startOfYear(today));       setEnd(today); } },
  ];

  // Ghost milling detection
  const ghostMillingDetected = leakage.some(a => a.leakage_alert === GHOST_MILLING_ALERT);

  // Helper: leakage row border
  const leakageRowBg = (alert: string) => {
    if (alert === GHOST_MILLING_ALERT) return 'bg-red-50 border-red-300';
    if (alert?.includes('GHOST') || alert?.includes('CRITICAL')) return 'bg-red-50 border-red-200';
    if (alert?.includes('AGING') || alert?.includes('UNRECORDED') || alert?.includes('HIGH')) return 'bg-amber-50 border-amber-200';
    return 'bg-slate-50 border-slate-100';
  };

  // Helper: efficiency score color
  const effColor = (score: any) => {
    const n = Number(score);
    if (isNaN(n)) return 'text-slate-400';
    if (n < 80) return 'text-amber-600 font-black';
    return 'text-emerald-600';
  };

  const handlePrintPDF = async () => {
    setPdfLoading(true);
    try {
      await generateManagerPDF({
        cashFlow,
        production: intProd,
        extProd,
        creditRisk,
        startDate: start,
        endDate: end,
      });
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-canvas">

      {/* ── Ghost Milling Security Banner ── */}
      {ghostMillingDetected && (
        <div className="sticky top-0 z-40 bg-red-600 text-white px-4 md:px-8 py-3 flex items-center gap-3 animate-pulse shadow-lg shadow-red-900/30">
          <AlertOctagon size={20} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest leading-none">⚠️ Security Alert · Ghost Milling Detected</p>
            <p className="text-[11px] font-semibold text-red-200 mt-0.5 leading-tight">
              One or more sessions registered power consumption with zero KGs logged. Immediate investigation required.
            </p>
          </div>
          <span className="text-[11px] font-black uppercase tracking-widest bg-white/20 px-3 py-1.5 rounded-lg border border-white/30 whitespace-nowrap">
            Review Anomaly Radar ↓
          </span>
        </div>
      )}

      {/* ── Sticky Date Bar ── */}
      <div className="static max-md:transform-none md:sticky md:top-0 z-30 bg-canvas/95 backdrop-blur border-b border-slate-200 px-4 md:px-8 py-3 max-md:p-2 flex flex-wrap items-center gap-3">

        {/* Print Manager Report — prominent champagne gold button */}
        <button
          id="print-manager-report-btn"
          onClick={handlePrintPDF}
          disabled={pdfLoading}
          className={`${btn.secondary} shrink-0`}
          title="Download Manager Report as PDF"
        >
          <FileText size={14} className={pdfLoading ? 'animate-spin' : ''} />
          {pdfLoading ? 'Generating…' : 'Print Manager Report'}
        </button>

        {/* Date preset pills */}
        <div className="flex items-center gap-1.5">
          {presets.map(p => (
            <button key={p.label} onClick={p.fn}
              className={`${chip(false)} !px-3`}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 max-md:gap-1 bg-white border border-slate-200 rounded-xl px-3 py-2 max-md:px-2 max-md:py-1 shadow-sm ml-auto">
          <input type="date" value={format(start, 'yyyy-MM-dd')}
            onChange={e => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setStart(d); }}
            className="text-slate-700 bg-transparent outline-none cursor-pointer" />
          <span className="text-slate-300 font-bold text-xs max-md:text-[11px]">→</span>
          <input type="date" value={format(end, 'yyyy-MM-dd')}
            onChange={e => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setEnd(d); }}
            className="text-slate-700 bg-transparent outline-none cursor-pointer" />
        </div>
        {loading && <span className="text-[11px] font-bold text-accent uppercase tracking-widest animate-pulse">Syncing...</span>}
      </div>

      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 space-y-6">

        {/* ── Page Title ── */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shadow-lg shadow-brand/20">
            <Landmark className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-brand tracking-tight uppercase">Master Control Center</h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Enterprise Intelligence · Financial &amp; Operational</p>
          </div>
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Live Sync</span>
          </div>
        </div>

        {/* ══ ROW 1: Balance Sheet Snapshot KPIs (Static) ══ */}
        <div>
          <SectionLabel>Financial Snapshot · All time · Not affected by date range</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Net Position"               value={fmt(equity)}  icon={TrendingUp} accent />
            <KpiCard label="Net Cash Generated"         value={fmt(liquid)}  icon={Wallet} />
            <KpiCard label="Stock Value (selling price)" value={fmt(inv)}    icon={Box} />
            <KpiCard label="Accounts Receivable"        value={fmt(ar)}      icon={Users} alert />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Net cash = cash and M-Pesa received (sales + repayments) minus purchases and expenses. Net position = net cash + stock value + receivables.
            Opening capital and owner withdrawals are not recorded, so this is not a full balance sheet.
          </p>
        </div>

        {/* ══ ROW 2: P&L + Cash Flow (Date-Filtered) ══ */}
        <div>
          <SectionLabel>Financial Engine · Filtered by Date Range</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* P&L Visualizer */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 flex flex-col h-[380px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h3 className="text-sm font-black text-brand uppercase tracking-tight">P&L Visualizer</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Profit &amp; Loss Trend</p>
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
                  <h3 className="text-sm font-black text-brand uppercase tracking-tight">Cash Flow</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Daily Reconciliation</p>
                </div>
                <Wallet className="text-slate-200" size={20} />
              </div>
              <div className="flex-1 w-full">
                {cashFlow.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashFlow} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="reconciliation_date" tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} tickFormatter={(v) => { const d = new Date(v); return isNaN(d.getTime()) ? v : `${d.getDate()}/${d.getMonth()+1}`; }} />
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
          <SectionLabel>Operations &amp; Risk Monitor</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* ── Anomaly Radar (session-level) ── */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col h-[420px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h3 className="text-sm font-black text-brand uppercase tracking-tight">Anomaly Radar</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Power Leakage · Session Drill-Down</p>
                </div>
                <Zap className="text-accent" size={18} />
              </div>
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {leakage.length > 0 ? leakage.map((a, i) => {
                  const isGhost = a.leakage_alert === GHOST_MILLING_ALERT;
                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-xl border space-y-2 transition-all ${leakageRowBg(a.leakage_alert)} ${isGhost ? 'ring-1 ring-red-400 shadow-sm shadow-red-200' : ''}`}
                    >
                      {/* Session code + alert badge */}
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[11px] font-black font-mono truncate max-w-[100px] ${isGhost ? 'text-red-700' : 'text-slate-600'}`}>
                          {a.session_code || a.session_id || new Date(a.audit_date || Date.now()).toLocaleDateString()}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-black uppercase tracking-widest border shrink-0 ${
                          isGhost ? 'bg-red-100 text-red-700 border-red-300' :
                          a.leakage_alert?.includes('GHOST') ? 'bg-red-50 text-red-600 border-red-200' :
                          (a.leakage_alert?.includes('UNRECORDED') || a.leakage_alert?.includes('HIGH')) ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-emerald-50 text-emerald-600 border-emerald-200'
                        }`}>
                          {isGhost ? '🚨 GHOST MILLING' : a.leakage_alert || 'Normal'}
                        </span>
                      </div>

                      {/* Metrics grid */}
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase">Power kWh</p>
                          <p className={`text-xs font-black font-mono ${isGhost ? 'text-red-600' : 'text-slate-700'}`}>
                            {Number(a.total_power_kwh ?? a.kwh_per_kg ?? 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase">Exp. Cash</p>
                          <p className="text-xs font-black font-mono text-slate-700">
                            {Number(a.expected_money_in ?? 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase">KGs</p>
                          <p className={`text-xs font-black font-mono ${isGhost ? 'text-red-600 animate-pulse' : 'text-slate-700'}`}>
                            {Number(a.total_kgs_processed ?? 0).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }) : <EmptyState text="No Radar Data" />}
              </div>
            </div>

            {/* ── Production Yield (session drill-down tables) ── */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col h-[420px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h3 className="text-sm font-black text-brand uppercase tracking-tight">Production Yield</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Session Drill-Down · Date Filtered</p>
                </div>
                <Activity className="text-slate-200" size={18} />
              </div>
              <div className="flex-1 overflow-y-auto space-y-4">

                {/* Internal sessions */}
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2">Internal Sessions</p>
                  {intProd.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          {['Session', 'KG', 'kWh', 'Cost', 'Eff%'].map(h => (
                            <th key={h} className="pb-1 text-[11px] font-black text-slate-400 uppercase tracking-widest pr-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {intProd.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-1.5 pr-2 text-[11px] font-bold font-mono text-slate-600 truncate max-w-[60px]">{r.session_code || r.session_id || `S${i+1}`}</td>
                            <td className="py-1.5 pr-2 text-[11px] font-bold text-slate-700">{Number(r.kgs_processed || r.net_output_kg || 0).toLocaleString()}</td>
                            <td className="py-1.5 pr-2 text-[11px] font-bold text-slate-700">{Number(r.power_consumed_kwh || 0).toFixed(1)}</td>
                            <td className="py-1.5 pr-2 text-[11px] font-bold text-slate-700">{Number(r.exact_power_cost_ksh || 0).toLocaleString()}</td>
                            <td className={`py-1.5 text-[11px] font-black ${effColor(r.efficiency_score)}`}>
                              {r.efficiency_score != null ? `${Number(r.efficiency_score).toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-[11px] text-slate-300 italic">No internal sessions</p>}
                </div>

                {/* External sessions */}
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2">External Sessions</p>
                  {extProd.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          {['Session', 'KG', 'kWh', 'Cost', 'Eff%'].map(h => (
                            <th key={h} className="pb-1 text-[11px] font-black text-slate-400 uppercase tracking-widest pr-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {extProd.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-1.5 pr-2 text-[11px] font-bold font-mono text-slate-600 truncate max-w-[60px]">{r.session_code || r.session_id || `S${i+1}`}</td>
                            <td className="py-1.5 pr-2 text-[11px] font-bold text-slate-700">{Number(r.kgs_processed || r.total_input_kg || 0).toLocaleString()}</td>
                            <td className="py-1.5 pr-2 text-[11px] font-bold text-slate-700">{Number(r.power_consumed_kwh || 0).toFixed(1)}</td>
                            <td className="py-1.5 pr-2 text-[11px] font-bold text-slate-700">{Number(r.exact_power_cost_ksh || 0).toLocaleString()}</td>
                            <td className={`py-1.5 text-[11px] font-black ${effColor(r.efficiency_score)}`}>
                              {r.efficiency_score != null ? `${Number(r.efficiency_score).toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-[11px] text-slate-300 italic">No external sessions</p>}
                </div>
              </div>
            </div>

            {/* ── Debt Aging (ledger-backed; replaces the stored-balance credit-risk view) ── */}
            <DebtAging customers={crm} />

          </div>
        </div>

        {/* ══ ROW 3b: Stock Reconciliation (Date-Filtered) ══ */}
        <div>
          <SectionLabel>Stock Reconciliation · Date Filtered</SectionLabel>
          <StockReconciliation start={start} end={end} />
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
                        <th key={h} className={`px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 ${i > 0 ? 'text-right' : ''} ${h === 'Net Profit' ? 'bg-slate-100 text-slate-900' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pl.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3 text-xs font-medium text-slate-700">{r.display_month}</td>
                        <td className="px-6 py-3 text-xs font-normal font-mono text-emerald-600 text-right">{fmt(r.gross_revenue)}</td>
                        <td className="px-6 py-3 text-xs font-normal font-mono text-red-500 text-right">{fmt(r.cogs || r.total_purchases || 0)}</td>
                        <td className="px-6 py-3 text-xs font-normal font-mono text-red-500 text-right">{fmt(r.other_operating_expenses || 0)}</td>
                        <td className="px-6 py-3 text-xs font-normal font-mono text-red-500 text-right">{fmt(r.direct_power_costs || 0)}</td>
                        <td className="px-6 py-3 text-xs font-semibold font-mono text-right bg-slate-50">
                          <span className={r.net_profit < 0 ? 'text-red-600' : 'text-emerald-600'}>{fmt(r.net_profit)}</span>
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

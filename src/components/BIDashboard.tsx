import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Activity, TrendingUp, AlertTriangle, Wallet, Zap, ShieldAlert } from 'lucide-react';
import GlobalDateFilter from './GlobalDateFilter';
import { subDays } from 'date-fns';

const fmtKsh = (v: number) => "KSh " + Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function riskBadgeClass(status: string) {
  if (status?.includes('OVERDUE')) return 'bg-red-100 text-red-700 border-red-200';
  if (status?.includes('AGING'))   return 'bg-amber-100 text-amber-700 border-amber-200';
  if (status?.includes('ACTIVE') || status?.includes('CLEARED')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  return 'bg-slate-100 text-slate-500 border-slate-200';
}

export default function BIDashboard() {
  const today = new Date();
  const [startDate, setStartDate] = useState<Date>(subDays(today, 29));
  const [endDate, setEndDate] = useState<Date>(today);
  
  // State for all dashboard views
  const [kpis, setKpis] = useState({
    net_daily_cash_position: 0,
    total_service_revenue: 0,
    total_retail_sales: 0,
    active_ghost_milling_alerts: 0,
  });
  
  const [leakageData, setLeakageData] = useState<any[]>([]);
  const [cashFlowData, setCashFlowData] = useState<any[]>([]);
  const [internalProd, setInternalProd] = useState<any[]>([]);
  const [externalProd, setExternalProd] = useState<any[]>([]);
  const [creditRisk, setCreditRisk] = useState<any[]>([]);
  const [inventoryVelocity, setInventoryVelocity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        const selectedStart = new Date(startDate);
        selectedStart.setHours(0, 0, 0, 0);
        const startIso = selectedStart.toISOString();
        
        const selectedEnd = new Date(endDate);
        selectedEnd.setHours(23, 59, 59, 999);
        const endIso = selectedEnd.toISOString();

        // Fetch Top-Level KPIs (Assuming a dedicated KPI view or aggregate view exists)
        const { data: kpiData } = await supabase.from('dashboard_kpis').select('*').maybeSingle();
        if (kpiData) {
          setKpis(kpiData);
        }

        // Fetch Leakage & Anomaly Radar
        const { data: leakages } = await supabase.from('dashboard_power_leakage_radar').select('*').gte('audit_date', startIso).lte('audit_date', endIso).limit(5);
        if (leakages) setLeakageData(leakages);

        // Fetch Cash Flow Reconciliation
        const { data: cashFlow } = await supabase.from('dashboard_daily_cash_flow').select('*').gte('reconciliation_date', startIso).lte('reconciliation_date', endIso).order('reconciliation_date', { ascending: true }).limit(30);
        if (cashFlow) setCashFlowData(cashFlow);

        // Fetch Production Efficiency
        const { data: intProd } = await supabase.from('dashboard_internal_production').select('*').gte('production_date', startIso).lte('production_date', endIso).limit(5);
        const { data: extProd } = await supabase.from('dashboard_external_production').select('*').gte('production_date', startIso).lte('production_date', endIso).limit(5);
        if (intProd) setInternalProd(intProd);
        if (extProd) setExternalProd(extProd);

        // Fetch High-Risk Debtors (Ignored date filter)
        const { data: risks } = await supabase.from('dashboard_credit_risk').select('*').order('outstanding_balance', { ascending: false }).limit(20);
        if (risks) setCreditRisk(risks);

        // Fetch Inventory Velocity (Ignored date filter)
        const { data: velocity } = await supabase.from('dashboard_inventory_velocity').select('*').order('lifetime_revenue_generated', { ascending: false }).limit(10);
        if (velocity) setInventoryVelocity(velocity);

      } catch (error) {
        console.error("Error fetching BI dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm font-semibold text-slate-400 uppercase tracking-widest animate-pulse">
          Loading Intelligence Terminal...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto p-3.5 md:p-8 space-y-6 bg-slate-50 min-h-screen overflow-x-hidden w-full min-w-0">
      
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Enterprise Intelligence</h1>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Strategic Operations & Financial Control</p>
        </div>
        <div className="px-4 py-2 bg-white rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Live Sync Active</span>
        </div>
      </div>

      <GlobalDateFilter 
        startDate={startDate} 
        endDate={endDate} 
        onChange={(start, end) => {
          setStartDate(start);
          setEndDate(end);
        }} 
      />

      {/* 1. Top-Level KPI Ribbon (Flexbox Row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Net Daily Cash Position */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Net Daily Cash</h3>
            <Wallet className="text-slate-400" size={18} />
          </div>
          <div className="flex flex-col">
            <p className="text-2xl font-bold text-slate-900 tracking-tighter font-mono">
              {fmtKsh(kpis.net_daily_cash_position)}
            </p>
          </div>
        </div>

        {/* Total Service Revenue */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Service Revenue</h3>
            <Activity className="text-slate-400" size={18} />
          </div>
          <div className="flex flex-col">
            <p className="text-2xl font-bold text-slate-900 tracking-tighter font-mono">
              {fmtKsh(kpis.total_service_revenue)}
            </p>
          </div>
        </div>

        {/* Total Retail Sales */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Retail Sales</h3>
            <TrendingUp className="text-slate-400" size={18} />
          </div>
          <div className="flex flex-col">
            <p className="text-2xl font-bold text-slate-900 tracking-tighter font-mono">
              {fmtKsh(kpis.total_retail_sales)}
            </p>
          </div>
        </div>

        {/* Active Ghost Milling Alerts */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghost Alerts</h3>
            <AlertTriangle className={kpis.active_ghost_milling_alerts > 0 ? "text-red-500" : "text-emerald-500"} size={18} />
          </div>
          <div className="flex flex-col">
            <p className={`text-3xl font-bold tracking-tighter font-mono ${kpis.active_ghost_milling_alerts > 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {kpis.active_ghost_milling_alerts}
            </p>
          </div>
        </div>

      </div>

      {/* Macro Layout: 3-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 3. Cash Flow Reconciliation Chart (Grid Span: 2 Columns) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col lg:col-span-2 min-h-[420px]">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Cash Flow Reconciliation</h3>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Dynamic Selected Period</p>
            </div>
          </div>
          <div className="flex-1 w-full h-[300px]">
            {cashFlowData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="reconciliation_date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => { const d = new Date(v); return isNaN(d.getTime()) ? v : `${d.getDate()}/${d.getMonth()+1}`; }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(val) => `KSh ${val.toLocaleString()}`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }} 
                    cursor={{ fill: '#f8fafc' }} 
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '20px' }} iconType="circle" />
                  <Bar dataKey="revenue" name="Revenue" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="debt_collected" name="Debt Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs font-semibold text-slate-400 uppercase tracking-widest">
                No Cash Flow Data Available
              </div>
            )}
          </div>
        </div>

        {/* 2. The Leakage & Anomaly Radar (Grid Span: 1 Column) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col min-h-[420px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Anomaly Radar</h3>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Power Leakage Detection</p>
            </div>
            <Zap className="text-slate-400" size={18} />
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
            {leakageData.length > 0 ? (
              leakageData.map((alert, idx) => {
                let badgeClass = "bg-slate-100 text-slate-600 border-slate-200";
                let textClass = "text-slate-900";
                
                if (alert.leakage_alert === 'GHOST MILLING DETECTED') {
                  badgeClass = "bg-red-50 text-red-600 border-red-200";
                  textClass = "text-red-700";
                } else if (alert.leakage_alert === 'UNRECORDED PRODUCTION') {
                  badgeClass = "bg-amber-50 text-amber-600 border-amber-200";
                  textClass = "text-amber-700";
                } else if (alert.leakage_alert === 'Normal') {
                  badgeClass = "bg-emerald-50 text-emerald-600 border-emerald-200";
                  textClass = "text-slate-900";
                }

                return (
                  <div key={idx} className="flex flex-col p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {new Date(alert.audit_date || Date.now()).toLocaleDateString()}
                      </span>
                      <span className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border ${badgeClass}`}>
                        {alert.leakage_alert || 'Unknown Status'}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <p className={`text-sm font-bold ${textClass}`}>Efficiency Score</p>
                      <p className="text-lg font-black font-mono tracking-tighter">
                        {Number(alert.kwh_per_kg || 0).toFixed(3)} <span className="text-[10px] text-slate-400">kWh/kg</span>
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex items-center justify-center text-xs font-semibold text-slate-400 uppercase tracking-widest">
                No Radar Data Found
              </div>
            )}
          </div>
        </div>

        {/* 4. Production Efficiency Matrix (Grid Span: 1 Column) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6 flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Efficiency Matrix</h3>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Internal vs External Yield</p>
            </div>
            <Activity className="text-slate-400" size={18} />
          </div>

          <div className="flex-1 flex flex-col justify-between space-y-6">
            {/* Internal Yield Section */}
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Internal Production</h4>
              <div className="space-y-3">
                {internalProd.slice(0, 2).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 uppercase">{item.product_name || 'Standard Yield'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono text-slate-900">{(item.net_output_kg || 0).toLocaleString()} <span className="text-[9px] text-slate-400">KG</span></p>
                      <p className="text-[9px] font-bold text-red-400 uppercase">Waste: {(item.waste_kg || 0).toLocaleString()} KG</p>
                    </div>
                  </div>
                ))}
                {internalProd.length === 0 && <p className="text-[10px] font-semibold text-slate-400 italic">No Internal Data</p>}
              </div>
            </div>

            {/* External Service Section */}
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">External Service Power</h4>
              <div className="space-y-3">
                {externalProd.slice(0, 2).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 uppercase">Service Efficiency</p>
                      <p className="text-[9px] font-semibold text-slate-400 uppercase">{item.production_date ? new Date(item.production_date).toLocaleDateString() : '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono text-emerald-600">{(item.efficiency_score || 0).toFixed(2)}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Power vs Yield</p>
                    </div>
                  </div>
                ))}
                {externalProd.length === 0 && <p className="text-[10px] font-semibold text-slate-400 italic">No External Data</p>}
              </div>
            </div>
          </div>
        </div>

        {/* 5. High-Risk Debtors Table (Grid Span: 1 Column) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-[400px] overflow-hidden">
          <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">High-Risk Debtors</h3>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Credit Liability Monitor</p>
            </div>
            <ShieldAlert className="text-slate-400" size={18} />
          </div>
          
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-[9px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100">Customer</th>
                  <th className="px-4 py-2.5 text-[9px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 text-right">Balance</th>
                  <th className="px-4 py-2.5 text-[9px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {creditRisk.map((debtor, idx) => {
                  const isHighRisk = debtor.days_overdue > 14;
                  return (
                    <tr key={idx} className={`${isHighRisk ? 'bg-red-50/50' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className="px-4 py-2.5">
                        <p className={`text-[11px] font-medium uppercase ${isHighRisk ? 'text-red-900' : 'text-slate-700'}`}>
                          {debtor.customer_name}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <p className={`text-[11px] font-normal font-mono ${isHighRisk ? 'text-red-600' : 'text-slate-600'}`}>
                          {fmtKsh(debtor.outstanding_balance)}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${riskBadgeClass(debtor.risk_status)}`}>
                          {debtor.risk_status?.replace(/^[🔴🟡🟢]\s/, '') || `${debtor.days_overdue || 0}d`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {creditRisk.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-xs font-semibold text-slate-400 uppercase tracking-widest italic">
                      No Debtors Found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. Inventory Velocity Leaderboard (Grid Span: 1 Column) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-[400px] overflow-hidden">
          <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Velocity Leaderboard</h3>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">All-Time Inventory Performance</p>
            </div>
            <TrendingUp className="text-slate-400" size={18} />
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-[9px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100">Product (Category)</th>
                  <th className="px-4 py-2.5 text-[9px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 text-right">KGs Sold</th>
                  <th className="px-4 py-2.5 text-[9px] font-black text-slate-450 uppercase tracking-widest border-b border-slate-100 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {inventoryVelocity.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="text-[11px] font-bold text-slate-900 uppercase">{item.product_name}</p>
                      <p className="text-[9px] text-slate-400 uppercase font-semibold">{item.product_category}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] font-semibold text-slate-600">
                      {Number(item.total_lifetime_kg_sold || 0).toLocaleString()} KG
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] font-bold text-emerald-600">
                      {fmtKsh(item.lifetime_revenue_generated || 0)}
                    </td>
                  </tr>
                ))}
                {inventoryVelocity.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-xs font-semibold text-slate-400 uppercase tracking-widest italic">
                      No Inventory Data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  TrendingUp, Wallet, 
  Scale, Calendar
} from 'lucide-react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';
import ErrorBoundary from './ErrorBoundary';

// Register ChartJS Components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend
);

interface AuditStats {
  internal: {
    productionKg: number;
    inputKg: number;
    yieldRate: number;
    wasteKg: number;
    powerUnits: number;
  },
  millingService: {
    revenue: number;
    powerUnits: number;
    efficiency: number; 
  },
  retailSales: {
    revenue: number;
    itemsSold: number;
  },
  financials: {
    cash: number;
    mpesa: number;
    debt: number;
    purchases: number;
    powerCost: number;
    netEarnings: number;
  },
  leakageUnits: number;
}

export default function AuditHub() {
  const isAdmin = true; // In production, this would come from the 'user' prop or Auth Context
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AuditStats | null>(null);

  const [biStats, setBiStats] = useState<any>(null);
  const [plHistory, setPlHistory] = useState<any[]>([]);
  const getLocalYYYYMMDD = () => {
    // Get current date locked to Nairobi timezone
    const d = new Date();
    const nairobiStr = d.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    const nairobiDate = new Date(nairobiStr);
    const offset = nairobiDate.getTimezoneOffset() * 60000;
    return new Date(nairobiDate.getTime() - offset).toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState(getLocalYYYYMMDD());
  const [endDate, setEndDate] = useState(getLocalYYYYMMDD());
  const [preset, setPreset] = useState<'today' | 'week' | 'month'>('today');



  const fetchAuditData = async () => {
    setLoading(true);
    try {
      // Strictly enforce Nairobi midnight bounds to UTC for Supabase
      const sDate = new Date(startDate);
      const startUtc = new Date(sDate.getTime() - (3 * 60 * 60 * 1000)).toISOString();

      const eDate = new Date(endDate);
      eDate.setHours(23, 59, 59, 999);
      const endUtc = new Date(eDate.getTime() - (3 * 60 * 60 * 1000)).toISOString();

      // Fetch production logs for internal yield metrics (kept for kg-level accuracy)
      const [prod, pur, cashFlowRes, leakageRes, intProdRes, extProdRes, plRes] = await Promise.all([
        supabase.from('production_logs').select('input_kg, main_output_kg, waste_kg').gte('created_at', startUtc).lte('created_at', endUtc),
        supabase.from('purchases').select('total_amount, category').gte('created_at', startUtc).lte('created_at', endUtc),
        // Revenue splits, cash, M-Pesa, and debt from pre-aggregated view
        supabase.from('dashboard_daily_cash_flow').select('*').gte('reconciliation_date', startUtc).lte('reconciliation_date', endUtc),
        // Power leakage from dedicated radar view
        supabase.from('dashboard_power_leakage_radar').select('*').gte('audit_date', startUtc).lte('audit_date', endUtc).limit(10),
        // Internal production metrics
        supabase.from('dashboard_internal_production').select('*').gte('production_date', sDate.toISOString().split('T')[0]).lte('production_date', eDate.toISOString().split('T')[0]),
        // External milling service metrics
        supabase.from('dashboard_external_production').select('*').gte('production_date', sDate.toISOString().split('T')[0]).lte('production_date', eDate.toISOString().split('T')[0]),
        // Monthly P&L for net performance margin
        supabase.from('dashboard_monthly_pl').select('*').gte('month_date', startUtc).lte('month_date', endUtc)
      ]);

      // Internal production from production_logs (precise kg-level)
      const intInput = prod.data?.reduce((acc, curr) => acc + Number(curr.input_kg || 0), 0) || 0;
      const intOutput = prod.data?.reduce((acc, curr) => acc + Number(curr.main_output_kg || 0), 0) || 0;
      const intWaste = prod.data?.reduce((acc, curr) => acc + Number(curr.waste_kg || 0), 0) || 0;

      // Revenue splits — sourced directly from dashboard_daily_cash_flow view
      const cashFlowRows = cashFlowRes.data || [];
      const millRev = cashFlowRows.reduce((acc, r) => acc + (Number(r.total_service_revenue) || 0), 0);
      const retailRev = cashFlowRows.reduce((acc, r) => acc + (Number(r.total_retail_revenue) || 0), 0);
      const retailCount = intProdRes.data?.length || 0;

      // Cash/M-Pesa/Debt splits from cash flow view columns
      const revSplitCash = cashFlowRows.reduce((acc, r) => acc + (Number(r.expected_physical_cash) || 0), 0);
      const revSplitMpesa = cashFlowRows.reduce((acc, r) => acc + (Number(r.expected_mpesa_intake) || 0), 0);
      const revSplitDebt = cashFlowRows.reduce((acc, r) => acc + (Number(r.total_new_debt_issued) || 0), 0);
      const totalRepayments = cashFlowRows.reduce((acc, r) => acc + (Number(r.total_debt_collected) || 0), 0);

      // Power — sourced from dashboard_power_leakage_radar view (leakage units)
      const leakageRows = leakageRes.data || [];
      const leakage = leakageRows.reduce((acc, r) => acc + Math.max(0, Number(r.leakage_kwh) || 0), 0);

      // Power units consumed — from external/internal production views
      const extRows = extProdRes.data || [];
      const intRows = intProdRes.data || [];
      const intPower = intRows.reduce((acc, r) => acc + (Number(r.power_consumed_kwh) || 0), 0);
      const extPower = extRows.reduce((acc, r) => acc + (Number(r.power_consumed_kwh) || 0), 0);

      // Power cost and purchases
      const totalPowerCost = cashFlowRows.reduce((acc, r) => acc + (Number(r.total_power_cost) || 0), 0);
      const totalPurchases = pur.data?.filter(c => {
        const cat = (c.category || '').toLowerCase();
        return cat.includes('grain') || cat.includes('stock');
      }).reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0) || 0;

      // Net Profit sourced from dashboard_monthly_pl view
      const netEarnings = (plRes.data || []).reduce((acc, r) => acc + (Number(r.net_profit) || 0), 0);

      setStats({
        internal: {
          productionKg: intOutput,
          inputKg: intInput,
          yieldRate: intInput > 0 ? (intOutput / intInput) * 100 : 0,
          wasteKg: intWaste,
          powerUnits: intPower
        },
        millingService: {
          revenue: millRev,
          powerUnits: extPower,
          efficiency: extPower > 0 ? millRev / extPower : 0
        },
        retailSales: {
          revenue: retailRev,
          itemsSold: retailCount
        },
        financials: {
          cash: revSplitCash,
          mpesa: revSplitMpesa,
          debt: revSplitDebt - totalRepayments,
          purchases: totalPurchases,
          powerCost: totalPowerCost,
          netEarnings
        },
        leakageUnits: leakage
      });

      // BI FETCH (ADMIN ONLY)
      if (isAdmin) {
        const { data: analysisData } = await supabase.from('financial_analysis_view').select('*').maybeSingle();
        setBiStats(analysisData);

        const { data: historyData } = await supabase.from('monthly_pl_summary').select('*').order('month', { ascending: true });
        setPlHistory(historyData || []);
      }
    } catch (err: any) { 
      console.error(err);
      if (err.code === '42501' || err.code === 'PGRST116') {
        // Handled by null stats
      }
    }
    finally { setLoading(false); }
  };


  useEffect(() => { fetchAuditData(); }, [startDate, endDate]);

  const setDatePreset = (p: 'today' | 'week' | 'month') => {
    setPreset(p);
    const today = new Date(); const start = new Date();
    if (p === 'today') { const d = today.toISOString().split('T')[0]; setStartDate(d); setEndDate(d); }
    else if (p === 'week') { start.setDate(today.getDate() - 7); setStartDate(start.toISOString().split('T')[0]); setEndDate(today.toISOString().split('T')[0]); }
    else if (p === 'month') { start.setMonth(today.getMonth() - 1); setStartDate(start.toISOString().split('T')[0]); setEndDate(today.toISOString().split('T')[0]); }
  };

  if (loading) return <div className="p-10 md:p-20 text-center font-semibold text-slate-400 uppercase tracking-widest animate-pulse text-sm md:text-base">Building Financial Reports...</div>;
  if (!stats) return (
    <div className="p-4 md:p-20 text-center space-y-6 md:space-y-10">
      <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
        <Scale size={32} />
      </div>
      <div className="space-y-2">
        <p className="text-red-600 font-semibold uppercase tracking-widest text-xs md:text-sm">Access Restricted</p>
        <p className="text-slate-500 text-[11px] md:text-base max-w-xs mx-auto font-medium uppercase tracking-tight leading-relaxed">Executive Financial Audits and P&L Statements are reserved for Admin oversight.</p>
      </div>
      <div className="mill-card p-6 md:p-12 bg-white border-slate-100 shadow-xl rounded-2xl max-w-sm mx-auto text-left">
         <div className="flex items-center gap-3 mb-6">
            <h3 className="text-[10px] md:text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Inventory Interlock</h3>
         </div>
         <p className="text-[11px] md:text-xs font-medium text-slate-500 leading-relaxed uppercase tracking-tight">
            Revenue metrics are calculated by joining **Sales Registry** with **Production Logs**. Discrepancies may occur if POS transactions aren't matched with yield records.
         </p>
         <button onClick={() => window.print()} className="mt-8 w-full py-4 bg-slate-900 text-white rounded-xl font-semibold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95">
            Export Audit Report
         </button>
      </div>
    </div>
  );


  return (
    <ErrorBoundary>
      <div className="max-w-7xl mx-auto space-y-8 md:space-y-12 pb-24 px-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="space-y-1">
             <h1 className="text-2xl md:text-4xl font-semibold text-slate-900 uppercase tracking-tight">Intelligence Hub</h1>
             <p className="text-[10px] md:text-xs font-medium text-slate-400 uppercase tracking-widest">Financial P&L Oversight</p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-3">
            <div className="flex items-center gap-2 max-md:gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl w-full md:w-auto">
              {(['today', 'week', 'month'] as const).map(p => (
                <button key={p} onClick={() => setDatePreset(p)} className={`flex-1 md:flex-none px-6 py-2 max-md:px-2 max-md:py-1 rounded-lg text-[10px] max-md:text-[10px] font-semibold uppercase tracking-widest transition-all ${preset === p ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>
                  {p}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 max-md:gap-1 w-full md:w-auto">
               <div className="flex-1 md:flex-none flex items-center gap-2 max-md:gap-1 bg-white border border-slate-200 px-3 py-2 max-md:px-1.5 max-md:py-1 rounded-xl shadow-sm">
                  <Calendar size={14} className="text-slate-400" />
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-[11px] max-md:text-[10px] font-semibold text-slate-900 border-none p-0 focus:ring-0 w-full" />
               </div>
               <span className="text-slate-300 font-bold max-md:text-[10px]">→</span>
               <div className="flex-1 md:flex-none flex items-center gap-2 max-md:gap-1 bg-white border border-slate-200 px-3 py-2 max-md:px-1.5 max-md:py-1 rounded-xl shadow-sm">
                  <Calendar size={14} className="text-slate-400" />
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-[11px] max-md:text-[10px] font-semibold text-slate-900 border-none p-0 focus:ring-0 w-full" />
               </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* REPORT 1: INTERNAL PRODUCTION */}
          <div className="mill-card p-6 md:p-10 bg-white border-slate-100 shadow-xl space-y-8 rounded-[2rem]">
             <div className="flex justify-between items-start">
               <div>
                 <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2 tracking-widest">Yield Performance</p>
                 <h3 className="text-3xl md:text-4xl font-semibold text-slate-950 tracking-tighter">{stats.internal.productionKg.toLocaleString()} <span className="text-sm md:text-base text-slate-300 uppercase">KG</span></h3>
               </div>
               <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-lg"><Scale size={20} /></div>
             </div>
             
             <div className="space-y-5 pt-8 border-t border-slate-50">
                <div className="flex justify-between items-center">
                   <p className="text-[10px] font-semibold text-slate-500 uppercase">Total Input</p>
                   <p className="text-base font-semibold text-slate-900 font-mono">{stats.internal.inputKg.toLocaleString()} KG</p>
                </div>
                <div className="flex justify-between items-center">
                   <p className="text-[10px] font-semibold text-slate-500 uppercase">Efficiency</p>
                   <p className="text-base font-semibold text-emerald-600 font-mono">{stats.internal.yieldRate.toFixed(1)}%</p>
                </div>
                <div className="flex justify-between items-center">
                   <p className="text-[10px] font-semibold text-slate-500 uppercase">Net Waste</p>
                   <p className="text-base font-semibold text-red-500 font-mono">{stats.internal.wasteKg.toLocaleString()} KG</p>
                </div>
             </div>
          </div>

          {/* REPORT 2: MILLING SERVICE (EXTERNAL) */}
          <div className="mill-card p-6 md:p-10 bg-white border-slate-100 shadow-xl space-y-8 rounded-[2rem] border-t-8 border-t-blue-600">
             <div className="flex justify-between items-start">
               <div>
                 <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2 tracking-widest">Service Revenue</p>
                 <h3 className="text-3xl md:text-4xl font-semibold text-slate-950 tracking-tighter font-mono"><span className="text-sm md:text-base text-slate-300">KES</span> {stats.millingService.revenue.toLocaleString()}</h3>
               </div>
               <div className="bg-blue-600 text-white p-3 rounded-2xl shadow-lg"><TrendingUp size={20} /></div>
             </div>
             
             <div className="space-y-5 pt-8 border-t border-slate-50">
                <div className="flex justify-between items-center">
                   <p className="text-[10px] font-semibold text-slate-500 uppercase">Power Drain</p>
                   <p className="text-base font-semibold text-slate-900 font-mono">{stats.millingService.powerUnits.toFixed(1)} <span className="text-[10px]">kWh</span></p>
                </div>
                <div className="flex justify-between items-center">
                   <p className="text-[10px] font-semibold text-slate-500 uppercase">Yield/Unit</p>
                   <p className="text-base font-semibold text-blue-600 font-mono">{stats.millingService.efficiency.toFixed(2)}</p>
                </div>
             </div>
          </div>

          {/* REPORT 3: RETAIL PRODUCT SALES */}
          <div className="mill-card p-6 md:p-10 bg-white border-slate-100 shadow-xl space-y-8 rounded-[2rem] border-t-8 border-t-emerald-600">
             <div className="flex justify-between items-start">
               <div>
                 <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2 tracking-widest">Retail Revenue</p>
                 <h3 className="text-3xl md:text-4xl font-semibold text-emerald-600 tracking-tighter font-mono"><span className="text-sm md:text-base text-emerald-200">KES</span> {stats.retailSales.revenue.toLocaleString()}</h3>
               </div>
             </div>
             
             <div className="space-y-5 pt-8 border-t border-slate-50">
                <div className="flex justify-between items-center">
                   <p className="text-[10px] font-semibold text-slate-500 uppercase">Transactions</p>
                   <p className="text-base font-semibold text-slate-900 font-mono">{stats.retailSales.itemsSold}</p>
                </div>
                <div className="flex justify-between items-center">
                   <p className="text-[10px] font-semibold text-slate-500 uppercase">Basket Avg</p>
                   <p className="text-base font-semibold text-slate-900 font-mono">{(stats.retailSales.revenue / (stats.retailSales.itemsSold || 1)).toFixed(0)}</p>
                </div>
             </div>
          </div>
        </div>

        {/* MASTER PROFIT & LOSS (P&L) */}
        <div className="mill-card p-6 md:p-12 bg-white text-slate-900 border-slate-100 shadow-2xl relative overflow-hidden rounded-[2.5rem] border-t-8 border-t-slate-900">
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-10">
             <div className="space-y-6">
               <div className="flex items-center gap-3">
                 <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center shadow-sm">
                   <Wallet className="text-emerald-600" size={24} />
                 </div>
                 <h3 className="text-2xl md:text-5xl font-semibold uppercase tracking-tight text-slate-900">Net Period P&L</h3>
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                 <div className="space-y-1">
                   <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Gross Revenue</p>
                   <p className="text-2xl md:text-3xl font-semibold text-slate-900 font-mono"><span className="text-sm text-slate-300">KES</span> {(stats.millingService.revenue + stats.retailSales.revenue).toLocaleString()}</p>
                 </div>
                 <div className="space-y-1">
                   <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Operating Cost</p>
                   <p className="text-2xl md:text-3xl font-semibold text-red-500 font-mono"><span className="text-sm text-slate-300">KES</span> {(stats.financials.powerCost + stats.financials.purchases).toLocaleString()}</p>
                 </div>
               </div>
             </div>

             <div className="lg:text-right space-y-2">
               <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Net Period Balance</p>
               <h2 className={`text-4xl md:text-7xl font-semibold tracking-tighter leading-none ${stats.financials.netEarnings >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>
                 <span className="text-xl md:text-3xl opacity-40">KES</span> {stats.financials.netEarnings.toLocaleString()}
               </h2>
               <div className="flex items-center lg:justify-end gap-2 mt-4">
                  <span className={`px-4 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest border ${stats.financials.netEarnings >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                    {stats.financials.netEarnings >= 0 ? 'Surplus Operational' : 'Deficit Detected'}
                  </span>
               </div>
             </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 pt-12 mt-12 border-t border-slate-50 relative z-10">
             <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Energy Cost</p>
                <p className="text-xl font-semibold text-slate-900 font-mono">KES {stats.financials.powerCost.toLocaleString()}</p>
             </div>
             <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Inventory Spend</p>
                <p className="text-xl font-semibold text-slate-900 font-mono">KES {stats.financials.purchases.toLocaleString()}</p>
             </div>
             <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Power Leakage</p>
                <p className="text-xl font-semibold text-red-500 font-mono">{stats.leakageUnits.toFixed(2)} <span className="text-xs">kWh</span></p>
             </div>
             <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Floating Debt</p>
                <p className="text-xl font-semibold text-amber-600 font-mono">KES {stats.financials.debt.toLocaleString()}</p>
             </div>
          </div>
        </div>

        {/* BI DEEP DIVE: LIFETIME METRICS & HISTORICAL P&L */}
        {biStats && (
          <div className="space-y-12 pt-12 border-t border-slate-200">
             <div className="flex items-center gap-4">
                <div className="w-1.5 h-10 bg-slate-900 rounded-full" />
                <h3 className="text-2xl font-semibold text-slate-900 uppercase tracking-tighter">Strategic Intelligence (BI)</h3>
             </div>

             <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xl">
                   <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Lifetime Yield</p>
                   <p className="text-xl md:text-3xl font-semibold text-slate-950 font-mono leading-none">{Number(biStats.total_revenue || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xl">
                   <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Energy Drain</p>
                   <p className="text-xl md:text-3xl font-semibold text-red-600 font-mono leading-none">{Number(biStats.total_power_cost || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xl">
                   <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Service Mix</p>
                   <p className="text-xl md:text-3xl font-semibold text-blue-600 font-mono leading-none">{Number(biStats.service_revenue || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xl">
                   <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Retail Mix</p>
                   <p className="text-xl md:text-3xl font-semibold text-emerald-600 font-mono leading-none">{Number(biStats.product_revenue || 0).toLocaleString()}</p>
                </div>
             </div>

             {/* Chart Integration */}
             {plHistory.length > 0 && (
                <div className="bg-white p-6 md:p-12 rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden">
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Monthly Performance Trend</p>
                      <div className="flex items-center gap-6">
                         <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-900 rounded-full" /><span className="text-[9px] font-semibold uppercase">Revenue</span></div>
                         <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-full" /><span className="text-[9px] font-semibold uppercase">Expenses</span></div>
                      </div>
                   </div>
                   <div className="h-[280px] w-full pt-10">
                      <div className="flex items-end justify-between h-full gap-2 md:gap-4 overflow-x-auto pb-4">
                         {plHistory.slice(-6).map(m => {
                           const max = Math.max(...plHistory.map(x => x.total_revenue));
                           return (
                             <div key={m.month} className="flex-1 min-w-[60px] flex flex-col items-center gap-4">
                                <div className="w-full flex justify-center gap-1.5 items-end h-[200px]">
                                   <div className="w-3 md:w-5 bg-slate-900 rounded-t-lg transition-all" style={{ height: `${(m.total_revenue / max) * 100}%` }} />
                                   <div className="w-3 md:w-5 bg-red-500 rounded-t-lg transition-all" style={{ height: `${(m.total_expenses / max) * 100}%` }} />
                                </div>
                                <p className="text-[9px] font-semibold text-slate-400 uppercase">{m.month.split('-')[1]}/{m.month.split('-')[0].slice(-2)}</p>
                             </div>
                           )
                         })}
                      </div>
                   </div>
                </div>
             )}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

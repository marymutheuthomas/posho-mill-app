import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Landmark, TrendingUp, CreditCard, Box, Users, 
  Activity, AlertTriangle, Wallet, Zap, Scale 
} from 'lucide-react';
import GlobalDateFilter from './GlobalDateFilter';
import { subDays } from 'date-fns';
import { useActiveSession } from '../hooks/useActiveSession';

interface DashboardProps { 
  onNavigate?: (tab: string) => void; 
  role?: string | null; 
  isOnline?: boolean;
  pendingCount?: number;
}

export default function Dashboard({ onNavigate, role = 'EMPLOYEE', isOnline = true, pendingCount = 0 }: DashboardProps = {}) {
  const { data: activeSession } = useActiveSession();
  
  // Date Range State (default to last 30 days)
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 29),
    end: new Date()
  });

  // Financial States
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [plData, setPlData] = useState<any[]>([]);
  const [cashFlowData, setCashFlowData] = useState<any[]>([]);
  
  // Operational States
  const [leakageData, setLeakageData] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productionLogs, setProductionLogs] = useState<any[]>([]);
  
  // Daily Operations Monitor States
  const [retailSalesData, setRetailSalesData] = useState<any[]>([]);
  const [externalProdData, setExternalProdData] = useState<any[]>([]);
  const [internalProdData, setInternalProdData] = useState<any[]>([]);
  
  // Day lock check
  const [isDayLocked, setIsDayLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  // Cash Drop Modal State
  const [isCashDropModalOpen, setIsCashDropModalOpen] = useState(false);
  const [cashDropForm, setCashDropForm] = useState({ cash: '', mpesa: '' });
  const [cashDropLoading, setCashDropLoading] = useState(false);
  const [cashDropSuccess, setCashDropSuccess] = useState('');
  const [cashDropError, setCashDropError] = useState('');

  // 1. Static fetches — run once, NEVER react to the dateRange (Strict Live Snapshot Rule)
  useEffect(() => {
    async function fetchStaticData() {
      try {
        const { data: bsData } = await supabase.from('dashboard_balance_sheet').select('*').maybeSingle();
        if (bsData) setBalanceSheet(bsData);

        const { data: isUnlocked } = await supabase.rpc('check_day_lock');
        setIsDayLocked(!isUnlocked);
      } catch (err) {
        console.error("Error fetching static financials:", err);
      }
    }
    fetchStaticData();
  }, []);

  // 2. Date-filtered fetches — react strictly to dateRange
  useEffect(() => {
    async function fetchFilteredData() {
      try {
        setLoading(true);
        
        // Nairobi midnight boundaries calculated to UTC to match server storage
        const getUtcMidnight = (d: Date, endOfDay: boolean) => {
          const localDate = new Date(d);
          if (endOfDay) {
            localDate.setHours(23, 59, 59, 999);
          } else {
            localDate.setHours(0, 0, 0, 0);
          }
          return new Date(localDate.getTime() - (3 * 60 * 60 * 1000)).toISOString();
        };

        const startUtc = getUtcMidnight(dateRange.start, false);
        const endUtc = getUtcMidnight(dateRange.end, true);

        // ISO format bounds for P&L views and daily cash flow
        const startIso = startUtc;
        const endIso = endUtc;

        // Local date strings (YYYY-MM-DD) for local view filters
        const startLocal = new Date(dateRange.start.getTime() - (dateRange.start.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const endLocal = new Date(dateRange.end.getTime() - (dateRange.end.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        const [plRes, cashFlowRes, leakageRes, productsRes, logsRes, retailSalesRes, extProdRes, intProdRes] = await Promise.all([
          // Monthly P&L View
          supabase.from('dashboard_monthly_pl').select('*').gte('month_date', startIso).lte('month_date', endIso).order('month_date', { ascending: true }),
          // Daily Cash Flow View
          supabase.from('dashboard_daily_cash_flow').select('*').gte('reconciliation_date', startIso).lte('reconciliation_date', endIso).order('reconciliation_date', { ascending: true }).limit(30),
          // Anomaly Radar View
          supabase.from('dashboard_power_leakage_radar').select('*').gte('audit_date', startIso).lte('audit_date', endIso).limit(10),
          // Products Inventory (current levels are live, but fetched alongside)
          supabase.from('products').select('*').order('name'),
          // Production logs within date bounds
          supabase.from('production_logs').select('*').gte('created_at', startUtc).lte('created_at', endUtc),
          // Daily Operations - Retail Sales
          supabase.from('dashboard_retail_sales').select('*').gte('sales_date', startLocal).lte('sales_date', endLocal),
          // Daily Operations - External production
          supabase.from('dashboard_external_production').select('*').gte('production_date', startLocal).lte('production_date', endLocal),
          // Daily Operations - Internal production
          supabase.from('dashboard_internal_production').select('*').gte('production_date', startLocal).lte('production_date', endLocal)
        ]);

        if (plRes.data) {
          const processedPl = plRes.data.map((item: any) => ({
            ...item,
            display_month: new Date(item.month_date || item.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            total_expenses: (Number(item.other_operating_expenses) || 0) + (Number(item.direct_power_costs) || 0),
            gross_revenue: Number(item.gross_revenue) || 0,
            net_profit: Number(item.net_profit) || 0,
            cogs: Number(item.cogs) || Number(item.total_purchases) || 0
          }));
          setPlData(processedPl);
        }

        if (cashFlowRes.data) setCashFlowData(cashFlowRes.data);
        if (leakageRes.data) setLeakageData(leakageRes.data);
        if (productsRes.data) setProducts(productsRes.data);
        if (logsRes.data) setProductionLogs(logsRes.data);
        if (retailSalesRes.data) setRetailSalesData(retailSalesRes.data);
        if (extProdRes.data) setExternalProdData(extProdRes.data);
        if (intProdRes.data) setInternalProdData(intProdRes.data);

      } catch (error) {
        console.error("Error fetching date range dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchFilteredData();
  }, [dateRange]);

  const handleCashDropSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCashDropLoading(true);
      setCashDropError('');
      const cash = parseFloat(cashDropForm.cash) || 0;
      const mpesa = parseFloat(cashDropForm.mpesa) || 0;
      const total = cash + mpesa;

      // Get the authenticated user's UUID (FK references auth.users, NOT milling_sessions)
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('daily_audits').insert([{
        audit_date: new Date().toISOString().split('T')[0],
        actual_cash_collected: total,
        recorded_by: user?.id || null
      }]);

      if (error) throw error;
      setCashDropSuccess('Cash Drop Logged Successfully');
      setTimeout(() => {
        setIsCashDropModalOpen(false);
        setCashDropSuccess('');
        setCashDropForm({ cash: '', mpesa: '' });
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setCashDropError(err.message);
    } finally {
      setCashDropLoading(false);
    }
  };

  // Currency Formatter
  const formatCurrency = (val: number) => `KSh ${Math.round(val || 0).toLocaleString()}`;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="text-sm font-semibold text-slate-400 uppercase tracking-widest animate-pulse">
          Building God Mode Control Terminal...
        </div>
        <div className="w-16 h-1 bg-[#1E3A8A] rounded-full overflow-hidden">
          <div className="w-1/2 h-full bg-[#F59E0B] animate-infinite-scroll" />
        </div>
      </div>
    );
  }

  // 1. Financial Snapshot Values (Always Live Snapshot)
  const equity = balanceSheet?.total_business_equity ?? balanceSheet?.net_worth ?? 0;
  const liquidCash = balanceSheet?.liquid_cash_capital ?? ((Number(balanceSheet?.cash_on_hand) || 0) + (Number(balanceSheet?.mpesa_balance) || 0));
  const inventoryValue = balanceSheet?.inventory_asset_value ?? balanceSheet?.inventory_valuation ?? 0;
  const accountsReceivable = balanceSheet?.accounts_receivable ?? balanceSheet?.total_debt_receivable ?? 0;

  // 2. Operational calculations (Based on the selected dateRange)
  const maizeProduct = products.find(p => p.product_code === '101');
  const maizeStock = Number(maizeProduct?.current_stock) || 0;
  const lowStockAlerts = products.filter(p => Number(p.minimum_level) > 0 && Number(p.current_stock) < Number(p.minimum_level)).length;
  const activeProducts = products.filter(p => (p.category || '').toLowerCase() !== 'service' && (p.category || '').toLowerCase() !== 'milling');

  // Period Cash Inflow — sourced directly from dashboard_daily_cash_flow view (Cash + M-Pesa + Repayments)
  const cashCollection = cashFlowData.reduce((acc, curr) => acc + (Number(curr.total_liquid_inflow) || 0), 0);

  // Yield calculations from production_logs (precise kg-level accuracy)
  const totalInputKg = productionLogs.reduce((acc, curr) => acc + (Number(curr.input_kg) || 0), 0);
  const totalOutputKg = productionLogs.reduce((acc, curr) => acc + (Number(curr.main_output_kg) || 0), 0);
  const totalWasteKg = productionLogs.reduce((acc, curr) => acc + (Number(curr.waste_kg) || 0), 0);
  const yieldRate = totalInputKg > 0 ? (totalOutputKg / totalInputKg) * 100 : 0;
  const serviceRevenue = externalProdData.reduce((acc, curr) => acc + (Number(curr.total_service_revenue) ?? 0), 0);
  const burnEfficiency = totalInputKg > 0 ? serviceRevenue / totalInputKg : 0;

  // Power Leakage badges and styling
  const GHOST_MILLING_STR = '🚨 CRITICAL: GHOST MILLING (Power used, no KGs logged)';

  const getLeakageBadge = (alert: string) => {
    if (!alert) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (alert === GHOST_MILLING_STR || alert.includes('GHOST') || alert.includes('CRITICAL')) return 'bg-red-500/30 text-red-300 border-red-500/40';
    if (alert.includes('UNRECORDED') || alert.includes('AGING')) return 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  const getLeakageBorder = (alert: string) => {
    if (!alert) return 'border-emerald-500/30';
    if (alert === GHOST_MILLING_STR || alert.includes('GHOST') || alert.includes('CRITICAL')) return 'border-red-500/60 shadow-red-950/30';
    if (alert.includes('UNRECORDED') || alert.includes('AGING')) return 'border-[#F59E0B]/40 shadow-amber-950/20';
    return 'border-emerald-500/30';
  };

  // ── Card 1 Calculations: Retail Sales ──
  const totalRetailCash = retailSalesData.reduce((acc, curr) => acc + (Number(curr.expected_cash) || 0), 0);
  const totalRetailKgSold = retailSalesData.reduce((acc, curr) => acc + (Number(curr.total_kg_sold) || 0), 0);
  

  // Group retail sales by sales_date for date-level drill-down
  const retailByDate = retailSalesData.reduce((acc: Record<string, any[]>, curr) => {
    const date = curr.sales_date || '';
    if (!acc[date]) acc[date] = [];
    acc[date].push(curr);
    return acc;
  }, {});
  const retailDateEntries = Object.entries(retailByDate).sort(([a], [b]) => b.localeCompare(a));

  // Audit Balance — unified liquid expectation (Cash + M-Pesa combined)
  const auditExpectedLiquid = cashFlowData.reduce((acc, curr) => acc + (Number(curr.expected_liquid_total) || 0), 0);
  const auditExpectedPhysicalCash = cashFlowData.reduce((acc, curr) => acc + (Number(curr.expected_physical_cash) || 0), 0);
  const auditExpectedMpesa = cashFlowData.reduce((acc, curr) => acc + (Number(curr.expected_mpesa_intake) || 0), 0);
  const auditActualCash = cashFlowData.reduce((acc, curr) => acc + (Number(curr.total_cash_collected) || 0), 0);
  const auditDiscrepancy = auditActualCash - auditExpectedLiquid;

  // ── Card 2 Calculations: External Service ──
  const totalExtInputKg = externalProdData.reduce((acc, curr) => acc + (Number(curr.total_input_kg) || 0), 0);
  const totalExtServiceRevenue = externalProdData.reduce((acc, curr) => acc + (Number(curr.total_service_revenue) || 0), 0);
  const totalExtKwhConsumed = externalProdData.reduce((acc, curr) => acc + (Number(curr.power_consumed_kwh) || 0), 0);
  const avgExtPowerEfficiency = totalExtInputKg > 0 ? (totalExtKwhConsumed / totalExtInputKg) : 0;

  // ── Card 3 Calculations: Internal Production & Projected Retail Value ──
  const totalIntNetOutputKg = internalProdData.reduce((acc, curr) => acc + (Number(curr.net_output_kg) || 0), 0);
  const totalIntKwhConsumed = internalProdData.reduce((acc, curr) => acc + (Number(curr.power_consumed_kwh) || 0), 0);

  // Projected Retail Value sourced directly from dashboard_internal_production view column
  const projectedRetailValue = internalProdData.reduce((acc, row) => acc + (Number(row.projected_retail_value) || 0), 0);

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-8 min-h-screen bg-[#F8FAFC]">
      
      {/* ── Welcome & Status Top Bar ── */}
      <div className="bg-[#1E3A8A] rounded-[2rem] p-6 md:p-8 text-white relative overflow-hidden shadow-2xl shadow-blue-900/10 border border-white/10">
        <div className="absolute top-0 right-0 w-[30%] h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-2.5 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-[9px] font-black uppercase tracking-widest">
                System Active
              </span>
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Nairobi Master Node</p>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase leading-none">
              Welcome back, <span className="text-[#F59E0B]">{role === 'ADMIN' ? 'Commander' : 'Operator'}</span>
            </h1>
            <p className="text-xs font-semibold text-blue-200 uppercase tracking-widest">
              {role === 'ADMIN' ? 'Executive Master Control Terminal Active' : 'Milling Operational Console Active'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border backdrop-blur-md transition-all shadow-sm ${
              !isOnline ? 'bg-red-500/20 border-red-500/50 text-red-200' :
              pendingCount > 0 ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B]' :
              'bg-[#1E3A8A]/40 border-white/20 text-blue-100'
            }`}>
              <div className={`w-2 h-2 rounded-full ${!isOnline ? 'bg-red-500 animate-pulse' : pendingCount > 0 ? 'bg-[#F59E0B] animate-bounce' : 'bg-emerald-500'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                {!isOnline ? 'Offline Terminal' : pendingCount > 0 ? `${pendingCount} Sync Pending` : 'Cloud Synced'}
              </span>
            </div>
          </div>
        </div>

        {/* Day Lock Warning Interlock */}
        {isDayLocked && (
          <div className="mt-6 p-4 bg-red-600/20 backdrop-blur-md border border-red-500/50 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-red-400 shrink-0" size={20} />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-red-200">System Locked</p>
                <p className="text-sm font-black text-white">Daily Physical Stock Take Required</p>
              </div>
            </div>
            {onNavigate && (
              <button 
                onClick={() => onNavigate('Stock Take')} 
                className="w-full sm:w-auto px-6 py-2 bg-white text-red-700 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all shadow-md active:scale-95"
              >
                Go Audit Stock
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky Top Header (Date Filters) ── */}
      <GlobalDateFilter 
        startDate={dateRange.start}
        endDate={dateRange.end}
        onChange={(start, end) => setDateRange({ start, end })}
      />

      {/* ══ Tier 1: Executive Financial Statements (Balance Sheet & P&L) ══ */}
      <div className={`grid grid-cols-1 gap-6 ${role === 'ADMIN' ? 'xl:grid-cols-3' : 'xl:grid-cols-1'}`}>
        
        {/* Left Column (Span 1): Balance Sheet Snapshot */}
        <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col min-h-[480px] ${role === 'ADMIN' ? '' : 'max-w-2xl mx-auto w-full'}`}>
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div>
              <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">Statement of Financial Position</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Corporate Net Worth</p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-full text-[9px] font-bold text-blue-600 uppercase tracking-widest">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Live Snapshot
            </div>
          </div>
          
          <div className="flex flex-col flex-1 justify-between">
            {/* Net Equity Massive Card */}
            <div className="flex flex-col items-center justify-center text-center p-4 md:p-6 bg-slate-50 rounded-2xl border border-slate-100 mb-6 shadow-inner">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Business Equity</p>
              <h2 className="text-3xl md:text-4xl font-black text-emerald-600 tracking-tighter font-mono leading-none">
                {formatCurrency(equity)}
              </h2>
            </div>

            {/* Asset Breakdown */}
            <div className="space-y-3">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5 mb-2">Asset Allocation</p>
              
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <CreditCard size={14} className="text-emerald-600" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">Liquid Capital</p>
                </div>
                <p className="text-sm font-bold font-mono text-slate-900">{formatCurrency(liquidCash)}</p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Box size={14} className="text-amber-600" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">Inventory Valuation</p>
                </div>
                <p className="text-sm font-bold font-mono text-slate-900">{formatCurrency(inventoryValue)}</p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Users size={14} className="text-blue-600" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">Debt Receivables</p>
                </div>
                <p className="text-sm font-bold font-mono text-red-600">{formatCurrency(accountsReceivable)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (Span 2): The P&L Trend Composed Chart */}
        {role === 'ADMIN' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col min-h-[480px] xl:col-span-2">
            <div className="flex items-center justify-between mb-6 shrink-0">
              <div>
                <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">Monthly P&L Trend</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Revenue vs Overhead & Profit</p>
              </div>
              <TrendingUp className="text-slate-300" size={18} />
            </div>

            <div className="flex-1 w-full h-[320px]">
              {plData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={plData} margin={{ top: 10, right: 0, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="display_month" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} dy={10} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} tickFormatter={(val) => `KSh ${Math.round(val/1000)}k`} dx={-10} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                      cursor={{ fill: '#f8fafc' }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '15px' }} iconType="circle" />
                    
                    {/* Revenue Stacked Bar */}
                    <Bar dataKey="gross_revenue" name="Gross Revenue" fill="#1E3A8A" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    
                    {/* COGS + Expenses Lines */}
                    <Line type="monotone" dataKey="total_expenses" name="Overhead Costs" stroke="#e11d48" strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 2, fill: '#fff' }} />
                    <Line type="monotone" dataKey="net_profit" name="Net Profit" stroke="#059669" strokeWidth={3.5} dot={{ r: 4.5, strokeWidth: 2, fill: '#fff' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest italic">
                  No Financial Performance Data in Range
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ══ New Tier: Daily Operations Monitor Bento Grid ══ */}
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-4 h-px bg-slate-300 inline-block" />
          Daily Operations Monitor
        </p>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          
          {/* Card 1: Retail Sales Card */}
          <div className="bg-[#F8FAFC] rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col justify-between min-h-[360px] hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">Retail Sales Monitor</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Cash Receipts & Inventory</p>
                </div>
                <TrendingUp className="text-[#1E3A8A]" size={18} />
              </div>

              {/* Main KPIs */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-inner">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Retail Cash</p>
                  <p className="text-xl font-black text-[#1E3A8A] font-mono mt-1">{formatCurrency(totalRetailCash)}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-inner">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Volume Sold</p>
                  <p className="text-xl font-black text-[#1E3A8A] font-mono mt-1">{totalRetailKgSold.toLocaleString()} <span className="text-xs">KG</span></p>
                </div>
              </div>

              {/* Date-Grouped Sales Drill-Down */}
              <div className="mb-4 bg-white rounded-xl border border-slate-100 overflow-hidden max-h-[160px] overflow-y-auto custom-scrollbar">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3.5 pt-3 pb-1.5 border-b border-slate-100 sticky top-0 bg-white z-10">Daily Product Breakdown</p>
                {retailDateEntries.length === 0 ? (
                  <p className="text-[9px] text-slate-400 italic p-3.5 uppercase tracking-tight">No retail sales registered</p>
                ) : (
                  retailDateEntries.map(([date, rows]) => (
                    <div key={date} className="border-b border-slate-50 last:border-0">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-3.5 py-1 bg-slate-50/60">{date || '—'}</p>
                      {rows.map((r, idx) => (
                        <div key={idx} className="flex items-center justify-between px-3.5 py-1 text-[10px] border-b border-slate-50/60 last:border-0">
                          <span className="font-bold text-slate-600 uppercase truncate max-w-[120px]">{r.product_name || '—'}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-slate-500">{Number(r.total_kgs_sold || r.total_kg_sold || 0).toLocaleString()} KG</span>
                            <span className="font-mono font-bold text-[#1E3A8A]">{formatCurrency(r.cash_worth_collected || r.expected_cash || 0)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Audit / Reconciliation Row */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs mt-auto">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Audit Balance</p>
                <p className="text-xs font-extrabold text-[#1E3A8A] uppercase tracking-tight">Expected vs Collected</p>
              </div>
              <div className="text-right">
                {cashFlowData.length > 0 ? (
                  <>
                    <p className="font-mono font-bold text-[#1E3A8A]">
                      {formatCurrency(auditExpectedLiquid)}
                    </p>
                    <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                      Cash: KSh {Math.round(auditExpectedPhysicalCash).toLocaleString()} | M-Pesa: KSh {Math.round(auditExpectedMpesa).toLocaleString()}
                    </p>
                    <p className={`text-[9px] font-black uppercase mt-0.5 ${
                      auditDiscrepancy === 0 ? 'text-emerald-600' :
                      auditDiscrepancy < 0 ? 'text-[#F59E0B] font-bold animate-pulse' :
                      'text-emerald-600 font-bold'
                    }`}>
                      {auditDiscrepancy === 0 ? '✓ Reconciled' :
                       auditDiscrepancy < 0 ? `⚠️ Shortage: ${formatCurrency(auditDiscrepancy)}` :
                       `✓ Overage: +${formatCurrency(auditDiscrepancy)}`}
                    </p>
                  </>
                ) : (
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">No Closed Audit</span>
                )}
                
                <button 
                  onClick={() => setIsCashDropModalOpen(true)}
                  className="mt-3 w-full py-1.5 px-3 bg-[#1E3A8A] text-white rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-blue-800 transition-colors shadow-sm active:scale-95 flex items-center justify-center gap-2"
                >
                  <Wallet size={12} /> Log Cash Drop
                </button>
              </div>
            </div>

          </div>

          {/* Card 2: External Service Card */}
          <div className="bg-[#F8FAFC] rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col justify-between min-h-[360px] hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">External Service Monitor</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Custom Customer Milling</p>
                </div>
                <Activity className="text-[#1E3A8A]" size={18} />
              </div>

              {/* Main KPIs */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-inner">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Service Revenue</p>
                  <p className="text-xl font-black text-[#1E3A8A] font-mono mt-1">{formatCurrency(totalExtServiceRevenue)}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-inner">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Grain Processed</p>
                  <p className="text-xl font-black text-[#1E3A8A] font-mono mt-1">{totalExtInputKg.toLocaleString()} <span className="text-xs">KG</span></p>
                </div>
              </div>

              {/* External Session Drill-Down Table */}
              {externalProdData.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 mb-3 overflow-hidden max-h-[130px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {['Session', 'KG', 'kWh', 'Cost', 'Eff%'].map(h => (
                          <th key={h} className="px-2 py-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {externalProdData.map((r, i) => {
                        const eff = Number(r.efficiency_score);
                        return (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-2 py-1 text-[9px] font-bold font-mono text-slate-600 truncate max-w-[60px]">{r.session_code || r.session_id || `S${i+1}`}</td>
                            <td className="px-2 py-1 text-[9px] font-bold text-slate-700">{Number(r.kgs_processed || r.total_input_kg || 0).toLocaleString()}</td>
                            <td className="px-2 py-1 text-[9px] font-bold text-slate-700">{Number(r.power_consumed_kwh || 0).toFixed(1)}</td>
                            <td className="px-2 py-1 text-[9px] font-bold text-slate-700">{Number(r.exact_power_cost_ksh || 0).toLocaleString()}</td>
                            <td className={`px-2 py-1 text-[9px] font-black ${!isNaN(eff) && eff < 80 ? 'text-orange-600' : 'text-emerald-600'}`}>
                              {r.efficiency_score != null ? `${eff.toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Power Efficiency Indicator */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 flex items-center justify-between mt-auto">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Power Efficiency</p>
                <p className="text-xs font-black text-[#1E3A8A] font-mono mt-0.5">{avgExtPowerEfficiency.toFixed(3)} <span className="text-[9px] font-bold text-slate-400">kWh/kg</span></p>
              </div>
              <div>
                {totalExtInputKg > 0 ? (
                  avgExtPowerEfficiency <= 0.25 ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-200">
                      Optimal
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-amber-100 text-[#F59E0B] rounded-full text-[9px] font-black uppercase tracking-widest border border-amber-200 animate-pulse">
                      Warning
                    </span>
                  )
                ) : (
                  <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-full text-[9px] font-black uppercase tracking-widest border border-slate-200">
                    Standby
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* Card 3: Internal Production Card */}
          <div className="bg-[#F8FAFC] rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col justify-between min-h-[360px] hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">Internal Production Monitor</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Grain Milling Yield</p>
                </div>
                <Scale className="text-[#1E3A8A]" size={18} />
              </div>

              {/* Main KPIs */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-inner">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Net Yield</p>
                  <p className="text-xl font-black text-[#1E3A8A] font-mono mt-1">{totalIntNetOutputKg.toLocaleString()} <span className="text-xs">KG</span></p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-inner">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Power Consumed</p>
                  <p className="text-xl font-black text-[#1E3A8A] font-mono mt-1">{totalIntKwhConsumed.toFixed(2)} <span className="text-xs">kWh</span></p>
                </div>
              </div>

              {/* Internal Session Drill-Down Table */}
              {internalProdData.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 mb-3 overflow-hidden max-h-[130px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {['Session', 'KG', 'kWh', 'Cost', 'Eff%'].map(h => (
                          <th key={h} className="px-2 py-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {internalProdData.map((r, i) => {
                        const eff = Number(r.efficiency_score);
                        return (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-2 py-1 text-[9px] font-bold font-mono text-slate-600 truncate max-w-[60px]">{r.session_code || r.session_id || `S${i+1}`}</td>
                            <td className="px-2 py-1 text-[9px] font-bold text-slate-700">{Number(r.kgs_processed || r.net_output_kg || 0).toLocaleString()}</td>
                            <td className="px-2 py-1 text-[9px] font-bold text-slate-700">{Number(r.power_consumed_kwh || 0).toFixed(1)}</td>
                            <td className="px-2 py-1 text-[9px] font-bold text-slate-700">{Number(r.exact_power_cost_ksh || 0).toLocaleString()}</td>
                            <td className={`px-2 py-1 text-[9px] font-black ${!isNaN(eff) && eff < 80 ? 'text-orange-600' : 'text-emerald-600'}`}>
                              {r.efficiency_score != null ? `${eff.toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Projected Retail Value Highlight (Champagne Gold Highlight) */}
            <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 flex flex-col justify-between mt-auto">
              <p className="text-[9px] font-black text-[#F59E0B] uppercase tracking-widest">Projected Retail Value</p>
              <div className="flex items-baseline justify-between mt-1.5">
                <span className="text-2xl font-black text-[#1E3A8A] font-mono">{formatCurrency(projectedRetailValue)}</span>
                <span className="px-2 py-0.5 bg-amber-100 text-[#F59E0B] rounded text-[8px] font-black uppercase tracking-widest border border-amber-200">
                  Valued
                </span>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* ══ Tier 2: Daily Operations KPIs ══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card 1: Cash Collection (Period Inflow) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col justify-between min-h-[140px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Period Cash Inflow</h3>
            <Wallet className="text-emerald-600" size={18} />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-black text-slate-900 tracking-tighter font-mono">
              {formatCurrency(cashCollection)}
            </p>
            <p className="text-[9px] font-bold text-slate-400 uppercase">
              Sales Cash + M-Pesa + Repayments ({cashFlowData.length} days reconciled)
            </p>
          </div>
        </div>

        {/* Card 2: Session Status (Milling authorization) */}
        <div className={`bg-white rounded-2xl shadow-sm border p-4 md:p-6 flex flex-col justify-between min-h-[140px] transition-all ${
          activeSession ? 'border-emerald-300 bg-emerald-50/10' : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mill Engine Status</h3>
            <Activity className={activeSession ? 'text-emerald-600 animate-pulse' : 'text-slate-400'} size={18} />
          </div>
          <div className="space-y-1">
            <p className={`text-2xl font-black uppercase tracking-tight ${activeSession ? 'text-emerald-700' : 'text-slate-900'}`}>
              {activeSession ? 'Authorized' : 'Standby'}
            </p>
            <p className="text-[9px] font-bold text-slate-400 uppercase">
              {activeSession ? `${activeSession.session_type} Session active` : 'Awaiting initialization'}
            </p>
          </div>
        </div>

        {/* Card 3: Stock Replenishment Alerts */}
        <div className={`bg-white rounded-2xl shadow-sm border p-4 md:p-6 flex flex-col justify-between min-h-[140px] transition-all ${
          lowStockAlerts > 0 ? 'border-amber-300 bg-amber-50/10' : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Alerts</h3>
            <AlertTriangle className={lowStockAlerts > 0 ? 'text-[#F59E0B] animate-pulse' : 'text-slate-400'} size={18} />
          </div>
          <div className="space-y-1">
            <p className={`text-3xl font-black font-mono ${lowStockAlerts > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {lowStockAlerts}
            </p>
            <p className="text-[9px] font-bold text-slate-400 uppercase">Items below safety levels</p>
          </div>
        </div>

        {/* Card 4: Maize Reserve */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col justify-between min-h-[140px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Maize Reserve</h3>
            <Box className="text-blue-600" size={18} />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-black text-slate-900 tracking-tighter font-mono">
              {maizeStock.toLocaleString()} <span className="text-sm font-bold text-slate-400">KG</span>
            </p>
            <p className="text-[9px] font-bold text-slate-400 uppercase">Bulk Maize reserve</p>
          </div>
        </div>

      </div>

      {/* ══ Tier 3: Inventory & Yield Widgets ══ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Live Inventory Monitor (Span 2) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col min-h-[400px] xl:col-span-2">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div>
              <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">Live Inventory Monitor</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Product Grain Shelf Reserves</p>
            </div>
            <Box className="text-slate-300" size={18} />
          </div>
          
          <div className="flex-grow grid grid-cols-2 sm:grid-cols-3 gap-4">
            {activeProducts.slice(0, 6).map(p => {
              const isLow = Number(p.current_stock) <= Number(p.minimum_level);
              return (
                <div 
                  key={p.id} 
                  className={`p-4 rounded-xl border transition-all ${
                    isLow ? 'border-amber-300 bg-amber-50/10' : 'border-slate-100 bg-slate-50/50 hover:shadow-sm'
                  }`}
                >
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{p.name}</p>
                  <div className="flex items-baseline gap-1 mt-2 font-mono">
                    <span className={`text-2xl font-black ${isLow ? 'text-amber-700' : 'text-slate-900'}`}>
                      {Math.round(p.current_stock || 0).toLocaleString()}
                    </span>
                    <span className="text-[9px] font-bold text-slate-300 uppercase">KG</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                    <span>Safety Level</span>
                    <span className="font-mono text-slate-700">{p.minimum_level} KG</span>
                  </div>
                </div>
              );
            })}
            
            {activeProducts.length === 0 && (
              <div className="col-span-full h-full flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest italic">
                No Stock Items Registered
              </div>
            )}
          </div>
        </div>

        {/* Production Yield Stats Widget (Span 1) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col justify-between min-h-[400px]">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div>
              <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">Production & Yield</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Milling Efficiency Stats</p>
            </div>
            <Scale className="text-slate-300" size={18} />
          </div>

          <div className="space-y-6 flex-1 flex flex-col justify-between">
            {/* Top Yield rates */}
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Yield Success Rate</p>
              <div className="flex items-baseline gap-1.5 font-mono">
                <span className="text-4xl font-black text-slate-900">{yieldRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1.5">
                <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${Math.min(yieldRate, 100)}%` }} />
              </div>
            </div>

            {/* Burn Efficiency */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Operational Cash Burn</p>
              <p className="text-xl font-black font-mono text-slate-900">
                {burnEfficiency ? `${burnEfficiency.toFixed(2)}` : '0.00'}
              </p>
              <p className="text-[8px] font-bold text-slate-400 uppercase">KSh Earned per KG Milled</p>
            </div>

            {/* In-out Metrics Table */}
            <div className="space-y-2.5 pt-4 border-t border-slate-100 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Total Maize Processed</span>
                <span className="font-bold font-mono text-slate-900">{totalInputKg.toLocaleString()} KG</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Main Product Output</span>
                <span className="font-bold font-mono text-slate-900">{totalOutputKg.toLocaleString()} KG</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Net Period Waste</span>
                <span className="font-bold font-mono text-red-500">{totalWasteKg.toLocaleString()} KG</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ══ Tier 4: Risk & Audit Power Leakage Radar Terminal (Dark Futuristic Aesthetics) ══ */}
      <div className="bg-[#0F172A] rounded-[2.5rem] border border-slate-800 p-6 md:p-8 text-white shadow-2xl relative overflow-hidden">
        {/* Glassmorphic lighting background */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-900/10 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-8 shrink-0">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-[#F59E0B] shadow-inner">
                <Zap size={20} className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-widest text-[#F59E0B]">Power Audit Terminal</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Ghost Milling & Integrity Anomaly Radar</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2.5 px-4 py-2 bg-slate-800/80 border border-slate-700/60 rounded-xl shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">Live Power Sensor Connected</span>
          </div>
        </div>

        {/* Leakage logs grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative z-10">
          {leakageData.map((alert, idx) => {
            const isGhost = alert.leakage_alert === GHOST_MILLING_STR || (alert.leakage_alert?.includes('GHOST') && alert.leakage_alert?.includes('CRITICAL'));
            return (
              <div
                key={idx}
                className={`p-4 rounded-xl border backdrop-blur-sm space-y-3 flex flex-col justify-between transition-all hover:scale-[1.01] ${
                  isGhost
                    ? 'bg-red-950/70 border-red-500/60 shadow-lg shadow-red-950/40'
                    : `bg-slate-900/60 ${getLeakageBorder(alert.leakage_alert)}`
                }`}
              >
                {/* Session code + alert badge */}
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[9px] font-black font-mono truncate max-w-[100px] ${isGhost ? 'text-red-300' : 'text-slate-400'}`}>
                    {alert.session_code || alert.session_id || new Date(alert.audit_date || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shrink-0 ${getLeakageBadge(alert.leakage_alert)}`}>
                    {isGhost ? '🚨 GHOST MILLING' : (alert.leakage_alert || 'Normal')}
                  </span>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[8px] font-bold text-slate-500 uppercase">Power kWh</p>
                    <p className={`text-sm font-black font-mono ${isGhost ? 'text-red-400' : 'text-emerald-400'}`}>
                      {Number(alert.total_power_kwh ?? alert.kwh_per_kg ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[8px] font-bold text-slate-500 uppercase">Exp. Cash</p>
                    <p className="text-sm font-black font-mono text-slate-300">
                      {Number(alert.expected_money_in ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[8px] font-bold text-slate-500 uppercase">KGs Proc.</p>
                    <p className={`text-sm font-black font-mono ${isGhost ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
                      {Number(alert.total_kgs_processed ?? 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                {isGhost && (
                  <div className="text-[9px] font-semibold text-red-300 border-t border-red-700/50 pt-2 leading-relaxed">
                    🚨 Power consumed with zero production KGs logged. Ghost milling confirmed.
                  </div>
                )}
              </div>
            );
          })}

          {leakageData.length === 0 && (
            <div className="col-span-full py-8 text-center text-xs font-bold text-slate-500 uppercase tracking-widest italic bg-slate-900/40 border border-slate-800 rounded-xl">
              No Power Audits Registered in Selected Range
            </div>
          )}
        </div>
      </div>

      {/* ── Income Statement Ledger Table ── */}
      {plData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-[#1E3A8A] uppercase tracking-tight">Income Statement Ledger</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Detailed Monthly Bookkeeping Reports</p>
            </div>
            <Landmark size={18} className="text-slate-300" />
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-6 py-4">Month</th>
                  <th className="px-6 py-4 text-right">Revenue</th>
                  <th className="px-6 py-4 text-right">COGS (Maize purchases)</th>
                  <th className="px-6 py-4 text-right">Operational Expenses</th>
                  <th className="px-6 py-4 text-right">Direct Power Costs</th>
                  <th className="px-6 py-4 text-right bg-slate-100 text-slate-900">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plData.map((row, idx) => {
                  const isLoss = row.net_profit < 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 text-xs font-medium text-slate-700">{row.display_month}</td>
                      <td className="px-6 py-3 text-xs font-normal font-mono text-emerald-600 text-right">{formatCurrency(row.gross_revenue)}</td>
                      <td className="px-6 py-3 text-xs font-normal font-mono text-rose-500 text-right">{formatCurrency(row.cogs)}</td>
                      <td className="px-6 py-3 text-xs font-normal font-mono text-rose-500 text-right">{formatCurrency(row.other_operating_expenses || 0)}</td>
                      <td className="px-6 py-3 text-xs font-normal font-mono text-rose-500 text-right">{formatCurrency(row.direct_power_costs || 0)}</td>
                      <td className="px-6 py-3 text-xs font-semibold font-mono text-right bg-slate-50/80">
                        <span className={isLoss ? 'text-rose-600 animate-pulse' : 'text-emerald-600'}>
                          {formatCurrency(row.net_profit)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Shortcuts Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-24 md:pb-8">
        <button 
          onClick={() => onNavigate && onNavigate('Session Control')} 
          className="p-6 bg-white border border-slate-200 hover:border-slate-900 group transition-all text-left flex items-center justify-between shadow-sm rounded-2xl"
        >
          <div className="space-y-1">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Motor Control</p>
            <h3 className="text-lg font-black text-[#1E3A8A] uppercase">Session Hub</h3>
          </div>
          <Activity size={24} className="text-slate-200 group-hover:text-[#1E3A8A] transition-all" />
        </button>
        
        <button 
          onClick={() => onNavigate && onNavigate('Insights & Audit')} 
          className="p-6 bg-white border border-slate-200 hover:border-slate-900 group transition-all text-left flex items-center justify-between shadow-sm rounded-2xl"
        >
          <div className="space-y-1">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">BI deep-dives</p>
            <h3 className="text-lg font-black text-[#1E3A8A] uppercase">Yield Audit</h3>
          </div>
          <Scale size={24} className="text-slate-200 group-hover:text-[#1E3A8A] transition-all" />
        </button>
      </div>

      {/* Cash Drop Modal */}
      {isCashDropModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden">
            <div className="p-6 md:p-8 bg-[#1E3A8A] text-white text-center">
              <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet size={24} className="text-white" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight">Log Daily Cash</h3>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-1">Reconcile Till Balances</p>
            </div>
            
            <form onSubmit={handleCashDropSubmit} className="p-6 md:p-8 space-y-6 bg-white text-left">
              {cashDropError && <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100">{cashDropError}</div>}
              {cashDropSuccess && <div className="p-3 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-xl border border-emerald-100">{cashDropSuccess}</div>}

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Physical Cash (KSh)</label>
                  <input 
                    type="number" required min="0" step="1"
                    value={cashDropForm.cash}
                    onChange={e => setCashDropForm({...cashDropForm, cash: e.target.value})}
                    className="w-full text-lg font-bold p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1E3A8A] focus:border-transparent outline-none transition-all"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">M-Pesa Collected (KSh)</label>
                  <input 
                    type="number" required min="0" step="1"
                    value={cashDropForm.mpesa}
                    onChange={e => setCashDropForm({...cashDropForm, mpesa: e.target.value})}
                    className="w-full text-lg font-bold p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1E3A8A] focus:border-transparent outline-none transition-all"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsCashDropModalOpen(false)} className="flex-1 py-3 px-4 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={cashDropLoading} className="flex-[2] py-3 px-4 bg-[#1E3A8A] text-white rounded-xl font-bold text-xs uppercase hover:bg-blue-800 transition-colors shadow-md active:scale-95 flex items-center justify-center gap-2">
                  {cashDropLoading ? 'Saving...' : 'Submit Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}


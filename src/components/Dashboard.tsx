import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  TrendingUp, Box, Activity, AlertTriangle, 
  Wallet, Zap, Calendar, BarChart3
} from 'lucide-react';
import { useActiveSession } from '../hooks/useActiveSession';

interface DashboardProps { 
  onNavigate: (tab: string) => void; 
  role: string | null; 
  isOnline: boolean;
  pendingCount: number;
}

export default function Dashboard({ onNavigate, role, isOnline, pendingCount }: DashboardProps) {
  const { data: activeSession } = useActiveSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [stats, setStats] = useState({ 
    maizeStock: 0, 
    millingRevenue: 0, 
    cashInflow: 0, 
    lowStockCount: 0,
    debtIssued: 0,
    repaymentsToday: 0,
    totalInputKg: 0,
    totalPeriodInputKg: 0,
    efficiency: 0,
    isDayLocked: false,
    balanceSheet: {
      cash: 0,
      mpesa: 0,
      inventory: 0,
      debt: 0
    },
    productStockLevels: [] as any[],
    powerAudit: {
      kwhPerKg: 0,
      status: 'Optimal' as 'Optimal' | 'Warning' | 'Critical',
      deltaKwh: 0,
      totalKg: 0
    }
  });

  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // Nairobi Timezone Logic
        const selected = new Date(targetDate);
        selected.setHours(0, 0, 0, 0);
        const startUtc = new Date(selected.getTime() - (3 * 60 * 60 * 1000)).toISOString();
        
        const end = new Date(selected);
        end.setHours(23, 59, 59, 999);
        const endUtc = new Date(end.getTime() - (3 * 60 * 60 * 1000)).toISOString();
        
        // Active Session handled by useActiveSession hook

        const { data: productsData, error: productsErr } = await supabase.from('products').select('*').order('name');
        if (productsErr) console.error("DIAG [products]:", productsErr);

        const { data: salesData, error: salesErr } = await supabase.from('sales_transactions').select('*').gte('created_at', startUtc).lte('created_at', endUtc);
        if (salesErr) console.error("DIAG [sales_transactions]:", salesErr);

        if (role === 'ADMIN') {
          const { error: auditErr } = await supabase.from('daily_audits').select('*').gte('created_at', startUtc).lte('created_at', endUtc);
          if (auditErr) console.error("DIAG [daily_audits]:", auditErr);
        }

        const { data: repaymentsData, error: repaymentsErr } = await supabase.from('repayments').select('*').gte('created_at', startUtc).lte('created_at', endUtc);
        if (repaymentsErr) console.error("DIAG [repayments]:", repaymentsErr);

        const { data: logsData, error: logsErr } = await supabase.from('production_logs').select('*').gte('created_at', startUtc).lte('created_at', endUtc);
        if (logsErr) console.error("DIAG [production_logs]:", logsErr);

        const { data: allLogsData, error: allLogsErr } = await supabase.from('production_logs').select('input_kg');
        if (allLogsErr) console.error("DIAG [all_production_logs]:", allLogsErr);

        // BI FETCH: business_balance_sheet (ADMIN ONLY)
        let balanceData = null;
        if (role === 'ADMIN') {
          const { data: bData, error: bErr } = await supabase.from('business_balance_sheet').select('*').maybeSingle();
          if (bErr) console.error("DIAG [business_balance_sheet]:", bErr);
          balanceData = bData;
        }

        // DAY LOCK CHECK
        const { data: isUnlocked } = await supabase.rpc('check_day_lock');

        const products = productsData || [];
        const txs = salesData || [];
        const repayments = repaymentsData || [];
        const logs = logsData || [];
        const allLogs = allLogsData || [];

        const maize = products.find(p => p.product_code === '101');
        const lowStock = products.filter(p => Number(p.minimum_level) > 0 && Number(p.current_stock) < Number(p.minimum_level)).length;

        let totalMillingRevenue = 0;
        let serviceRevenue = 0;
        let totalDebtIssued = 0;
        let cashFromSales = 0;

        txs.forEach(tx => {
          const p = products.find(prod => prod.id === tx.product_id);
          const pCategory = (p?.category || '').toLowerCase();
          const txCategory = (tx.transaction_type || '').toLowerCase();
          const isService = pCategory === 'service' || pCategory === 'milling' || txCategory === 'service' || txCategory === 'milling';
          
          const rate = isService ? Number(p?.milling_fee || 0) : Number(p?.selling_price || 0);
          const weight = Number(tx.weight_kg) || Number(tx.quantity) || 0;
          const lineTotal = weight * rate;
          
          if (!isNaN(lineTotal)) {
            totalMillingRevenue += lineTotal;
            if (tx.amount_cash !== undefined && tx.amount_cash !== null) {
              cashFromSales += Number(tx.amount_cash);
            } else if (tx.payment_method === 'Cash') {
              cashFromSales += lineTotal;
            }
            if (isService) {
              serviceRevenue += lineTotal;
            }
          }
        });

        const totalRepayments = repayments.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
        const totalInput = logs.reduce((acc: number, curr: any) => acc + (Number(curr.input_kg) || 0), 0);
        const totalPeriodInput = allLogs.reduce((acc: number, curr: any) => acc + (Number(curr.input_kg) || 0), 0);
        const efficiency = totalInput > 0 ? serviceRevenue / totalInput : 0;

        // setActiveSession(sessData); // Now handled by hook
        setStats({ 
          maizeStock: Number(maize?.current_stock) || 0, 
          millingRevenue: totalMillingRevenue || 0, 
          cashInflow: (cashFromSales + totalRepayments) || 0,
          lowStockCount: lowStock || 0,
          debtIssued: totalDebtIssued || 0,
          repaymentsToday: totalRepayments || 0,
          totalInputKg: totalInput || 0,
          totalPeriodInputKg: totalPeriodInput || 0,
          efficiency: efficiency || 0,
          isDayLocked: !isUnlocked,
          balanceSheet: {
            cash: balanceData?.total_cash_on_hand || 0,
            mpesa: balanceData?.total_mpesa_balance || 0,
            inventory: balanceData?.inventory_valuation || 0,
            debt: balanceData?.total_debt_receivable || 0
          },
          productStockLevels: products.filter(p => (p.category || '').toLowerCase() !== 'service'),
          powerAudit: {
            kwhPerKg: 0,
            status: 'Optimal',
            deltaKwh: 0,
            totalKg: 0
          }
        });

        // FETCH POWER AUDIT (LATEST SESSION)
        const { data: latestSession } = await supabase
          .from('milling_sessions')
          .select('*')
          .eq('is_closed', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestSession) {
          const { data: sessionLogs } = await supabase
            .from('production_logs')
            .select('input_kg')
            .eq('session_id', latestSession.id);
          
          const sessionKg = sessionLogs?.reduce((acc: number, curr: any) => acc + (Number(curr.input_kg) || 0), 0) || 0;
          const deltaKwh = Number(latestSession.start_meter) - Number(latestSession.end_meter || latestSession.start_meter);
          const kwhPerKg = sessionKg > 0 ? deltaKwh / sessionKg : 0;
          
          let status: 'Optimal' | 'Warning' | 'Critical' = 'Optimal';
          
          // New Alert Logic: Potential Unrecorded Production
          // If delta is suspiciously low (< 0.5 kWh) despite significant production (> 10kg)
          if (deltaKwh < 0.5 && sessionKg > 10) {
            status = 'Critical';
          } else if (kwhPerKg > 0.07) {
            status = 'Critical';
          } else if (kwhPerKg > 0.05) {
            status = 'Warning';
          }

          setStats(prev => ({
            ...prev,
            powerAudit: { kwhPerKg, status, deltaKwh, totalKg: sessionKg }
          }));
        }
      } catch (err: any) { 
        console.error('CRITICAL DASHBOARD ERROR:', err.message); 
        
        if (err.code === '42501' || err.code === 'PGRST116') {
          setError('Access Restricted: Some high-level analytics are locked for your account level.');
        } else if (!navigator.onLine || err.message?.includes('ERR_INTERNET_DISCONNECTED')) {
          console.warn('Dashboard operating in offline mode.');
          setError('Operating in Offline Mode. Some metrics may be cached.');
        } else {
          setError('Unable to sync session data. Check your connection or refresh the dashboard.');
        }
      } finally { setLoading(false); }
    }
    fetchDashboardData();
  }, [error === null, targetDate]); // Simple retry trigger

  if (error) return (
    <div className="p-10 md:p-20 text-center space-y-6">
      <p className="text-red-600 font-semibold uppercase tracking-widest text-sm md:text-base">{error}</p>
      <button 
        onClick={() => { setError(null); setLoading(true); }}
        className="w-full md:w-auto px-8 py-4 bg-slate-900 text-white rounded-xl font-semibold uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-xl"
      >
        Retry Sync
      </button>
    </div>
  );

  if (loading) return <div className="p-20 text-center font-semibold uppercase text-slate-400 italic tracking-widest text-sm md:text-base animate-pulse">Compiling Analytics...</div>;

  return (
    <div className="space-y-6 md:space-y-10 pb-32 px-4 md:px-0">
      {/* Welcome Banner */}
      <div className="bg-[#1E3A8A] rounded-2xl md:rounded-[2.5rem] p-6 md:p-12 text-white relative overflow-hidden shadow-2xl shadow-blue-900/10 border border-white/10">
        <div className="absolute top-0 right-0 w-[40%] h-full bg-gradient-to-l from-white/5 to-transparent" />
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        
        <div className="relative z-10 space-y-8 md:space-y-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
             <div className="flex flex-wrap items-center gap-3">
                <div className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/20">
                   <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-widest">System Online</p>
                </div>
                <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-widest text-[#F59E0B]">Nairobi Node · {todayStr}</p>
             </div>
             
             {/* Bento Dashboard Status Indicator */}
             <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border backdrop-blur-md transition-all ${!isOnline ? 'bg-red-500/20 border-red-500/50 text-red-200' : pendingCount > 0 ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B]' : 'bg-[#1E3A8A]/40 border-white/20 text-blue-100'}`}>
                <div className={`w-2 h-2 rounded-full ${!isOnline ? 'bg-red-500 animate-pulse' : pendingCount > 0 ? 'bg-[#F59E0B] animate-bounce' : 'bg-emerald-500'}`} />
                <span className="text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.15em]">
                   {!isOnline ? 'Terminal Offline' : pendingCount > 0 ? `${pendingCount} Sync Pending` : 'Cloud Synced'}
                </span>
             </div>
          </div>
          
          <div className="space-y-1 md:space-y-2">
            <h1 className="text-2xl md:text-5xl font-light tracking-tighter uppercase leading-none">
              Welcome Back, <span className="font-semibold text-[#F59E0B]">{role === 'ADMIN' ? 'Commander' : 'Operator'}</span>
            </h1>
            <p className="text-[11px] md:text-sm text-blue-200 font-medium tracking-tight uppercase tracking-widest">
              {role === 'ADMIN' 
                ? 'Executive Terminal: Strategic Financial Oversight Active.' 
                : 'Operational Hub: Production & Inventory Control Active.'}
            </p>
          </div>
        </div>

        {/* DAY LOCK INTERLOCK BANNER */}
        {stats.isDayLocked && (
          <div className="mt-8 md:mt-12 p-4 md:p-8 bg-red-600/20 backdrop-blur-md border border-red-500/50 rounded-2xl md:rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-600 rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-900/40">
                <AlertTriangle size={24} />
              </div>
              <div className="text-center md:text-left">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-red-200">System Interlock Active</p>
                <p className="text-base md:text-xl font-semibold text-white">Physical Stock Take Required</p>
              </div>
            </div>
            <button onClick={() => onNavigate('Inventory Audit')} className="w-full md:w-auto px-10 py-4 bg-white text-red-600 rounded-xl font-semibold text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all shadow-xl active:scale-95">
              Audit Now
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl shadow-sm w-full md:w-auto">
           <Calendar size={14} className="text-slate-900" />
           <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Period:</span>
           <input 
            type="date" 
            value={targetDate} 
            onChange={e => setTargetDate(e.target.value)}
            className="text-[11px] font-semibold text-slate-900 bg-transparent outline-none cursor-pointer flex-1"
           />
        </div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          Terminal ID: <span className="text-slate-900 font-mono">NODE-001</span>
        </p>
      </div>
      {/* Primary Financial Hub */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Net Earnings Card - ADMIN ONLY */}
        {role === 'ADMIN' ? (
          <div className="mill-card p-6 md:p-10 bg-white border-slate-100 shadow-xl relative overflow-hidden group lg:col-span-2 rounded-2xl md:rounded-[2.5rem] border-t-8 border-t-slate-900">
            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingUp className="text-slate-900" size={20} />
                  <p className="text-[10px] md:text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Business Balance Sheet</p>
                </div>
                <div className="text-[9px] font-semibold bg-slate-900 text-[#F59E0B] px-4 py-1.5 rounded-full uppercase tracking-widest">Live Valuation</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-1">
                   <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Cash on Hand</p>
                   <h2 className="text-3xl md:text-5xl font-semibold tracking-tighter text-slate-950 font-mono">
                     <span className="text-xl md:text-2xl text-slate-300">KES</span> {stats.balanceSheet.cash.toLocaleString()}
                   </h2>
                </div>
                <div className="space-y-1">
                   <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">M-Pesa Balance</p>
                   <h2 className="text-3xl md:text-5xl font-semibold tracking-tighter text-slate-950 font-mono">
                     <span className="text-xl md:text-2xl text-slate-300">KES</span> {stats.balanceSheet.mpesa.toLocaleString()}
                   </h2>
                </div>
              </div>
              <div className="flex flex-wrap gap-8 pt-8 border-t border-slate-50">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Inventory Value</p>
                  <p className="text-xl md:text-2xl font-semibold text-slate-900 font-mono">
                    KES {stats.balanceSheet.inventory.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Debt Receivable</p>
                  <p className="text-xl md:text-2xl font-semibold text-red-600 font-mono">
                    KES {stats.balanceSheet.debt.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mill-card p-6 md:p-10 bg-slate-900 text-white shadow-xl relative overflow-hidden group lg:col-span-2 rounded-2xl md:rounded-[2.5rem] flex items-center min-h-[240px]">
            <div className="relative z-10 space-y-6 w-full">
              <div className="flex items-center gap-3 text-slate-400">
                <Activity size={24} className="animate-pulse" />
                <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-widest">Terminal Operational Status: Active</p>
              </div>
              <h2 className="text-4xl md:text-6xl font-semibold tracking-tighter leading-none">Intelligence<br/>Terminal</h2>
              <p className="text-sm md:text-base font-medium text-slate-400 uppercase tracking-tight">Monitoring real-time throughput & inventory.</p>
            </div>
          </div>
        )}

        {/* Efficiency Meter (Burn Rate) - VISIBLE TO ALL */}
        <div className="mill-card p-6 md:p-10 bg-white border-slate-100 shadow-xl flex flex-col justify-between rounded-2xl md:rounded-[2.5rem]">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="text-slate-900" size={18} />
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Burn Efficiency</p>
            </div>
            <div className="space-y-1">
               <h2 className="text-3xl md:text-5xl font-semibold tracking-tighter text-slate-950 font-mono leading-none">
                 {stats.efficiency ? stats.efficiency.toFixed(2) : '0.00'}
               </h2>
               <p className="text-sm font-semibold text-slate-300 uppercase">Ksh/Kg Processed</p>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-50 mt-8">
             <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Throughput (Period)</p>
             <h3 className="text-2xl md:text-3xl font-semibold text-slate-900 font-mono">
               {stats.totalInputKg ? stats.totalInputKg.toLocaleString() : '0'} <span className="text-sm text-slate-400">KG</span>
             </h3>
          </div>
        </div>
      </div>


      {/* BENTO STOCK MONITOR */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
           <Box className="text-[#1E3A8A]" size={20} />
           <h3 className="text-[11px] font-semibold text-[#1E3A8A] uppercase tracking-[0.2em]">Live Inventory Monitor</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
           {stats.productStockLevels.map(p => {
              const isLow = Number(p.current_stock) <= Number(p.minimum_level);
              return (
                <div 
                  key={p.id} 
                  className={`p-5 rounded-2xl bg-white border transition-all ${isLow ? 'border-orange-500 shadow-xl shadow-orange-100 animate-pulse' : 'border-slate-100 hover:shadow-lg'}`}
                >
                   <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-3 truncate">{p.name}</p>
                   <div className="flex items-baseline gap-1 font-mono">
                      <span className={`text-2xl md:text-3xl font-semibold tracking-tighter ${isLow ? 'text-orange-600' : 'text-slate-900'}`}>
                        {Number(p.current_stock).toLocaleString()}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-300 uppercase">KG</span>
                   </div>
                   <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-3">
                      <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-tighter">Safety Stock</span>
                      <span className="text-[10px] font-semibold text-slate-900 font-mono">{p.minimum_level} <span className="text-[8px]">KG</span></span>
                   </div>
                </div>
              );
           })}
        </div>
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {role === 'ADMIN' ? (
          <div className="mill-card p-6 bg-white shadow-xl border-slate-100 rounded-2xl flex flex-col justify-center min-h-[140px]">
            <div className="flex items-center gap-3 mb-4">
              <Wallet className="text-slate-900" size={18} />
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Cash Collection</p>
            </div>
            <h3 className="text-2xl md:text-3xl font-semibold text-slate-950 font-mono">
              <span className="text-sm text-slate-300">KES</span> {stats.cashInflow ? stats.cashInflow.toLocaleString() : '0.00'}
            </h3>
          </div>
        ) : (
          <div className="mill-card p-6 bg-white shadow-xl border-slate-100 rounded-2xl flex flex-col justify-center min-h-[140px]">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="text-slate-900" size={20} />
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Performance</p>
            </div>
            <p className="text-xl md:text-2xl font-semibold text-slate-900 font-mono">
              {stats.millingRevenue > 0 ? 'OPERATIONAL' : 'INITIALIZING'}
            </p>
          </div>
        )}

        <div className="mill-card p-6 bg-white shadow-xl border-slate-100 rounded-2xl flex flex-col justify-center min-h-[140px]">
          <div className="flex items-center gap-3 mb-4">
            <Box className="text-slate-900" size={18} />
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Maize Reserve</p>
          </div>
          <p className="text-xl md:text-2xl font-semibold text-slate-900 font-mono">
            {stats.maizeStock ? stats.maizeStock.toLocaleString() : '0'} <span className="text-sm text-slate-300 uppercase">KG</span>
          </p>
        </div>

        <div className={`mill-card p-6 shadow-xl transition-all rounded-2xl flex flex-col justify-center min-h-[140px] ${stats.lowStockCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-100'}`}>
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className={stats.lowStockCount > 0 ? 'text-orange-600' : 'text-slate-900'} size={18} />
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Replenishment</p>
          </div>
          <p className={`text-xl md:text-2xl font-semibold ${stats.lowStockCount > 0 ? 'text-orange-700' : 'text-slate-900'}`}>
            {stats.lowStockCount ? stats.lowStockCount.toLocaleString() : '0'} Alerts
          </p>
        </div>

        <div className={`mill-card p-6 shadow-xl transition-all rounded-2xl flex flex-col justify-center min-h-[140px] ${activeSession ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'}`}>
          <div className="flex items-center gap-3 mb-4">
            <Activity className={activeSession ? 'text-emerald-600 animate-pulse' : 'text-slate-900'} size={20} />
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Registry Status</p>
          </div>
          <p className={`text-xl md:text-2xl font-semibold ${activeSession ? 'text-emerald-700' : 'text-slate-900'}`}>
            {activeSession ? 'Authorized' : 'Standby'}
          </p>
        </div>
      </div>

      {/* POWER AUDIT HUB */}
      {role === 'ADMIN' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 bg-[#1E3A8A] rounded-2xl p-6 md:p-8 text-white shadow-2xl relative overflow-hidden border border-white/10">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl" />
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-[#F59E0B]">
                    <Zap size={20} />
                  </div>
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-200">Power Audit Terminal</h3>
                </div>
                <div>
                  <p className="text-[8px] font-bold text-blue-300 uppercase tracking-tight mb-0.5">Efficiency Metric (Latest Session)</p>
                  <div className="flex items-baseline gap-2 font-mono">
                    <h2 className="text-3xl font-black tracking-tighter text-white">
                      {stats.powerAudit.kwhPerKg.toFixed(3)}
                    </h2>
                    <span className="text-sm font-black text-[#F59E0B]">kWh/kg</span>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 border border-white/10 flex-1 max-w-sm">
                <div className="flex items-center justify-between mb-4">
                   <span className="text-[9px] font-black uppercase tracking-widest text-blue-300">Analysis Status</span>
                   <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                     stats.powerAudit.status === 'Critical' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                     stats.powerAudit.status === 'Warning' ? 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30' :
                     'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                   }`}>
                     {stats.powerAudit.status}
                   </span>
                </div>
                <p className={`text-xs font-bold leading-relaxed ${stats.powerAudit.status === 'Critical' ? 'text-red-400' : 'text-blue-100'}`}>
                  {stats.powerAudit.status === 'Critical' 
                    ? (stats.powerAudit.deltaKwh < 0.5 && stats.powerAudit.totalKg > 10 
                        ? '🚨 Potential Unrecorded Production: High yield detected with negligible power usage.' 
                        : '⚠️ High Consumption Detected: Check for motor friction or unrecorded milling.')
                    : stats.powerAudit.status === 'Warning'
                    ? 'Efficiency is slightly below optimal. Monitor motor load and belt tension.'
                    : 'System is operating at optimal power efficiency. No action required.'
                  }
                </p>
              </div>
            </div>

            <div className="mt-8 md:mt-12 pt-8 md:pt-12 border-t border-white/5 grid grid-cols-2 md:grid-cols-4 gap-8">
               <div>
                 <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-1">Total Power</p>
                 <p className="text-xl md:text-2xl font-semibold text-white font-mono">{stats.powerAudit.deltaKwh.toFixed(1)} kWh</p>
               </div>
               <div>
                 <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-1">Net Output</p>
                 <p className="text-xl md:text-2xl font-semibold text-white font-mono">{stats.powerAudit.totalKg.toLocaleString()} KG</p>
               </div>
               <div className="col-span-2 text-right flex flex-col justify-end hidden md:flex">
                 <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-1">Target Threshold</p>
                 <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Optimal Performance: ≤ 0.050 kWh/kg</p>
               </div>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-slate-100 shadow-xl flex flex-col justify-between">
             <div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Efficiency Alert Rules</h3>
                <div className="space-y-4">
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Optimal: &lt; 0.05 kWh/kg</p>
                   </div>
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-[#F59E0B] rounded-full" />
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Warning: 0.05 - 0.07 kWh/kg</p>
                   </div>
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Critical: &gt; 0.07 kWh/kg</p>
                   </div>
                </div>
             </div>
             <p className="text-[9px] font-bold text-slate-400 uppercase leading-relaxed mt-6">
                *Values are calculated based on the delta between start and end meter readings per session.
             </p>
          </div>
        </div>
      )}

      {/* Performance Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <button onClick={() => onNavigate('Session Control')} className="mill-card p-6 md:p-8 bg-white border-slate-100 hover:border-slate-900 group transition-all text-left flex items-center justify-between shadow-xl rounded-2xl">
           <div className="space-y-2">
             <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Master Control</p>
             <h3 className="text-lg md:text-xl font-semibold text-slate-900 uppercase group-hover:text-slate-900 transition-colors">Session Hub</h3>
           </div>
           <Activity size={24} className="text-slate-100 group-hover:text-slate-900/20 transition-all" />
        </button>
        <button onClick={() => onNavigate('Insights & Audit')} className="mill-card p-6 md:p-8 bg-white border-slate-100 hover:border-slate-900 group transition-all text-left flex items-center justify-between shadow-xl rounded-2xl">
           <div className="space-y-2">
             <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Reporting</p>
             <h3 className="text-lg md:text-xl font-semibold text-slate-900 uppercase group-hover:text-slate-900 transition-colors">Yield Audit</h3>
           </div>
           <BarChart3 size={24} className="text-slate-100 group-hover:text-slate-900/20 transition-all" />
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  TrendingUp, Box, Activity, AlertTriangle, 
  Wallet, Zap, Calendar, BarChart3
} from 'lucide-react';

interface DashboardProps { onNavigate: (tab: string) => void; role: string | null; }

export default function Dashboard({ onNavigate, role }: DashboardProps) {
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ 
    maizeStock: 0, 
    millingRevenue: 0, 
    cashInflow: 0, 
    lowStockCount: 0,
    debtIssued: 0,
    repaymentsToday: 0,
    totalInputKg: 0,
    totalPeriodInputKg: 0,
    efficiency: 0
  });

  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // Enforce exact UTC offset for Nairobi midnight
        const d = new Date();
        const nairobiStr = d.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
        const nairobiTime = new Date(nairobiStr);
        nairobiTime.setHours(0, 0, 0, 0);
        // Convert Nairobi midnight back to its exact UTC equivalent string
        const todayUtc = new Date(nairobiTime.getTime() - (3 * 60 * 60 * 1000)).toISOString();
        
        const { data: sessData, error: sessErr } = await supabase.from('milling_sessions').select('*').eq('is_closed', false).maybeSingle();
        if (sessErr) console.error("DIAG [milling_sessions]:", sessErr);

        const { data: productsData, error: productsErr } = await supabase.from('products').select('*');
        if (productsErr) console.error("DIAG [products]:", productsErr);

        const { data: salesData, error: salesErr } = await supabase.from('sales_transactions').select('*').gte('created_at', todayUtc);
        if (salesErr) console.error("DIAG [sales_transactions]:", salesErr);

        await supabase.from('daily_audits').select('*').gte('created_at', todayUtc);

        const { data: repaymentsData, error: repaymentsErr } = await supabase.from('repayments').select('*').gte('created_at', todayUtc);
        if (repaymentsErr) console.error("DIAG [repayments]:", repaymentsErr);

        const { data: logsData, error: logsErr } = await supabase.from('production_logs').select('*').gte('created_at', todayUtc);
        if (logsErr) console.error("DIAG [production_logs]:", logsErr);

        const { data: allLogsData, error: allLogsErr } = await supabase.from('production_logs').select('input_kg');
        if (allLogsErr) console.error("DIAG [all_production_logs]:", allLogsErr);

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
            cashFromSales += lineTotal;
            if (isService) {
              serviceRevenue += lineTotal;
            }
          }
        });

        const totalRepayments = repayments.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
        const totalInput = logs.reduce((acc: number, curr: any) => acc + (Number(curr.input_kg) || 0), 0);
        const totalPeriodInput = allLogs.reduce((acc: number, curr: any) => acc + (Number(curr.input_kg) || 0), 0);
        const efficiency = totalInput > 0 ? serviceRevenue / totalInput : 0;

        setActiveSession(sessData);
        setStats({ 
          maizeStock: Number(maize?.current_stock) || 0, 
          millingRevenue: totalMillingRevenue || 0, 
          cashInflow: (cashFromSales + totalRepayments) || 0,
          lowStockCount: lowStock || 0,
          debtIssued: totalDebtIssued || 0,
          repaymentsToday: totalRepayments || 0,
          totalInputKg: totalInput || 0,
          totalPeriodInputKg: totalPeriodInput || 0,
          efficiency: efficiency || 0
        });
      } catch (err: any) { 
        console.error('CRITICAL DASHBOARD ERROR:', err.message); 
      } finally { setLoading(false); }
    }
    fetchDashboardData();
  }, []);

  if (loading) return <div className="p-20 text-center font-black uppercase text-slate-400 italic tracking-widest">Compiling Analytics...</div>;

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-end mb-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Calendar size={12} className="text-slate-900" /> Period: <span className="text-slate-900">{todayStr}</span>
        </p>
      </div>

      {/* Primary Financial Hub - ADMIN ONLY */}
      {role === 'Admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Net Earnings Card */}
          <div className="mill-card p-4 md:p-6 lg:p-8 bg-white border-slate-200 shadow-xl relative overflow-hidden group lg:col-span-2 border-t-4 border-t-slate-900 min-h-[160px] md:min-h-[180px]">
            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-slate-900" size={18} />
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Period Revenue</p>
                </div>
                <div className="text-[9px] font-bold bg-slate-100 text-slate-900 px-3 py-1 rounded-full uppercase">High Contrast View</div>
              </div>
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-950">
                KES {stats.millingRevenue ? stats.millingRevenue.toLocaleString() : '0.00'}
              </h2>
              <div className="flex gap-4 md:gap-6 pt-4 border-t border-slate-100">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Liquid Cash</p>
                  <p className="text-base md:text-lg font-black text-slate-900">
                    KES {(stats.millingRevenue - stats.debtIssued) ? (stats.millingRevenue - stats.debtIssued).toLocaleString() : '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Debt Issued</p>
                  <p className="text-base md:text-lg font-black text-red-600">
                    KES {stats.debtIssued ? stats.debtIssued.toLocaleString() : '0.00'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Efficiency Meter */}
          <div className="mill-card p-6 md:p-10 bg-white border-slate-200 shadow-xl flex flex-col justify-between min-h-[180px] md:min-h-[220px]">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="text-slate-900" size={18} />
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Efficiency Rate</p>
              </div>
              <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-950">
                {stats.efficiency ? stats.efficiency.toFixed(2) : '0.00'} <span className="text-sm text-slate-400">Ksh/Kg</span>
              </h2>
              <p className="text-[9px] font-bold text-slate-600 uppercase leading-tight">Revenue generated per KG of maize input</p>
            </div>
            <div className="pt-6 border-t border-slate-100 mt-6">
               <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Milled Today</p>
               <h3 className="text-4xl font-black text-slate-950">
                 {stats.totalInputKg ? stats.totalInputKg.toLocaleString() : '0'} KG
               </h3>
               {stats.totalInputKg === 0 && stats.totalPeriodInputKg > 0 && (
                 <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 border-t border-slate-50 pt-2">
                   Total Period: <span className="text-slate-600">{stats.totalPeriodInputKg.toLocaleString()} KG</span>
                 </p>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {role === 'Admin' ? (
          <div className="mill-card p-4 md:p-6 bg-white shadow-lg border-slate-100 min-h-[120px] flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-4">
              <Wallet className="text-slate-900" size={18} />
              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Cash Inflow</p>
            </div>
            <h3 className="text-3xl font-black text-slate-950 font-mono">
              KES {stats.cashInflow ? stats.cashInflow.toLocaleString() : '0.00'}
            </h3>
            <p className="text-[8px] font-bold text-slate-600 uppercase mt-2">Sales + Repayments</p>
          </div>
        ) : (
          <div className="mill-card p-4 md:p-6 bg-white shadow-lg border-slate-100 min-h-[120px] flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="text-slate-900" size={18} />
              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Transactions Today</p>
            </div>
            <p className="text-xl md:text-2xl font-black text-slate-900 font-mono">
              {stats.millingRevenue > 0 ? 'ACTIVE' : 'STARTING'}
            </p>
            <p className="text-[8px] font-bold text-slate-600 uppercase mt-2">Daily throughput monitoring</p>
          </div>
        )}

        <div className="mill-card p-6 md:p-8 bg-white shadow-lg border-slate-100 min-h-[140px] flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-4">
            <Box className="text-slate-900" size={18} />
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Bulk Maize</p>
          </div>
          <p className="text-xl md:text-2xl font-black text-slate-900 font-mono">
            {stats.maizeStock ? stats.maizeStock.toLocaleString() : '0'} KG
          </p>
          <p className="text-[8px] font-bold text-slate-600 uppercase mt-2">Current 101 Inventory</p>
        </div>

        <div className={`mill-card p-6 md:p-8 shadow-lg transition-all min-h-[140px] flex flex-col justify-center ${stats.lowStockCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-100'}`}>
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className={stats.lowStockCount > 0 ? 'text-orange-600' : 'text-slate-900'} size={18} />
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Stock Alerts</p>
          </div>
          <p className={`text-xl md:text-2xl font-black ${stats.lowStockCount > 0 ? 'text-orange-700' : 'text-slate-900'}`}>
            {stats.lowStockCount ? stats.lowStockCount.toLocaleString() : '0'} Items
          </p>
          <p className="text-[8px] font-bold text-slate-600 uppercase mt-2">Below Min. Level</p>
        </div>

        <div className={`mill-card p-6 md:p-8 shadow-lg transition-all min-h-[140px] flex flex-col justify-center ${activeSession ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'}`}>
          <div className="flex items-center gap-3 mb-4">
            <Activity className={activeSession ? 'text-emerald-600 animate-pulse' : 'text-slate-900'} size={18} />
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Mill Status</p>
          </div>
          <p className={`text-xl md:text-2xl font-black ${activeSession ? 'text-emerald-700' : 'text-slate-900'}`}>
            {activeSession ? 'Running' : 'Standby'}
          </p>
          <p className="text-[8px] font-bold text-slate-600 uppercase mt-2">
            {activeSession?.session_type || 'No Active Session'}
          </p>
        </div>
      </div>

      {/* Performance Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <button onClick={() => onNavigate('Session Control')} className="mill-card p-10 bg-white border-slate-200 hover:border-slate-900 group transition-all text-left flex items-center justify-between shadow-lg">
           <div className="space-y-2">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Control Center</p>
             <h3 className="text-2xl font-black text-slate-900 uppercase group-hover:text-slate-900 transition-colors">Start/Stop Milling</h3>
           </div>
           <Activity size={32} className="text-slate-100 group-hover:text-slate-900/20 transition-all" />
        </button>
        <button onClick={() => onNavigate('Insights & Audit')} className="mill-card p-10 bg-white border-slate-200 hover:border-slate-900 group transition-all text-left flex items-center justify-between shadow-lg">
           <div className="space-y-2">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analytics</p>
             <h3 className="text-2xl font-black text-slate-900 uppercase group-hover:text-slate-900 transition-colors">Yield Performance</h3>
           </div>
           <BarChart3 size={32} className="text-slate-100 group-hover:text-slate-900/20 transition-all" />
        </button>
      </div>
    </div>
  );
}

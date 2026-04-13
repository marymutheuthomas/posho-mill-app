import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Calendar as CalendarIcon, 
  TrendingUp, 
  Zap, 
  Coins, 
  Wallet, 
  UserMinus, 
  Loader2, 
  FileText, 
  Activity, 
  ChevronRight,
  Filter,
  BarChart3,
  Package
} from 'lucide-react';

interface AuditStats {
  productionKg: number;
  revenue: {
    Cash: number;
    Mpesa: number;
    Debt: number;
  };
  powerUnits: number;
  powerCost: number;
}

export default function AuditHub() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AuditStats | null>(null);
  
  // Date range state - defaults to today
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [preset, setPreset] = useState<'today' | 'week' | 'month' | 'custom'>('today');

  const fetchAuditData = async () => {
    setLoading(true);
    try {
      // Adjust end date to include the full day
      const startIso = new Date(startDate);
      startIso.setHours(0, 0, 0, 0);
      
      const endIso = new Date(endDate);
      endIso.setHours(23, 59, 59, 999);

      // 1. Production Logs
      const { data: productionData } = await supabase
        .from('production_logs')
        .select('output_qty')
        .gte('created_at', startIso.toISOString())
        .lte('created_at', endIso.toISOString());
      
      const totalProduction = productionData?.reduce((acc, curr) => acc + (curr.output_qty || 0), 0) || 0;

      // 2. Transactions
      const { data: txs } = await supabase
        .from('service_transactions')
        .select('fee_charged, payment_method')
        .gte('created_at', startIso.toISOString())
        .lte('created_at', endIso.toISOString());

      const revenue = { Cash: 0, Mpesa: 0, Debt: 0 };
      txs?.forEach(tx => {
        const method = tx.payment_method as keyof typeof revenue;
        if (revenue[method] !== undefined) {
           revenue[method] += (tx.fee_charged || 0);
        }
      });

      // 3. Power usage
      const { data: sessions } = await supabase
        .from('milling_sessions')
        .select('start_reading, end_reading, power_cost')
        .eq('status', 'Completed')
        .gte('created_at', startIso.toISOString())
        .lte('created_at', endIso.toISOString());

      const powerUnits = sessions?.reduce((acc, curr) => acc + ( (curr.end_reading || 0) - curr.start_reading), 0) || 0;
      const powerCost = sessions?.reduce((acc, curr) => acc + (curr.power_cost || 0), 0) || 0;

      setStats({
        productionKg: totalProduction,
        revenue,
        powerUnits,
        powerCost
      });
    } catch (err) {
      console.error("Error fetching audit data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditData();
  }, [startDate, endDate]);

  const setDatePreset = (p: 'today' | 'week' | 'month') => {
    setPreset(p);
    const today = new Date();
    const start = new Date();
    
    if (p === 'today') {
      const d = today.toISOString().split('T')[0];
      setStartDate(d);
      setEndDate(d);
    } else if (p === 'week') {
      start.setDate(today.getDate() - 7);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else if (p === 'month') {
      start.setMonth(today.getMonth() - 1);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    }
  };

  if (!stats && loading) return (
    <div className="flex justify-center p-20">
      <Loader2 className="animate-spin text-primary" size={48} />
    </div>
  );

  const totalRevenue = stats ? (stats.revenue.Cash + stats.revenue.Mpesa + stats.revenue.Debt) : 0;
  const netEarnings = stats ? (totalRevenue - stats.powerCost) : 0;
  const efficiency = (stats && stats.productionKg > 0) ? (stats.powerCost / stats.productionKg).toFixed(2) : '0.00';

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Search & Filter Header */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 p-3 rounded-2xl text-primary">
            <Filter size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter leading-none">Intelligence Filters</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select date range for auditing</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
            {(['today', 'week', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setDatePreset(p)}
                className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${preset === p ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
             <CalendarIcon size={16} className="text-slate-400" />
             <input 
               type="date" 
               className="bg-transparent border-none text-xs font-black text-slate-600 outline-none"
               value={startDate}
               onChange={(e) => { setStartDate(e.target.value); setPreset('custom'); }}
             />
             <ChevronRight size={14} className="text-slate-300" />
             <input 
               type="date" 
               className="bg-transparent border-none text-xs font-black text-slate-600 outline-none"
               value={endDate}
               onChange={(e) => { setEndDate(e.target.value); setPreset('custom'); }}
             />
          </div>
        </div>
      </div>

      {loading ? (
         <div className="flex justify-center p-20">
            <Loader2 className="animate-spin text-primary" size={32} />
         </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Main Profit Card */}
          <div className="lg:col-span-2 bg-primary p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col justify-between group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-24 -mt-24 blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
            <div>
              <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Net Earnings For Period</p>
              <h3 className="text-5xl font-black text-white tracking-tighter">
                KES {netEarnings.toLocaleString()}
              </h3>
            </div>
            
            <div className="mt-12 grid grid-cols-2 gap-8 border-t border-white/10 pt-8">
               <div>
                  <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-1">Total Revenue</p>
                  <p className="text-xl font-bold text-white">KES {totalRevenue.toLocaleString()}</p>
               </div>
               <div>
                  <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-1">Power Cost</p>
                  <p className="text-xl font-bold text-teal-300">KES {stats.powerCost.toLocaleString()}</p>
               </div>
            </div>
          </div>

          {/* Efficiency & Health */}
          <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-between">
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                  <div className="bg-amber-50 p-3 rounded-2xl">
                    <Activity className="text-amber-500" size={24} />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Yield Variance (Drift)</p>
               </div>
               <h4 className="text-4xl font-black text-slate-800">{efficiency} <span className="text-sm opacity-40">KES/KG</span></h4>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-dashed border-slate-200">
               <div className="flex items-center gap-2 mb-2">
                  <Zap size={14} className="text-slate-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase">Health Audit</span>
               </div>
               <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                  {parseFloat(efficiency) > 10 
                    ? "Warning: Possible leakage detected in this period." 
                    : "Performance is optimal and within acceptable range."}
               </p>
            </div>
          </div>

          {/* Production Output */}
          <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
             <div className="absolute top-[-5%] right-[-5%]">
                <Package size={120} className="text-slate-50 opacity-10" />
             </div>
             <div className="space-y-4 relative z-10">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total Output</p>
                <h4 className="text-5xl font-black text-primary leading-none">
                  {stats.productionKg.toLocaleString()}
                  <span className="text-lg opacity-40 ml-2 uppercase">kg</span>
                </h4>
             </div>
             <div className="pt-6 border-t border-slate-50 relative z-10">
                <div className="flex items-center gap-2 text-slate-400 uppercase font-black text-[10px]">
                   <BarChart3 size={14} />
                   <span>{preset === 'today' ? 'Daily Capacity' : 'Period Total'}</span>
                </div>
             </div>
          </div>

          {/* Payment Method Breakdown */}
          <div className="lg:col-span-4 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
             <div className="flex items-center justify-between mb-8 border-b border-slate-50 pb-6">
                <div>
                   <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Payment Breakdown</h3>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Cash Reconciliation for range</p>
                </div>
                <div className="bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase">
                   Verified Ledger
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="flex items-center gap-6 group hover:translate-x-2 transition-all">
                   <div className="bg-sky-50 p-5 rounded-3xl text-sky-600 group-hover:bg-primary group-hover:text-white transition-all">
                      <Coins size={32} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Hard Cash</p>
                      <p className="text-2xl font-black text-slate-800">KES {stats.revenue.Cash.toLocaleString()}</p>
                   </div>
                </div>
                
                <div className="flex items-center gap-6 group hover:translate-x-2 transition-all border-x border-slate-50 px-10">
                   <div className="bg-teal-50 p-5 rounded-3xl text-teal-600 group-hover:bg-secondary group-hover:text-white transition-all">
                      <Wallet size={32} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">M-Pesa Transfers</p>
                      <p className="text-2xl font-black text-slate-800">KES {stats.revenue.Mpesa.toLocaleString()}</p>
                   </div>
                </div>

                <div className="flex items-center gap-6 group hover:translate-x-2 transition-all">
                   <div className="bg-red-50 p-5 rounded-3xl text-red-500">
                      <UserMinus size={32} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Unpaid Debt</p>
                      <p className="text-2xl font-black text-red-600">KES {stats.revenue.Debt.toLocaleString()}</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      ) : (
        <div className="text-center p-20 bg-white rounded-3xl border border-slate-100">
           <FileText size={48} className="text-slate-200 mx-auto mb-4" />
           <p className="text-slate-400 font-bold tracking-tight">No data found for this period.</p>
        </div>
      )}
    </div>
  );
}

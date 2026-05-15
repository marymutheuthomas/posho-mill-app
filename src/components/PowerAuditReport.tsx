import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, Zap, BarChart3, Loader2, Wallet, Coins, UserMinus } from 'lucide-react';

interface AuditStats {
  totalProductionKg: number;
  revenueByMethod: {
    Cash: number;
    Mpesa: number;
    Debt: number;
  };
  totalPowerCost: number;
}

export default function PowerAuditReport() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // 1. Fetch Total Output KG from production_logs
        const { data: logs } = await supabase.from('production_logs').select('output_qty');
        const productionKg = logs?.reduce((acc, curr) => acc + (curr.output_qty || 0), 0) || 0;

        // 2. Fetch Revenue by Payment Method
        const { data: txs } = await supabase.from('service_transactions').select('fee_charged, payment_method');
        const revenueByMethod = { Cash: 0, Mpesa: 0, Debt: 0 };
        
        txs?.forEach(tx => {
          const method = tx.payment_method as keyof typeof revenueByMethod;
          if (revenueByMethod[method] !== undefined) {
            revenueByMethod[method] += (tx.fee_charged || 0);
          } else {
            // Fallback for legacy data without payment_method
            revenueByMethod.Cash += (tx.fee_charged || 0);
          }
        });

        // 3. Fetch Total Power Cost from sessions
        const { data: sessions } = await supabase.from('milling_sessions').select('power_cost').eq('is_closed', true);
        const powerCost = sessions?.reduce((acc, curr) => acc + (curr.power_cost || 0), 0) || 0;

        setStats({
          totalProductionKg: productionKg,
          revenueByMethod,
          totalPowerCost: powerCost
        });
      } catch (err) {
        console.error("Audit fetch error", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) return <Loader2 className="animate-spin text-[#E0B0FF] mx-auto" />;
  if (!stats) return null;

  const totalRevenue = stats.revenueByMethod.Cash + stats.revenueByMethod.Mpesa + stats.revenueByMethod.Debt;
  const netMargin = totalRevenue - stats.totalPowerCost;
  const efficiency = stats.totalProductionKg > 0 
    ? (stats.totalPowerCost / stats.totalProductionKg).toFixed(2) 
    : '0.00';

  return (
    <div className="mt-16 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-[#5C4033] p-2 rounded-lg">
          <BarChart3 className="text-white" size={20} />
        </div>
        <div>
          <h3 className="text-xl font-black text-[#5C4033] uppercase tracking-tighter leading-none">Business Audit Summary</h3>
          <p className="text-[10px] text-[#5C4033]/40 font-bold uppercase tracking-widest mt-1">Real-time Profitability & Efficiency</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Revenue Breakdown */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] border-2 border-[#5C4033]/5 shadow-sm space-y-6">
           <p className="text-[10px] font-black text-[#5C4033]/40 uppercase tracking-widest">Revenue Breakdown</p>
           <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                 <div className="flex items-center gap-2 text-[#5C4033]/60 mb-2">
                    <Coins size={14} />
                    <span className="text-[10px] font-black uppercase tracking-tighter">Cash</span>
                 </div>
                 <p className="text-xl font-black text-[#5C4033]">KES {stats.revenueByMethod.Cash.toLocaleString()}</p>
              </div>
              <div className="space-y-1 border-x border-gray-100 px-4">
                 <div className="flex items-center gap-2 text-[#5C4033]/60 mb-2">
                    <Wallet size={14} />
                    <span className="text-[10px] font-black uppercase tracking-tighter">M-Pesa</span>
                 </div>
                 <p className="text-xl font-black text-[#5C4033]">KES {stats.revenueByMethod.Mpesa.toLocaleString()}</p>
              </div>
              <div className="space-y-1 pl-2">
                 <div className="flex items-center gap-2 text-red-400 mb-2">
                    <UserMinus size={14} />
                    <span className="text-[10px] font-black uppercase tracking-tighter">Debt</span>
                 </div>
                 <p className="text-xl font-black text-red-500">KES {stats.revenueByMethod.Debt.toLocaleString()}</p>
              </div>
           </div>
           <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs font-black text-[#5C4033] uppercase">Gross Revenue</span>
              <span className="text-2xl font-black text-[#5C4033]">KES {totalRevenue.toLocaleString()}</span>
           </div>
        </div>

        {/* Profitability / Net Margin */}
        <div className="bg-[#5C4033] p-8 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
          <div>
            <p className="text-[10px] font-black text-[#E0B0FF]/60 uppercase tracking-widest mb-1">Net Margin (Less Power)</p>
            <p className="text-3xl font-black text-white mb-2">KES {netMargin.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className={netMargin > 0 ? "text-green-400" : "text-red-400"} />
            <span className={`text-[10px] font-black uppercase tracking-widest ${netMargin > 0 ? "text-green-400" : "text-red-400"}`}>
               {netMargin > 0 ? 'Surplus Projection' : 'Deficit / Loss'}
            </span>
          </div>
        </div>

        {/* Efficiency Check */}
        <div className="bg-[#E0B0FF]/10 p-8 rounded-[2rem] border-2 border-[#E0B0FF]/20 flex flex-col justify-between">
           <div>
              <p className="text-[10px] font-black text-[#5C4033]/40 uppercase tracking-widest mb-1">Production Efficiency</p>
              <p className="text-3xl font-black text-[#5C4033]">{efficiency} <span className="text-sm opacity-40">KES/KG</span></p>
           </div>
           <div className="space-y-2">
              <div className="flex items-center gap-2 text-[#5C4033]/60">
                <Zap size={14} />
                <span className="text-[10px] font-black uppercase tracking-tighter">System Health</span>
              </div>
              <p className="text-[10px] text-[#5C4033]/60 font-bold leading-tight">
                {parseFloat(efficiency) > 10 
                  ? "Audit Warning: Power waste detected. Net margin compromised."
                  : "Mill efficiency is within optimal profit range."}
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}

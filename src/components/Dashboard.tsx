import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Zap, Play, Loader2,TrendingUp, Package, Users, AlertTriangle, ArrowRightCircle, Clock } from 'lucide-react';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    stock: 0,
    sales: 0,
    customers: 0,
    staleTransfers: 0
  });

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: sess } = await supabase
          .from('milling_sessions')
          .select('*')
          .eq('status', 'Started')
          .maybeSingle();
        
        setActiveSession(sess);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: pData } = await supabase.from('products').select('current_stock');
        const totalStock = pData?.reduce((acc, curr) => acc + (curr.current_stock || 0), 0) || 0;

        const { data: sData } = await supabase
          .from('service_transactions')
          .select('fee_charged')
          .gte('created_at', today.toISOString());
          
        const dailySales = sData?.reduce((acc, curr) => acc + (curr.fee_charged || 0), 0) || 0;

        // 3. Stale Transfers (Older than 24h)
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

        const { data: staleData } = await supabase
          .from('stock_transfers')
          .select('id')
          .eq('status', 'Pending')
          .lt('created_at', twentyFourHoursAgo.toISOString());

        setStats({
          stock: totalStock,
          sales: dailySales,
          customers: 0,
          staleTransfers: staleData?.length || 0
        });

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

  if (loading) return (
    <div className="flex justify-center p-20">
      <Loader2 className="animate-spin text-[#06B6D4]" size={48} />
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* Stale Transfer Alert (Admin High-Performance Monitor) */}
      {stats.staleTransfers > 0 && (
         <div className="bg-[#312e81] p-8 rounded-[2.5rem] shadow-2xl border-4 border-[#9333ea]/20 animate-pulse relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#9333ea]/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
               <div className="flex items-center gap-6">
                  <div className="bg-[#9333ea] p-4 rounded-3xl shadow-lg shadow-[#9333ea]/40">
                    <Clock className="text-white" size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-1">Stale Transfer Alert</h3>
                    <p className="text-[#a5b4fc] font-bold text-sm">
                      Inventory Lockdown Risk: {stats.staleTransfers} shipment(s) have been stuck in transit for >24 hours.
                    </p>
                  </div>
               </div>
               <button 
                 onClick={() => onNavigate('Stock Transfers')}
                 className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 backdrop-blur-md transition-all border border-white/10"
               >
                 Review Lockups <ArrowRightCircle size={18} />
               </button>
            </div>
         </div>
      )}

      {/* Top Banner / Session Quick Start */}
      <div className={`p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden transition-all duration-500 ${activeSession ? 'bg-emerald-600' : 'bg-[#4F46E5]'}`}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 text-white">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
               <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                 < Zap size={32} className={activeSession ? 'text-yellow-300 animate-pulse' : 'text-[#06B6D4]'} />
               </div>
               <h2 className="text-4xl font-black uppercase tracking-tighter">
                {activeSession ? 'System Active' : 'Mill Idle'}
               </h2>
            </div>
            <p className="text-white/70 font-bold max-w-md">
              {activeSession 
                ? `Session started at ${new Date(activeSession.created_at).toLocaleTimeString()}. Tracking power at rate 25 KES/kWh.`
                : 'No active milling session. Initialize the mill motor to start recording production and service sales.'}
            </p>
          </div>
          
          {!activeSession ? (
            <button 
              onClick={() => onNavigate('Production Hub')}
              className="bg-[#06B6D4] text-white px-10 py-6 rounded-2xl font-black text-xl uppercase tracking-widest shadow-[0_15px_30px_rgba(6,182,212,0.3)] hover:scale-105 transition-all flex items-center gap-4"
            >
              <Play size={24} /> Initialize Mill
            </button>
          ) : (
             <div className="bg-white/10 px-8 py-5 rounded-2xl border border-white/20 backdrop-blur-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-1">Active Meter Reading</p>
                <p className="text-3xl font-mono font-black">{activeSession.start_reading} <span className="text-xs uppercase opacity-40">kWh</span></p>
             </div>
          )}
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
            <div className="bg-[#4F46E5]/10 w-12 h-12 rounded-xl flex items-center justify-center text-[#4F46E5]">
              <Package size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Total Finished Stock</p>
              <h4 className="text-3xl font-black text-[#0F172A]">{stats.stock.toLocaleString()} <span className="text-sm opacity-40">KG</span></h4>
            </div>
         </div>
         <button 
           onClick={() => onNavigate('Insights & Audit')}
           className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4 text-left hover:border-emerald-200 transition-all group"
         >
            <div className="bg-emerald-50 w-12 h-12 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Today's Revenue</p>
              <h4 className="text-3xl font-black text-[#0F172A]">KES {stats.sales.toLocaleString()}</h4>
              <p className="text-[10px] text-emerald-600 font-bold uppercase mt-2 opacity-0 group-hover:opacity-100 transition-all">View Audit Hub →</p>
            </div>
         </button>
         <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
            <div className="bg-sky-50 w-12 h-12 rounded-xl flex items-center justify-center text-sky-600">
              <Users size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Client Base</p>
              <h4 className="text-3xl font-black text-[#0F172A]">Active System</h4>
            </div>
         </div>
      </div>
    </div>
  );
}

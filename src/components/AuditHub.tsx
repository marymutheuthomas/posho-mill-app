import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  TrendingUp, Wallet, 
  ArrowDownRight, ArrowUpRight, Scale, Calendar
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
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AuditStats | null>(null);
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
      const startUtc = new Date(sDate.getTime() - (3 * 60 * 60 * 1000)).toISOString(); // UTC+3 Midnight

      const eDate = new Date(endDate);
      eDate.setHours(23, 59, 59, 999);
      const endUtc = new Date(eDate.getTime() - (3 * 60 * 60 * 1000)).toISOString();

      const [prod, txs, sess, pur, productsRes, repayRes] = await Promise.all([
        supabase.from('production_logs').select('input_kg, main_output_kg, byproduct_kg, waste_kg').gte('created_at', startUtc).lte('created_at', endUtc),
        supabase.from('sales_transactions').select('total_price, payment_method, product_id, transaction_type').gte('created_at', startUtc).lte('created_at', endUtc),
        supabase.from('milling_sessions').select('session_type, start_meter, end_meter, power_cost, created_at').eq('is_closed', true).gte('created_at', startUtc).lte('created_at', endUtc),
        supabase.from('purchases').select('total_amount, category').gte('created_at', startUtc).lte('created_at', endUtc),
        supabase.from('products').select('id, milling_fee, selling_price, category'),
        supabase.from('repayments').select('amount').gte('created_at', startUtc).lte('created_at', endUtc)
      ]);

      const products = productsRes.data || [];
      const salesData = txs.data || [];
      const totalRepayments = repayRes.data?.reduce((acc, curr) => acc + (curr.amount || 0), 0) || 0;

      const intInput = prod.data?.reduce((acc, curr) => acc + Number(curr.input_kg || 0), 0) || 0;
      const intOutput = prod.data?.reduce((acc, curr) => acc + Number(curr.main_output_kg || 0), 0) || 0;
      const intWaste = prod.data?.reduce((acc, curr) => acc + Number(curr.waste_kg || 0), 0) || 0;

      // Classification Logic: Split Milling Service revenue from Retail Sales
      let millRev = 0;
      let retailRev = 0;
      let retailCount = 0;

      salesData.forEach(tx => {
        const p = products.find(x => x.id === tx.product_id);
        const pCategory = (p?.category || '').toLowerCase();
        const txCategory = (tx.transaction_type || '').toLowerCase();
        
        // Ensure Service maps to Milling Block
        if (pCategory === 'service' || pCategory === 'milling' || txCategory === 'service' || txCategory === 'milling') {
          millRev += Number(tx.total_price || 0);
        } 
        // Ensure Retail maps to Retail Block, and fallback "Other" or undefined to Retail
        else {
          retailRev += Number(tx.total_price || 0);
          retailCount++;
        }
      });

      const totalRev = millRev + retailRev;

      const revSplit = { cash: 0, mpesa: 0, debt: 0 };
      txs.data?.forEach(t => {
        if (t.payment_method === 'Cash') revSplit.cash += t.total_price;
        else if (t.payment_method === 'M-Pesa') revSplit.mpesa += t.total_price;
        else if (t.payment_method === 'Debt') revSplit.debt += t.total_price;
      });

      let intPower = 0, extPower = 0, totalPowerCost = 0;
      sess.data?.forEach(s => {
        const units = Number(s.end_meter || 0) - Number(s.start_meter || 0);
        if (s.session_type === 'Internal') intPower += units;
        else extPower += units;
        totalPowerCost += Number(s.power_cost) || (units * 25.79);
      });

      let leakage = 0;
      if (sess.data && sess.data.length > 0) {
        const sorted = [...sess.data].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const firstStart = Number(sorted[0].start_meter || 0);
        const lastEnd = Number(sorted[sorted.length - 1].end_meter || 0);
        const totalMeterDiff = lastEnd - firstStart;
        const sumUnitsUsed = intPower + extPower;
        
        leakage = totalMeterDiff - sumUnitsUsed;
        if (leakage < 0) leakage = 0; // Guard against weird reverse tracking
      }

      const totalPurchases = pur.data?.filter(c => {
        const cat = (c.category || '').toLowerCase();
        return cat.includes('grain') || cat.includes('stock');
      }).reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0) || 0;

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
          cash: revSplit.cash,
          mpesa: revSplit.mpesa,
          debt: revSplit.debt - totalRepayments, // Net Debt (Outstanding)
          purchases: totalPurchases,
          powerCost: totalPowerCost,
          netEarnings: (totalRev - (revSplit.debt - totalRepayments)) - totalPowerCost - totalPurchases
        },
        leakageUnits: leakage
      });
    } catch (err) { console.error(err); }
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

  if (loading) return <div className="p-20 text-center font-black text-slate-400 uppercase tracking-widest animate-pulse">Building Financial Reports...</div>;
  if (!stats) return null;

  return (
    <ErrorBoundary>
      <div className="max-w-7xl mx-auto space-y-12 pb-24">
        <div className="flex flex-col md:flex-row md:items-center justify-end gap-3 mb-4">
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2 p-1 bg-slate-100 border border-slate-200 rounded-xl">
              {(['today', 'week', 'month'] as const).map(p => (
                <button key={p} onClick={() => setDatePreset(p)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${preset === p ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-600 hover:text-slate-800'}`}>
                  {p}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
               <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1.5 rounded-lg shadow-sm">
                  <Calendar size={12} className="text-slate-400" />
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-[10px] font-black text-slate-900 border-none p-0 focus:ring-0 w-24" />
               </div>
               <span className="text-slate-300 text-xs font-bold">→</span>
               <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1.5 rounded-lg shadow-sm">
                  <Calendar size={12} className="text-slate-400" />
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-[10px] font-black text-slate-900 border-none p-0 focus:ring-0 w-24" />
               </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-10">
          {/* REPORT 1: INTERNAL PRODUCTION */}
          <div className="space-y-6">
            <div className="mill-card p-4 md:p-6 lg:p-8 bg-white border-slate-200 shadow-xl space-y-4 md:space-y-6 lg:space-y-8">
               <div className="flex justify-between items-start">
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Net Period Yield</p>
                   <h3 className="text-4xl font-black text-slate-950">{stats.internal.productionKg.toLocaleString()} KG</h3>
                 </div>
                 <div className="bg-slate-900 text-white p-3 rounded-xl"><Scale size={18} /></div>
               </div>
               
               <div className="space-y-4 pt-6 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                     <p className="text-[10px] font-black text-slate-500 uppercase">Input (101)</p>
                     <p className="text-sm font-black text-slate-900">{stats.internal.inputKg.toLocaleString()} KG</p>
                  </div>
                  <div className="flex justify-between items-center">
                     <p className="text-[10px] font-black text-slate-500 uppercase">Yield Rate</p>
                     <p className="text-sm font-black text-emerald-600">{stats.internal.yieldRate.toFixed(1)}%</p>
                  </div>
                  <div className="flex justify-between items-center">
                     <p className="text-[10px] font-black text-slate-500 uppercase">Waste Produced</p>
                     <p className="text-sm font-black text-red-600">{stats.internal.wasteKg.toLocaleString()} KG</p>
                  </div>
                  <div className="flex justify-between items-center">
                     <p className="text-[10px] font-black text-slate-500 uppercase">Power Consumed</p>
                     <p className="text-sm font-black text-slate-900">{stats.internal.powerUnits.toFixed(1)} kWh</p>
                  </div>
               </div>
            </div>
          </div>

          {/* REPORT 2: MILLING SERVICE (EXTERNAL) */}
          <div className="space-y-6">
            <div className="mill-card p-4 md:p-6 bg-white border-blue-100 shadow-xl space-y-4 md:space-y-6 border-t-4 border-t-blue-500">
               <div className="flex justify-between items-start">
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Service Revenue</p>
                   <h3 className="text-3xl font-black text-slate-950 font-mono">KES {stats.millingService.revenue.toLocaleString()}</h3>
                 </div>
                 <div className="bg-blue-600 text-white p-3 rounded-xl"><TrendingUp size={18} /></div>
               </div>
               
               <div className="space-y-4 pt-6 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                     <p className="text-[10px] font-black text-slate-500 uppercase">Power Consumed</p>
                     <p className="text-sm font-black text-slate-900">{stats.millingService.powerUnits.toFixed(1)} kWh</p>
                  </div>
                  <div className="flex justify-between items-center">
                     <p className="text-[10px] font-black text-slate-500 uppercase">Fee Efficiency</p>
                     <p className="text-sm font-black text-blue-600">{stats.millingService.efficiency.toFixed(2)} KES/kWh</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-xl mt-4">
                     <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">Operational Health</p>
                     <p className="text-xs font-bold text-blue-900">Revenue tracking integrated with power consumption metrics.</p>
                  </div>
               </div>
            </div>
          </div>

          {/* REPORT 3: RETAIL PRODUCT SALES */}
          <div className="space-y-6">
            <div className="mill-card p-4 md:p-6 bg-white border-emerald-100 shadow-xl space-y-4 md:space-y-6 border-t-4 border-t-emerald-500">
               <div className="flex justify-between items-start">
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Retail Revenue</p>
                   <h3 className="text-3xl font-black text-emerald-600 font-mono">KES {stats.retailSales.revenue.toLocaleString()}</h3>
                 </div>
               </div>
               
               <div className="space-y-4 pt-6 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                     <p className="text-[10px] font-black text-slate-500 uppercase">Items Sold</p>
                     <p className="text-sm font-black text-slate-900">{stats.retailSales.itemsSold} Transactions</p>
                  </div>
                  <div className="flex justify-between items-center">
                     <p className="text-[10px] font-black text-slate-500 uppercase">Avg. Sale Value</p>
                     <p className="text-sm font-black text-slate-900">KES {(stats.retailSales.revenue / (stats.retailSales.itemsSold || 1)).toFixed(0)}</p>
                  </div>
                  <div className="bg-emerald-900 p-6 rounded-2xl text-white mt-4">
                     <p className="text-[9px] font-black text-emerald-400 uppercase mb-2 tracking-widest">Cash Liquidity</p>
                     <p className="text-2xl font-black">KES {stats.retailSales.revenue.toLocaleString()}</p>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* MASTER PROFIT & LOSS (P&L) */}
        {/* MASTER PROFIT & LOSS (P&L) */}
        <div className="mill-card p-12 bg-white text-slate-900 border-slate-200 shadow-2xl relative overflow-hidden border-t-8 border-t-slate-900">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-12">
             <div className="space-y-4">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                   <Wallet className="text-emerald-600" size={24} />
                 </div>
                 <h3 className="text-3xl font-black uppercase tracking-tight text-slate-900">Net Profit & Loss</h3>
               </div>
               <div className="grid grid-cols-2 gap-4 md:gap-6 lg:gap-8">
                 <div>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Period Revenue</p>
                   <p className="text-2xl font-black text-slate-900 font-mono">KES {(stats.millingService.revenue + stats.retailSales.revenue).toLocaleString()}</p>
                 </div>
                 <div>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Operating Cost</p>
                   <p className="text-2xl font-black text-red-600 font-mono">KES {(stats.financials.powerCost + stats.financials.purchases).toLocaleString()}</p>
                 </div>
               </div>
             </div>

             <div className="text-right">
               <p className="text-[11px] font-black text-slate-500 uppercase mb-2">Net Period Earnings (P&L)</p>
               <h2 className={`text-5xl font-black tracking-tighter ${stats.financials.netEarnings >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>
                 KES {stats.financials.netEarnings.toLocaleString()}
               </h2>
               <div className="flex items-center justify-end gap-2 mt-4">
                  {stats.financials.netEarnings >= 0 ? <ArrowUpRight className="text-emerald-600" /> : <ArrowDownRight className="text-red-600" />}
                  <span className={`text-sm font-black uppercase ${stats.financials.netEarnings >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {stats.financials.netEarnings >= 0 ? 'Profitable' : 'Deficit'}
                  </span>
               </div>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pt-16 mt-16 border-t border-slate-100 relative z-10">
             <div>
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Total Power Cost</p>
                <p className="text-xl font-black text-slate-900 font-mono">KES {stats.financials.powerCost.toLocaleString()}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase">Electricity consumption</p>
             </div>
             <div>
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Raw Material Spend</p>
                <p className="text-xl font-black text-slate-900 font-mono">KES {stats.financials.purchases.toLocaleString()}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase">Inventory acquisition</p>
             </div>
             <div>
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Meter Leakage</p>
                <p className="text-xl font-black text-red-600 font-mono">{stats.leakageUnits.toFixed(2)} kWh</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase">Unaccounted period units</p>
             </div>
             <div>
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Debt Outstanding</p>
                <p className="text-xl font-black text-amber-600 font-mono">KES {stats.financials.debt.toLocaleString()}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase">Uncollected period revenue</p>
             </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

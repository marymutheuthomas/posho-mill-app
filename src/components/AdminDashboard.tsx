import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  AlertTriangle, CheckCircle, Landmark, Plus, Calendar, RefreshCw, 
  Package, ArrowUpRight, ArrowDownRight 
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataMutation } from '../hooks/useDataMutation';

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'Daily' | 'Growth'>('Daily');
  const [success, setSuccess] = useState('');

  
  const [expenseForm, setExpenseForm] = useState({
    category: 'Wages', amount: '', date: new Date().toISOString().split('T')[0], description: ''
  });

  const { data: finances } = useQuery({
    queryKey: ['financial-analysis'],
    queryFn: async () => {
      const { data, error } = await supabase.from('financial_analysis_view').select('*').single();
      if (error) throw error;
      return data;
    }
  });

  const { data: plSummary = [] } = useQuery({
    queryKey: ['pl-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.from('monthly_pl_summary').select('*').order('summary_month', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: reconData = [], isLoading: loadingRecon } = useQuery({
    queryKey: ['recon-audit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('financial_reconciliation_audit').select('*').order('audit_date', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const expenseMutation = useDataMutation({
    type: 'expense',
    queryKey: ['pl-summary'],
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('expenses').insert([payload]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      if (res.offline) {
        setSuccess('OFFLINE MODE: Expense queued.');
      } else {
        setSuccess('Expense recorded and synced.');
      }
      setIsExpenseModalOpen(false);
      setExpenseForm({ category: 'Wages', amount: '', date: new Date().toISOString().split('T')[0], description: '' });
      queryClient.invalidateQueries({ queryKey: ['pl-summary'] });
    }
  });

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    expenseMutation.mutate({
      category: expenseForm.category,
      amount: parseFloat(expenseForm.amount),
      expense_date: expenseForm.date,
      description: expenseForm.description
    });
  };

  if (loadingRecon && reconData.length === 0) return <div className="p-20 text-center bg-[#F9FAFB] min-h-screen text-[#5C4033] font-black tracking-widest animate-pulse">SYNCHRONIZING MASTER LEDGER...</div>;

  const currentMonth = plSummary[0] || { gross_revenue: 0, total_expenses: 0, net_profit: 0 };
  const profitsHealthy = currentMonth.net_profit >= 0;

  return (
    <div className="min-h-full bg-[#F9FAFB] -m-12 p-12 text-sm text-[#5C4033]">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {success && (
          <div className="bg-emerald-600 text-white p-6 rounded-2xl font-black flex items-center gap-4 shadow-xl animate-in slide-in-from-top duration-300">
            <CheckCircle size={24}/>{success}
          </div>
        )}
        
        {/* TOP BAR: FINANCIAL VITALITY */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
           <div className="bg-[#5C4033] col-span-1 md:col-span-2 p-10 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden group">
              <div className="relative z-10">
                 <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-2">Shelf Assets Valuation</p>
                 <p className="text-4xl font-black tabular-nums tracking-tighter">KES {finances?.inventory_valuation?.toLocaleString()}</p>
                 <div className="mt-6 flex gap-4">
                    <span className="bg-white/10 px-4 py-1.5 rounded-full text-[9px] font-black uppercase flex items-center gap-1"><Package size={12}/> Verified Inventory</span>
                 </div>
              </div>
              <Landmark size={180} className="absolute right-[-20px] top-[-20px] opacity-5 group-hover:scale-110 transition-transform duration-700"/>
           </div>

           <div className={`p-10 rounded-[2.5rem] shadow-sm border ${profitsHealthy ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#5C4033]/40 mb-2">Monthly Net Yield</p>
              <p className={`text-3xl font-black tabular-nums ${profitsHealthy ? 'text-green-600' : 'text-red-600'}`}>
                 KES {currentMonth.net_profit?.toLocaleString()}
              </p>
           </div>

           <div className="bg-white p-1 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2">
              <button onClick={() => setIsExpenseModalOpen(true)} className="w-full h-full rounded-[2.4rem] bg-gray-50 hover:bg-[#E0B0FF]/10 transition-all flex flex-col items-center justify-center gap-2 group">
                 <div className="bg-white p-3 rounded-2xl shadow-sm group-hover:scale-110 transition-transform"><Plus size={20} className="text-[#5C4033]"/></div>
                 <span className="text-[10px] font-black uppercase tracking-widest text-[#5C4033]/60">Log Expense</span>
              </button>
           </div>
        </div>

        {/* UNIFIED HUB: AUDIT VS GROWTH */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden">
           <div className="p-10 border-b border-gray-50 flex justify-between items-center bg-gray-50/10">
              <div className="flex bg-gray-100 p-1 rounded-2xl">
                 <button onClick={() => setViewMode('Daily')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'Daily' ? 'bg-[#5C4033] text-white shadow-xl' : 'text-gray-400'}`}>Daily Theft Audit</button>
                 <button onClick={() => setViewMode('Growth')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'Growth' ? 'bg-[#5C4033] text-white shadow-xl' : 'text-gray-400'}`}>Monthly Strategic P&L</button>
              </div>
              <button 
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['financial-analysis'] });
                  queryClient.invalidateQueries({ queryKey: ['pl-summary'] });
                  queryClient.invalidateQueries({ queryKey: ['recon-audit'] });
                }} 
                className="text-[#E0B0FF] hover:text-[#5C4033] transition-colors"
              >
                <RefreshCw size={24}/>
              </button>
           </div>

           <div className="overflow-x-auto">
              <table className="w-full text-left">
                 {viewMode === 'Daily' ? (
                   <>
                     <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest text-[#5C4033]/40">
                           <th className="px-12 py-8">Audit Date</th>
                           <th className="px-12 py-8">Consumption</th>
                           <th className="px-12 py-8">True Recovery</th>
                           <th className="px-12 py-8">Integrity Status</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {reconData.map((r) => {
                           const expected = r.total_units * 20 * 5;
                           const actual = (r.cash_total + r.mpesa_total + r.debt_total);
                           const drift = expected - r.actual_service_fees;
                           const theftWarn = drift > (expected * 0.1);
                           return (
                             <tr key={r.audit_date} className="group hover:bg-gray-50/30">
                                <td className="px-12 py-8 font-black text-gray-900">{new Date(r.audit_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                                <td className="px-12 py-8 text-gray-400 font-bold">{r.total_units?.toFixed(1)} kWh</td>
                                <td className="px-12 py-8 font-black text-xs text-[#5C4033]">KES {actual.toLocaleString()}</td>
                                <td className="px-12 py-8">
                                   {theftWarn ? (
                                     <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-100 text-red-800 rounded-full text-[10px] font-black uppercase animate-pulse">
                                        <AlertTriangle size={12}/> {drift.toLocaleString()} Missing
                                     </span>
                                   ) : (
                                     <span className="text-green-600 font-black text-[10px] uppercase flex items-center gap-1"><CheckCircle size={14}/> Verified</span>
                                   )}
                                </td>
                             </tr>
                           )
                        })}
                     </tbody>
                   </>
                 ) : (
                   <>
                     <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest text-[#5C4033]/40">
                           <th className="px-12 py-8">Month</th>
                           <th className="px-12 py-8">Revenue</th>
                           <th className="px-12 py-8">Expenses</th>
                           <th className="px-12 py-8">Net Profit</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {plSummary.map((m) => {
                           const healthy = m.net_profit >= 0;
                           return (
                             <tr key={m.summary_month} className="group hover:bg-gray-50/30">
                                <td className="px-12 py-8 font-black text-gray-400 flex items-center gap-3">
                                   <Calendar size={14}/> {new Date(m.summary_month).toLocaleString('default', { month: 'long', year: 'numeric' })}
                                </td>
                                <td className="px-12 py-8 font-bold">KES {m.gross_revenue.toLocaleString()}</td>
                                <td className="px-12 py-8 font-bold text-red-400">KES {m.total_expenses.toLocaleString()}</td>
                                <td className={`px-12 py-8 font-black ${healthy ? 'text-green-600' : 'text-red-600'}`}>
                                   {healthy ? <ArrowUpRight size={18} className="inline mr-1"/> : <ArrowDownRight size={18} className="inline mr-1"/>}
                                   KES {Math.abs(m.net_profit).toLocaleString()}
                                </td>
                             </tr>
                           )
                        })}
                     </tbody>
                   </>
                 )}
              </table>
           </div>
        </div>

        {/* EXPENSE MODAL */}
        {isExpenseModalOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#5C4033]/95 backdrop-blur-md">
              <div className="bg-white w-full max-w-lg rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300">
                 <h3 className="text-2xl font-black uppercase tracking-tighter mb-10 text-[#5C4033]">Operational Expense</h3>
                 <form onSubmit={handleAddExpense} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                       <select className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-4 font-bold" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}>
                          <option value="Rent">Rent</option><option value="Wages">Wages</option><option value="Repair">Repair</option><option value="Other">Other</option>
                       </select>
                       <input type="date" className="bg-gray-50 border border-gray-100 rounded-2xl px-4 font-bold" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})}/>
                    </div>
                    <input type="number" required placeholder="Amount KES" className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-5 text-4xl font-black" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})}/>
                    <div className="flex gap-4 pt-10">
                       <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="flex-1 font-black text-gray-400 uppercase tracking-widest text-[10px]">Close</button>
                       <button type="submit" className="flex-[2] bg-[#5C4033] text-white font-black py-4 rounded-2xl uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all">Record Bookkeeping</button>
                    </div>
                 </form>
              </div>
           </div>
        )}
      </div>
    </div>
  );
}

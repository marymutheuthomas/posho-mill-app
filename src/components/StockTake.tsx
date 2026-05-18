import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ClipboardCheck, AlertTriangle, 
  CheckCircle, RotateCcw, Save, History, Search, Eye, LayoutList, Clock, Pencil, Trash2, X
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDataMutation } from '../hooks/useDataMutation';

interface StockTakeProps {
  role: 'ADMIN' | 'EMPLOYEE' | null;
}

interface Product { 
  id: string; 
  product_code: string; 
  name: string; 
  current_stock: number; 
  category: string;
}

interface StockLog {
  id: string;
  created_at: string;
  product_name: string;
  system_stock: number;
  physical_stock: number;
  discrepancy: number;
  recorded_by: string;
}

export default function StockTake({ role }: StockTakeProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'Entry' | 'History'>('Entry');
  const [searchTerm, setSearchTerm] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [editModal, setEditModal] = useState<{ open: boolean; record: StockLog | null }>({ open: false, record: null });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; record: StockLog | null }>({ open: false, record: null });
  const [editForm, setEditForm] = useState({ physical: 0 });

  const isAdmin = role === 'ADMIN';

  // 1. Data Fetching
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('product_code', { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
    staleTime: 1000 * 60 * 5,
    meta: {
      onError: (err: any) => {
        if (err.code === '42501' || err.code === 'PGRST116') {
          setError('Access Restricted: You do not have permission to view products.');
        } else {
          setError('Failed to fetch products: ' + err.message);
        }
      }
    }
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['audit_history'],
    queryFn: async () => {
      if (!isAdmin) return [];
      const { data, error } = await supabase.from('stock_take_history').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data as StockLog[];
    },
    enabled: activeTab === 'History' && isAdmin,
    meta: {
      onError: (err: any) => {
        if (err.code === '42501' || err.code === 'PGRST116') {
          setError('Access Restricted: Audit History is for Admin eyes only.');
        } else {
          setError('Failed to fetch audit history: ' + err.message);
        }
      }
    }
  });


  // 2. Audit Submission Mutation (Offline-First)
  const auditMutation = useDataMutation({
    type: 'stock_take',
    queryKey: ['audit_history', 'products'],
    mutationFn: async (updates: any[]) => {
      // Step 1: Log History
      const { data: logData, error: logErr } = await supabase.from('stock_take_history').insert(updates).select();
      if (logErr) throw logErr;

      // Step 2: Variance Adjustments (Handled via secondary insert if needed, or rely on DB triggers)
      // Note: We'll push the logs, and a DB trigger should handle product stock synchronization.
      return logData;
    },
    onSuccess: (res) => {
      if (res.offline) {
        setSuccess('OFFLINE MODE: Audit queued for sync.');
      } else {
        setSuccess('Inventory reconciled and synchronized.');
      }
      setCounts({});
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      if (err.code === '42501' || err.code === 'PGRST116') {
        setError('Access Restricted: You do not have permission to record stock takes.');
      } else {
        setError(err.message || 'Audit submission failed.');
      }
    }
  });

  const editAuditMutation = useMutation({
    mutationFn: async ({ id, payload }: any) => {
      const { error } = await supabase.from('stock_take_history').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSuccess('Log updated.');
      setEditModal({ open: false, record: null });
      queryClient.invalidateQueries({ queryKey: ['audit_history'] });
    },
    onError: (err: any) => setError(err.message)
  });

  const deleteAuditMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stock_take_history').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSuccess('Log removed.');
      setDeleteModal({ open: false, record: null });
      queryClient.invalidateQueries({ queryKey: ['audit_history'] });
    },
    onError: (err: any) => setError(err.message)
  });

  const handleCountChange = (id: string, val: string) => {
    setCounts(prev => ({ ...prev, [id]: val }));
  };

  const submitStockTake = () => {
    setError(''); setSuccess('');
    const updates = Object.entries(counts)
      .filter(([_, val]) => val !== '')
      .map(([id, val]) => {
        const prod = products.find(p => p.id === id);
        
        const dateObj = new Date(targetDate);
        dateObj.setHours(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds());

        return {
          product_id: id,
          product_name: prod?.name || 'Unknown',
          physical_stock: parseFloat(val),
          system_stock: prod?.current_stock || 0,
          discrepancy: parseFloat(val) - (prod?.current_stock || 0),
          recorded_by: role || 'Staff',
          created_at: dateObj.toISOString()
        };
      });

    if (updates.length === 0) {
      setError('Enter physical counts.');
      return;
    }
    auditMutation.mutate(updates);
  };

  const handleEditAudit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.record) return;
    editAuditMutation.mutate({
      id: editModal.record.id,
      payload: { 
        physical_stock: editForm.physical,
        discrepancy: editForm.physical - editModal.record.system_stock
      }
    });
  };

  const handleDeleteAudit = () => {
    if (!deleteModal.record) return;
    deleteAuditMutation.mutate(deleteModal.record.id);
  };


  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.product_code.includes(searchTerm)
  );

  if ((loadingProducts || loadingHistory) && products.length === 0) return <div className="p-20 text-center font-semibold text-slate-400 uppercase tracking-widest animate-pulse text-sm md:text-base">Syncing Audit Registry...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 pb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-900 rounded-xl md:rounded-2xl flex items-center justify-center shadow-xl">
            <ClipboardCheck className="text-white w-6 h-6 md:w-7 md:h-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-4xl font-semibold text-slate-900 uppercase tracking-tight">Stock Audit</h1>
            <p className="text-[10px] md:text-xs font-medium text-slate-400 uppercase tracking-widest mt-1">
              Physical Verification Terminal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isAdmin && (
            <div className="flex p-1 bg-slate-100 rounded-lg mr-2 shadow-inner">
               <button onClick={() => setActiveTab('Entry')} className={`px-4 py-1.5 rounded-md text-[9px] font-semibold uppercase transition-all ${activeTab === 'Entry' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                 <LayoutList size={12} className="inline mr-1.5" /> Record
               </button>
               <button onClick={() => setActiveTab('History')} className={`px-4 py-1.5 rounded-md text-[9px] font-semibold uppercase transition-all ${activeTab === 'History' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                 <History size={12} className="inline mr-1.5" /> Log
               </button>
            </div>
          )}
          <div className="relative w-56 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
            <input 
              type="text" 
              placeholder="Search items..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="mill-input w-full pl-9 py-2 text-[10px] font-medium uppercase tracking-tight"
            />
          </div>
        </div>
      </div>

      {error && <div className="bg-red-600 text-white p-6 rounded-2xl font-black flex items-center gap-4 shadow-xl"><AlertTriangle size={24}/>{error}</div>}
      {success && <div className="bg-emerald-500 text-white p-6 rounded-2xl font-black flex items-center gap-4 shadow-xl"><CheckCircle size={24}/>{success}</div>}

      {activeTab === 'Entry' ? (
        <>
          <div className="mill-card p-0 overflow-hidden bg-white border-slate-100 shadow-2xl rounded-2xl max-w-4xl mx-auto">
            <div className="p-4 md:p-8 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div className="flex items-center gap-4">
                 <h3 className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-widest">Physical Reconciliation</h3>
                 <input 
                   type="date" 
                   value={targetDate} 
                   onChange={e => setTargetDate(e.target.value)}
                   className="text-[11px] font-semibold text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg outline-none cursor-pointer shadow-sm"
                 />
               </div>
               <div className="flex items-center gap-2 text-[9px] font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 uppercase">
                  <Eye size={12} className="text-amber-500" /> Blind Entry Mode
               </div>
            </div>
            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden md:block overflow-x-auto whitespace-nowrap">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Product / Grade</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Category</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Measured Physical Count (KG)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{p.product_code}</p>
                        <p className="text-sm font-bold text-slate-900 uppercase tracking-tighter">{p.name}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                         <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[9px] font-semibold uppercase tracking-widest">{p.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative group max-w-[200px] mx-auto md:ml-0">
                          <input 
                            type="number" 
                            step="0.01"
                            value={counts[p.id] || ''}
                            onChange={(e) => handleCountChange(p.id, e.target.value)}
                            placeholder="0.00"
                            className="mill-input w-full text-lg font-black bg-slate-50 border-slate-200 focus:bg-white focus:border-slate-900 transition-all py-3 text-center"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">KG</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (Visible only on Mobile) */}
            <div className="md:hidden divide-y divide-slate-50">
              {filteredProducts.map(p => (
                <div key={p.id} className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[9px] font-semibold text-slate-400 uppercase">{p.product_code}</p>
                      <p className="text-base font-semibold text-slate-900 uppercase tracking-tight">{p.name}</p>
                    </div>
                  </div>
                  <div className="relative group w-full">
                    <input 
                      type="number" 
                      step="0.01"
                      value={counts[p.id] || ''}
                      onChange={(e) => handleCountChange(p.id, e.target.value)}
                      placeholder="0.00"
                      className="mill-input w-full text-2xl font-semibold bg-slate-50 border-slate-100 focus:bg-white focus:border-slate-900 transition-all py-5 text-center text-base"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-300 uppercase">KG</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 p-3 border rounded-xl bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-4 max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center">
                  <Save size={20} className="text-slate-500" />
                </div>
                <div>
                   <h3 className="text-sm font-bold text-slate-900 uppercase">Finalize Reconciliation</h3>
                   <p className="text-[10px] leading-tight text-slate-500 mb-2">
                     Physical counts will be verified against system theoretical stock.
                   </p>
                </div>
            </div>
            <button 
              onClick={submitStockTake}
              disabled={auditMutation.isPending}
              className={`w-full md:w-auto h-12 md:h-10 px-8 text-sm md:text-xs font-black rounded-lg flex items-center justify-center gap-3 shadow-md transition-all shrink-0 ${
                auditMutation.isPending 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-75' 
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              <CheckCircle size={20} className="shrink-0" />
              <span>
                {auditMutation.isPending ? 'SYNCING...' : 'FINALIZE AUDIT'}
              </span>
            </button>
          </div>
        </>
      ) : isAdmin ? (
        <div className="mill-card p-0 overflow-hidden bg-white border-slate-200 shadow-2xl max-w-5xl mx-auto">
           <div className="p-8 border-b border-slate-200 flex items-center justify-between bg-slate-900">
              <h3 className="text-lg font-black text-white uppercase tracking-tight">Audit Trail & Discrepancy Ledger</h3>
              <div className="flex items-center gap-4">
                 <button onClick={() => queryClient.invalidateQueries({ queryKey: ['audit_history'] })} className="p-2 text-white/40 hover:text-white transition-all"><RotateCcw size={18}/></button>
                 <div className="text-[10px] font-black text-red-400 bg-white/5 px-4 py-2 rounded-lg border border-white/10 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle size={14} className="text-red-500" /> Restricted Admin Access
                 </div>
              </div>
           </div>
           <div className="overflow-x-auto whitespace-nowrap">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date / Time</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Item Name</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">System Record</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Physical Entry</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Discrepancy</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="text-[11px] font-semibold text-slate-900">{new Date(log.created_at).toLocaleDateString()}</p>
                        <p className="text-[9px] font-medium text-slate-400 uppercase flex items-center gap-1"><Clock size={10}/> {new Date(log.created_at).toLocaleTimeString()}</p>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900 uppercase text-xs">{log.product_name}</td>
                      <td className="px-6 py-4">
                         <p className="text-sm font-semibold text-slate-400">{log.system_stock.toLocaleString()} KG</p>
                      </td>
                      <td className="px-6 py-4">
                         <p className="text-sm font-semibold text-slate-900">{log.physical_stock.toLocaleString()} KG</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <div className={`flex flex-col items-end gap-1 font-mono font-semibold ${log.discrepancy < 0 ? 'text-red-600' : log.discrepancy > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <span className={`px-3 py-1 rounded-lg text-xs border ${log.discrepancy < 0 ? 'bg-red-50 border-red-100' : log.discrepancy > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                               {log.discrepancy > 0 ? `+${log.discrepancy.toLocaleString()}` : log.discrepancy.toLocaleString()} KG
                            </span>
                            <span className="text-[9px] uppercase tracking-widest font-sans font-medium">{log.discrepancy < 0 ? 'Deficit' : log.discrepancy > 0 ? 'Surplus' : 'Balanced'}</span>
                         </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditForm({ physical: log.physical_stock }); setEditModal({ open: true, record: log }); }} className="p-2 bg-slate-100 text-slate-400 hover:text-slate-900 rounded-lg transition-all"><Pencil size={14}/></button>
                            <button onClick={() => setDeleteModal({ open: true, record: log })} className="p-2 bg-red-50 text-red-400 hover:text-red-600 rounded-lg transition-all"><Trash2 size={14}/></button>
                         </div>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-10 py-32 text-center text-slate-300 font-black uppercase tracking-widest italic opacity-50">No verified audit logs found in the registry</td>
                    </tr>
                  )}
                </tbody>
              </table>
           </div>
        </div>
      ) : (
        <div className="mill-card p-10 md:p-20 text-center text-slate-400 font-semibold uppercase tracking-widest italic text-xs md:text-sm">
          Restricted: Audit History is Admin only.
        </div>
      )}

      {/* EDIT MODAL */}
      {editModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Edit Audit Entry</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Adjust Physical Measurement</p>
              </div>
              <button onClick={() => setEditModal({ open: false, record: null })} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20}/></button>
            </div>
            <form onSubmit={handleEditAudit} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Product</label>
                <input disabled type="text" value={editModal.record?.product_name} className="mill-input w-full font-bold bg-slate-50 text-slate-400" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">New Physical Count (KG)</label>
                <input required type="number" step="0.01" value={editForm.physical} onChange={e => setEditForm({ physical: parseFloat(e.target.value) })} className="mill-input w-full font-bold text-2xl" />
              </div>
              <button type="submit" disabled={editAuditMutation.isPending} className="mill-btn-primary w-full py-4 shadow-xl">
                {editAuditMutation.isPending ? 'UPDATING...' : '✓ SAVE CHANGES'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-red-600 text-white text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter">Delete Log?</h3>
              <p className="text-xs text-red-100 font-bold uppercase mt-1 leading-relaxed">
                This will remove the discrepancy record for <span className="font-black text-white">{deleteModal.record?.product_name}</span>.
              </p>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <button onClick={() => setDeleteModal({ open: false, record: null })} className="py-4 rounded-xl bg-slate-100 text-slate-600 font-black text-xs uppercase hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={handleDeleteAudit} disabled={deleteAuditMutation.isPending} className="py-4 rounded-xl bg-red-600 text-white font-black text-xs uppercase hover:bg-red-700 transition-all shadow-lg shadow-red-200">
                {deleteAuditMutation.isPending ? 'DELETING...' : 'YES, DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

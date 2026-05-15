import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  User as UserIcon, Wallet, ArrowUpCircle, History, 
  CheckCircle, AlertTriangle, Search, UserPlus, 
  Activity, Pencil, Trash2, X, Phone
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDataMutation } from '../hooks/useDataMutation';

interface DebtRecord {
  id: string;
  customer_name: string;
  customer_phone: string;
  original_debt: number;
  amount_paid: number;
  updated_at: string;
}

export default function DebtLedger() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [repayModal, setRepayModal] = useState<{ open: boolean; customer: DebtRecord | null }>({ open: false, customer: null });
  const [repayAmount, setRepayAmount] = useState('');

  // Modal States
  const [newCustomerModal, setNewCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [editModal, setEditModal] = useState<{ open: boolean; customer: DebtRecord | null }>({ open: false, customer: null });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; customer: DebtRecord | null }>({ open: false, customer: null });
  const [editForm, setEditForm] = useState({ name: '', phone: '', debt: 0 });

  // 1. Unified Debt Registry Query
  const { data: debts = [], isLoading: loading } = useQuery({
    queryKey: ['debts'],
    queryFn: async () => {
      const [salesRes, dbRes] = await Promise.all([
        supabase.from('sales_transactions').select('customer_name, total_price, payment_method, amount_debt').in('payment_method', ['Debt', 'Credit']),
        supabase.from('debt_book').select('*')
      ]);

      if (dbRes.error) throw dbRes.error;

      let debtMap = new Map<string, DebtRecord>();

      // Sum raw sales
      if (salesRes.data) {
        salesRes.data.forEach(tx => {
          if (!tx.customer_name || tx.customer_name.toLowerCase().includes('walk-in')) return;
          const key = tx.customer_name.toLowerCase().trim();
          if (!debtMap.has(key)) {
            debtMap.set(key, {
              id: 'raw-' + crypto.randomUUID(),
              customer_name: tx.customer_name,
              customer_phone: 'Unregistered',
              original_debt: 0,
              amount_paid: 0,
              updated_at: new Date().toISOString()
            });
          }
          const rec = debtMap.get(key)!;
          if (tx.amount_debt !== undefined && tx.amount_debt !== null) {
            rec.original_debt += Number(tx.amount_debt);
          } else {
            rec.original_debt += Number(tx.total_price || 0);
          }
        });
      }

      // Merge with registry
      (dbRes.data || []).forEach(d => {
        const key = (d.customer_name || '').toLowerCase().trim();
        if (!key) return;
        if (debtMap.has(key)) {
          const rec = debtMap.get(key)!;
          rec.id = d.id;
          rec.customer_phone = d.customer_phone || rec.customer_phone;
          rec.original_debt = Math.max(rec.original_debt, Number(d.original_debt || 0));
          rec.amount_paid = Number(d.amount_paid || 0);
          rec.updated_at = d.updated_at;
        } else {
          debtMap.set(key, {
            id: d.id,
            customer_name: d.customer_name,
            customer_phone: d.customer_phone || 'N/A',
            original_debt: Number(d.original_debt || 0),
            amount_paid: Number(d.amount_paid || 0),
            updated_at: d.updated_at || new Date().toISOString()
          });
        }
      });

      return Array.from(debtMap.values()).sort((a,b) => a.customer_name.localeCompare(b.customer_name));
    },
    staleTime: 1000 * 60 * 5,
    meta: {
      onError: (err: any) => {
        if (err.code === '42501' || err.code === 'PGRST116') {
          setError('Access Restricted: Customer Debt Registry is reserved for Admin oversight.');
        } else {
          setError('Failed to sync debt ledger: ' + err.message);
        }
      }
    }
  });

  // 2. Mutations (Offline-First)
  const addCustomerMutation = useDataMutation({
    type: 'repayment' as any,
    queryKey: ['debts'],
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('debt_book').insert([payload]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      if (res?.offline) {
        setSuccess('OFFLINE MODE: Customer queued.');
      } else {
        setSuccess('Customer registered successfully.');
      }
      setNewCustomerModal(false);
      setNewCustomer({ name: '', phone: '' });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: (err: any) => {
      if (err.code === '42501' || err.code === 'PGRST116') {
        setError('Access Restricted: You do not have permission to register customers.');
      } else {
        setError(err.message || 'Registration failed.');
      }
    }
  });

  const repayMutation = useDataMutation({
    type: 'repayment',
    queryKey: ['debts'],
    mutationFn: async ({ customer_name, amount_paid }: any) => {
      const { data, error } = await supabase
        .from('repayments')
        .insert([{ 
          customer_name: customer_name.toUpperCase().trim(), 
          amount_paid: Number(amount_paid) 
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      if (res?.offline) {
        setSuccess('OFFLINE MODE: Repayment queued.');
      } else {
        setSuccess('Repayment recorded and synced.');
      }
      setRepayModal({ open: false, customer: null });
      setRepayAmount('');
      queryClient.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: (err: any) => {
      if (err.code === '42501' || err.code === 'PGRST116') {
        setError('Access Restricted: You do not have permission to record repayments.');
      } else {
        setError(err.message || 'Repayment failed.');
      }
    }
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, payload }: any) => {
      const { error } = await supabase.from('debt_book').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
       setSuccess('Account updated.');
       setEditModal({ open: false, customer: null });
       queryClient.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: (err: any) => setError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('debt_book').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSuccess('Record deleted.');
      setDeleteModal({ open: false, customer: null });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: (err: any) => setError(err.message)
  });

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!newCustomer.name || !newCustomer.phone) return;
    if (debts.find(d => d.customer_name.toLowerCase() === newCustomer.name.toLowerCase())) {
      setError(`Duplicate detected: '${newCustomer.name}' already exists.`);
      return;
    }
    addCustomerMutation.mutate({
      customer_name: newCustomer.name.trim().toUpperCase(),
      customer_phone: newCustomer.phone.trim(),
      original_debt: 0,
      amount_paid: 0
    });
  };

  const handleRepayment = () => {
    if (!repayModal.customer || !repayAmount) return;
    const amount = parseFloat(repayAmount);
    if (isNaN(amount) || amount <= 0) return;
    repayMutation.mutate({
      customer_name: repayModal.customer.customer_name,
      amount_paid: amount
    });
  };

  const openEditModal = (customer: DebtRecord) => {
    setEditForm({ name: customer.customer_name, phone: customer.customer_phone, debt: customer.original_debt });
    setEditModal({ open: true, customer });
  };

  const handleEditCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.customer) return;
    editMutation.mutate({
      id: editModal.customer.id,
      payload: { customer_name: editForm.name, customer_phone: editForm.phone, original_debt: editForm.debt }
    });
  };

  const handleDeleteCustomer = () => {
    if (!deleteModal.customer) return;
    deleteMutation.mutate(deleteModal.customer.id);
  };

  const filteredDebts = debts.filter(d => 
    d.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.customer_phone.includes(searchTerm)
  );

  const totalDebtExposure = debts.reduce((acc, curr) => acc + (curr.original_debt - curr.amount_paid), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
          <Activity size={12} className="animate-pulse" />
          Total Exposure: KES {totalDebtExposure.toLocaleString()}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => setNewCustomerModal(true)} className="mill-btn-primary px-6 py-2.5 text-[10px] flex items-center justify-center gap-2 rounded-xl">
            <UserPlus size={16} /> NEW CUSTOMER
          </button>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input type="text" placeholder="Filter customers..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              autoComplete="off" autoCorrect="off"
              className="mill-input w-full pl-12 h-[52px]" />
          </div>
        </div>
      </div>

      {error && <div className="bg-red-600 text-white p-4 rounded-xl font-black flex items-center gap-3 shadow-lg"><AlertTriangle size={20}/>{error}</div>}
      {success && <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-900 p-4 rounded-xl font-bold flex items-center gap-3"><CheckCircle size={20}/>{success}</div>}

      {loading ? (
        <div className="p-20 text-center font-black text-slate-300 animate-pulse">Syncing Ledger...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDebts.map(d => {
            const currentBalance = d.original_debt - d.amount_paid;
            return (
              <div key={d.id} className="mill-card p-6 flex flex-col justify-between hover:border-mill-primary transition-all">
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                      <UserIcon size={18} className="text-slate-400" />
                    </div>
                    <div className="text-right">
                      <p className={`text-[13px] font-black ${currentBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        KES {currentBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 uppercase">{d.customer_name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-[10px] font-medium text-slate-400 tracking-widest">{d.customer_phone}</p>
                      {d.customer_phone && d.customer_phone !== 'Unregistered' && (
                        <a 
                          href={`tel:${d.customer_phone}`}
                          className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                          title="Call Customer"
                        >
                          <Phone size={14} fill="currentColor" className="opacity-80" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                    <History size={12} className="text-slate-300" />
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-tighter">Active: {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : 'No activity'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-slate-50">
                  {!d.id.startsWith('raw-') && (
                    <>
                      <button onClick={() => openEditModal(d)} className="p-3 bg-slate-100 text-slate-600 rounded-xl"><Pencil size={16}/></button>
                      <button onClick={() => setDeleteModal({ open: true, customer: d })} className="p-3 bg-red-50 text-red-600 rounded-xl"><Trash2 size={16}/></button>
                    </>
                  )}
                  <button onClick={() => setRepayModal({ open: true, customer: d })} className="flex-1 bg-slate-900 text-white py-3.5 rounded-xl text-[10px] font-semibold uppercase shadow-lg hover:bg-emerald-600 transition-all flex items-center justify-center gap-2">
                    <ArrowUpCircle size={16} /> Pay
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 overflow-hidden mt-8 shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-10 py-6 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">Customer</th>
              <th className="px-10 py-6 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">Borrowed</th>
              <th className="px-10 py-6 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">Repaid</th>
              <th className="px-10 py-6 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">Clearance</th>
              <th className="px-10 py-6 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">Balance</th>
              <th className="px-10 py-6 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">Last Payment</th>
              <th className="px-10 py-6 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredDebts.map(d => (
              <tr key={d.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-10 py-6">
                  <p className="text-sm font-semibold text-slate-900 uppercase">{d.customer_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-slate-400 font-medium">{d.customer_phone}</p>
                    {d.customer_phone && d.customer_phone !== 'Unregistered' && (
                      <a 
                        href={`tel:${d.customer_phone}`}
                        className="text-emerald-600 hover:text-emerald-700 transition-colors"
                        title="Call Customer"
                      >
                        <Phone size={12} fill="currentColor" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-10 py-6">
                  <p className="text-sm font-black text-slate-900">KES {d.original_debt?.toLocaleString()}</p>
                </td>
                <td className="px-10 py-6">
                  <p className="text-sm font-black text-emerald-600">KES {d.amount_paid?.toLocaleString()}</p>
                </td>
                <td className="px-10 py-6 w-48">
                  <div className="flex items-center gap-3">
                     <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${Math.min(100, (d.amount_paid/(d.original_debt||1))*100)}%` }}></div>
                     </div>
                  </div>
                </td>
                <td className="px-10 py-6">
                  <p className={`text-[11px] font-black ${(d.original_debt - d.amount_paid) > 0 ? 'text-red-600' : 'text-slate-900'}`}>KES {(d.original_debt - d.amount_paid).toLocaleString()}</p>
                </td>
                <td className="px-10 py-6">
                  <p className="text-[10px] font-black text-slate-500">{new Date(d.updated_at).toLocaleDateString()}</p>
                </td>
                <td className="px-10 py-6 text-right">
                  <div className="flex items-center justify-end gap-2">
                     {!d.id.startsWith('raw-') && (
                       <>
                         <button onClick={() => openEditModal(d)} className="p-2.5 bg-slate-100 text-slate-400 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-all" title="Edit">
                           <Pencil size={16} />
                         </button>
                         <button onClick={() => setDeleteModal({ open: true, customer: d })} className="p-2.5 bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-xl transition-all" title="Delete">
                           <Trash2 size={16} />
                         </button>
                       </>
                     )}
                     <button onClick={() => setRepayModal({ open: true, customer: d })}
                      className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-emerald-600 transition-all">
                      Record Payment
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Customer Modal */}
      {newCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-8 space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserPlus className="text-white" size={32} />
                </div>
                <h3 className="text-xl font-black text-mill-text uppercase tracking-tight">Register Customer</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Add to Debt Book Registry</p>
              </div>

              <form onSubmit={handleAddCustomer} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Full Name</label>
                  <input type="text" required value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} placeholder="e.g. MAMA SARAH"
                    className="mill-input w-full" autoFocus />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Phone Number</label>
                  <input type="text" required value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} placeholder="0712..."
                    className="mill-input w-full" />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setNewCustomerModal(false)} className="flex-1 py-4 font-black text-xs uppercase text-slate-400">CANCEL</button>
                  <button type="submit" disabled={addCustomerMutation.isPending} className="mill-btn-primary flex-1 py-4 text-xs uppercase tracking-widest">
                    {addCustomerMutation.isPending ? 'REGISTERING...' : 'REGISTER'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Repayment Modal */}
      {repayModal.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-8 space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Wallet className="text-emerald-500" size={32} />
                </div>
                <h3 className="text-xl font-black text-mill-text uppercase tracking-tight">Debt Repayment</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">{repayModal.customer?.customer_name}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Repayment Amount (KES)</label>
                  <input type="number" 
                    inputMode="decimal" autoComplete="off" autoCorrect="off"
                    value={repayAmount} onChange={e => setRepayAmount(e.target.value)} placeholder="0.00"
                    className="mill-input w-full text-3xl font-black py-6 border-slate-200" autoFocus />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => setRepayModal({ open: false, customer: null })} className="flex-1 py-4 font-black text-xs uppercase text-slate-400">CANCEL</button>
                <button onClick={handleRepayment} disabled={repayMutation.isPending} className="mill-btn-primary flex-1 py-4 text-xs uppercase tracking-widest">
                  {repayMutation.isPending ? 'PROCESSING...' : 'CONFIRM PAYMENT'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* EDIT CUSTOMER MODAL */}
      {editModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Edit Account</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Update Registry Details</p>
              </div>
              <button onClick={() => setEditModal({ open: false, customer: null })} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20}/></button>
            </div>
            <form onSubmit={handleEditCustomer} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Customer Name</label>
                <input required type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="mill-input w-full font-bold uppercase" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Phone Number</label>
                <input required type="text" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="mill-input w-full font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Original Debt (Base Balance)</label>
                <input required type="number" value={editForm.debt} onChange={e => setEditForm({...editForm, debt: parseFloat(e.target.value)})} className="mill-input w-full font-bold" />
              </div>
              <button type="submit" disabled={editMutation.isPending} className="mill-btn-primary w-full py-4 uppercase font-black tracking-widest shadow-xl">
                {editMutation.isPending ? 'SAVING CHANGES...' : '✓ SAVE UPDATES'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-red-600 text-white text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter">Confirm Deletion</h3>
              <p className="text-xs text-red-100 font-bold uppercase mt-1 leading-relaxed">
                Are you sure you want to delete <span className="font-black text-white">{deleteModal.customer?.customer_name}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <button onClick={() => setDeleteModal({ open: false, customer: null })} className="py-4 rounded-xl bg-slate-100 text-slate-600 font-black text-xs uppercase hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={handleDeleteCustomer} disabled={deleteMutation.isPending} className="py-4 rounded-xl bg-red-600 text-white font-black text-xs uppercase hover:bg-red-700 transition-all shadow-lg shadow-red-200">
                {deleteMutation.isPending ? 'DELETING...' : 'YES, DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

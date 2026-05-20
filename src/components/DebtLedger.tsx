import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  User as UserIcon, ArrowUpCircle, 
  CheckCircle, AlertTriangle, Search, UserPlus, 
  Activity, Pencil, Trash2, X, Notebook, Landmark
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDataMutation } from '../hooks/useDataMutation';

interface DebtRecord {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  original_debt: number;
  amount_paid: number;
  current_balance: number;
  last_transaction_date: string;
}

interface DebtLedgerProps {
  role?: 'ADMIN' | 'EMPLOYEE' | string | null;
}

export default function DebtLedger({ role }: DebtLedgerProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Side-by-side selection target
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Modal States for Customer Administration
  const [newCustomerModal, setNewCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [editModal, setEditModal] = useState<{ open: boolean; customer: DebtRecord | null }>({ open: false, customer: null });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; customer: DebtRecord | null }>({ open: false, customer: null });
  const [editForm, setEditForm] = useState({ name: '', phone: '', debt: 0 });

  // 1. Fetch data from our pristine database view
  const { data: debts = [], isLoading: loading } = useQuery({
    queryKey: ['debts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_debt_summary')
        .select('*');

      if (error) throw error;
      return (data || []).sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || '')) as DebtRecord[];
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

  const activeCustomer = debts.find(d => d.id === selectedCustomerId);

  // 2. Offline-First Registry & Repay Mutations
  const addCustomerMutation = useDataMutation({
    type: 'repayment' as any, // queued correctly in pendings
    queryKey: ['debts'],
    mutationFn: async (payload: any) => {
      const { recorded_by, ...cleanPayload } = payload;
      const { data, error } = await supabase.from('debt_book').insert([cleanPayload]).select();
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
    queryKey: ['repayments'],
    mutationFn: async (payload: { customer_id: string; amount: number; notes: string }) => {
      // Explicitly construct a fresh, plain object literal
      const networkPayload = {
        customer_id: payload.customer_id,
        amount: Number(payload.amount),
        notes: payload.notes || ''
      };

      // Force remove any ghost keys that might be hiding in the object prototype or state tracking
      delete (networkPayload as any).customer_name;
      delete (networkPayload as any).customer_phone;

      // Execute the call with the absolutely stripped payload
      const { data, error } = await supabase
        .from('repayments')
        .insert([networkPayload])
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
      setSelectedCustomerId(null);
      setPaymentAmount('');
      setPaymentNotes('');
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt_book'] });
      queryClient.invalidateQueries({ queryKey: ['repayments'] });
    },
    onError: (err: any) => {
      setFormError(err.message || 'An error occurred updating the ledger.');
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
      setSelectedCustomerId(null);
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

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !paymentAmount) return;
    setFormError(null);

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setFormError('Please enter a valid monetary amount.');
      return;
    }

    if (activeCustomer && amount > activeCustomer.current_balance) {
      setFormError(`Payment exceeds outstanding balance of KES ${(activeCustomer.current_balance || 0).toLocaleString()}`);
      return;
    }

    repayMutation.mutate({
      customer_id: selectedCustomerId,
      amount: amount,
      notes: paymentNotes.trim()
    });
  };

  const openEditModal = (customer: DebtRecord) => {
    setEditForm({ name: customer.customer_name, phone: customer.customer_phone || '', debt: customer.original_debt });
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
    (d.customer_phone || '').includes(searchTerm)
  );

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredDebts.length / itemsPerPage) || 1;
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validCurrentPage - 1) * itemsPerPage;
  const paginatedDebts = filteredDebts.slice(startIndex, startIndex + itemsPerPage);

  const totalDebtExposure = debts.reduce((acc, curr) => acc + (curr.current_balance || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-3 sm:p-6 overflow-x-hidden animate-in fade-in duration-300">
      
      {/* Top Exposure & Controls Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 md:p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="space-y-1.5">
          <div className="bg-red-50 border border-red-100 text-red-700 px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 w-fit">
            <Activity size={14} className="animate-pulse" />
            Total Outstanding Balance: KSh {totalDebtExposure.toLocaleString()}
          </div>
          <h2 className="text-xl font-medium text-slate-900 tracking-tight mt-1 uppercase">Master Debt Registry</h2>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Synchronized with Supabase Ledger Engine</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {role === 'ADMIN' && (
            <button 
              onClick={() => setNewCustomerModal(true)} 
              className="px-5 py-3 text-sm font-medium uppercase tracking-wide bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white flex items-center justify-center gap-2 rounded-xl transition-all shadow-sm h-12"
            >
              <UserPlus size={18} /> REGISTER CUSTOMER
            </button>
          )}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Filter profiles..." 
              value={searchTerm} 
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              autoComplete="off" 
              autoCorrect="off"
              className="w-full pl-12 pr-4 h-12 rounded-xl border border-slate-200 bg-slate-50/50 text-base font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder-slate-400 max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" 
            />
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl font-medium flex items-center gap-3"><AlertTriangle size={20} className="text-red-600 flex-shrink-0" />{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 p-4 rounded-xl font-medium flex items-center gap-3"><CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />{success}</div>}

      {loading ? (
        <div className="p-20 text-center font-normal text-slate-400 animate-pulse uppercase tracking-widest text-sm">Syncing Ledger...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT & CENTER PANELS: Uncollapsed Responsive Flex Rows List */}
          <div className="lg:col-span-2 space-y-4">
            
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-3 max-md:p-2">
              <div className="w-full overflow-x-auto scrollbar-thin">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200 max-md:text-[11px] max-md:font-medium max-md:tracking-tight">
                      <th className="px-2 py-1.5 md:px-4 md:py-3 max-md:font-medium">Customer Details</th>
                      <th className="px-2 py-1.5 md:px-4 md:py-3 text-right w-24 max-md:font-medium">Borrowed</th>
                      <th className="px-2 py-1.5 md:px-4 md:py-3 text-right w-24 max-md:font-medium">Repaid</th>
                      <th className="px-2 py-1.5 md:px-4 md:py-3 text-right w-28 max-md:font-medium">Balance</th>
                      <th className="px-2 py-1.5 md:px-4 md:py-3 text-center w-40 max-md:font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedDebts.map(d => {
                      const isSelected = d.id === selectedCustomerId;
                      return (
                        <tr 
                          key={d.id} 
                          className={`hover:bg-slate-50/50 transition-colors text-xs text-slate-600 max-md:text-[11px] max-md:font-normal ${isSelected ? 'bg-amber-50/20' : ''}`}
                        >
                          {/* Client details */}
                          <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap max-md:text-[11px]">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-400 shrink-0 max-md:w-5 max-md:h-5">
                                <UserIcon size={12} />
                              </div>
                              <div>
                                <p className="font-medium max-md:font-normal text-slate-800 uppercase tracking-tight leading-none max-md:text-[11px]">{d.customer_name}</p>
                                <span className="text-[10px] max-md:text-[9px] text-slate-400 block mt-0.5 leading-none">
                                  {d.customer_phone || 'No Phone'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Borrowed */}
                          <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap text-right font-normal max-md:font-normal text-slate-650 font-mono max-md:text-[11px]">
                            KSh {d.original_debt?.toLocaleString()}
                          </td>

                          {/* Repaid */}
                          <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap text-right font-normal max-md:font-normal text-emerald-600 font-mono max-md:text-[11px]">
                            KSh {d.amount_paid?.toLocaleString()}
                          </td>

                          {/* Balance */}
                          <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap text-right font-medium max-md:font-normal text-rose-600 font-mono max-md:text-[11px]">
                            KSh {(d.current_balance || 0).toLocaleString()}
                          </td>

                          {/* Actions */}
                          <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap max-md:text-[11px]">
                             <div className="flex items-center justify-center gap-1.5">
                               {role === 'ADMIN' && (
                                 <>
                                   <button 
                                     onClick={() => openEditModal(d)} 
                                     className="h-7 w-7 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-100 rounded-lg transition-all flex items-center justify-center shrink-0" 
                                     title="Edit Account"
                                   >
                                     <Pencil size={12} />
                                   </button>
                                   <button 
                                     onClick={() => setDeleteModal({ open: true, customer: d })} 
                                     className="h-7 w-7 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100/50 rounded-lg transition-all flex items-center justify-center shrink-0" 
                                     title="Delete Record"
                                   >
                                     <Trash2 size={12} />
                                   </button>
                                 </>
                               )}
                              <button 
                                onClick={() => { setSelectedCustomerId(d.id); setFormError(null); }} 
                                className={`px-2.5 h-7 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-sm shrink-0 max-md:text-[9px] max-md:font-normal ${isSelected ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-slate-900 hover:bg-emerald-600 text-white'}`}
                              >
                                <ArrowUpCircle size={12} /> {isSelected ? 'Selected' : 'Select'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredDebts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-10 text-center text-slate-400 font-medium uppercase tracking-wider text-xs italic max-md:text-[11px]">
                          No accounts match your filters
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Matrix for Debt Ledger */}
              {filteredDebts.length > 0 && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4 shrink-0 rounded-b-2xl mt-3">
                  <span className="text-[11px] text-slate-500 font-medium">
                    Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredDebts.length)} of {filteredDebts.length} entries
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={validCurrentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="px-2 py-1 text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      Previous
                    </button>
                    <span className="text-[10px] text-slate-500 font-semibold px-1">
                      Page {validCurrentPage} of {totalPages}
                    </span>
                    <button
                      disabled={validCurrentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="px-2 py-1 text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT PANEL: Secure Payment Collector Form */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 md:p-6 shadow-sm h-fit space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-slate-50">
                <Landmark className="text-emerald-600" size={18} /> Collect Repayment
              </h3>
            </div>

            {activeCustomer ? (
              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                
                {/* Account Details Banner */}
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Active Profile</span>
                    <span className="text-xs font-normal text-slate-500">{activeCustomer.customer_phone || 'Unregistered Phone'}</span>
                  </div>
                  <h4 className="text-base font-semibold text-slate-900 uppercase tracking-tight">{activeCustomer.customer_name}</h4>
                  <div className="flex justify-between pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-medium text-slate-400 uppercase">Outstanding Balance</span>
                    <span className="text-sm font-semibold text-rose-600">KSh {(activeCustomer.current_balance || 0).toLocaleString()}</span>
                  </div>
                  <div className="text-[9px] font-medium text-slate-400 uppercase pt-0.5">
                    Last Transaction: {activeCustomer.last_transaction_date ? new Date(activeCustomer.last_transaction_date).toLocaleDateString() : 'No Recent Records'}
                  </div>
                </div>

                {/* Amount Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Repayment Amount (KES)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-4 h-12 rounded-xl border border-slate-200 text-base font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder-slate-300 max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900"
                    required
                  />
                </div>

                {/* Notes Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Transaction Notes</label>
                  <textarea
                    placeholder="Reference, receipt no, details..."
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder-slate-300 h-20 resize-none max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900"
                  />
                </div>

                {formError && (
                  <div className="p-3 bg-red-50 text-red-800 text-xs font-medium rounded-xl border border-red-100 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-red-600 flex-shrink-0" /> {formError}
                  </div>
                )}

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={repayMutation.isPending}
                  className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white font-medium h-12 rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {repayMutation.isPending ? 'Syncing Ledger Records...' : 'Post Secure Payment'}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCustomerId(null)}
                  className="w-full h-11 text-slate-400 hover:text-slate-600 text-xs font-medium uppercase tracking-wider transition-all"
                >
                  Cancel Collection
                </button>
              </form>
            ) : (
              <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-2xl space-y-3">
                <div className="w-12 h-12 bg-slate-50 border border-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                  <Notebook size={20} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-700 uppercase tracking-wider">No Profile Selected</p>
                  <p className="text-[10px] text-slate-400 font-normal leading-relaxed max-w-[200px] mx-auto">
                    Select a customer from the master registry to record repayments safely.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* New Customer Modal */}
      {newCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="p-6 space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 bg-slate-50 border border-slate-100 text-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
                  <UserPlus size={24} />
                </div>
                <h3 className="text-lg font-medium text-slate-900 uppercase tracking-tight">Register Customer</h3>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-1">Add to Debt Book Registry</p>
              </div>

              <form onSubmit={handleAddCustomer} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Full Name</label>
                  <input 
                    type="text" 
                    required 
                    value={newCustomer.name} 
                    onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} 
                    placeholder="e.g. MAMA SARAH"
                    className="w-full px-4 h-12 rounded-xl border border-slate-200 text-base font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder-slate-300 max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" 
                    autoFocus 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Phone Number</label>
                  <input 
                    type="text" 
                    required 
                    value={newCustomer.phone} 
                    onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} 
                    placeholder="e.g. 0712345678"
                    className="w-full px-4 h-12 rounded-xl border border-slate-200 text-base font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder-slate-300 max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" 
                  />
                </div>
                <div className="flex gap-4 pt-3">
                  <button type="button" onClick={() => setNewCustomerModal(false)} className="flex-1 h-12 font-medium text-xs uppercase text-slate-400 hover:text-slate-600 transition-colors">CANCEL</button>
                  <button type="submit" disabled={addCustomerMutation.isPending} className="flex-1 bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white font-medium h-12 rounded-xl text-xs uppercase tracking-wider transition-all">
                    {addCustomerMutation.isPending ? 'REGISTERING...' : 'REGISTER'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* EDIT CUSTOMER MODAL */}
      {editModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium uppercase tracking-tight">Edit Account</h3>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-1">Update Registry Details</p>
              </div>
              <button onClick={() => setEditModal({ open: false, customer: null })} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20}/></button>
            </div>
            <form onSubmit={handleEditCustomer} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Customer Name</label>
                <input 
                  required 
                  type="text" 
                  value={editForm.name} 
                  onChange={e => setEditForm({...editForm, name: e.target.value})} 
                  className="w-full px-4 h-12 rounded-xl border border-slate-200 text-base font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Phone Number</label>
                <input 
                  required 
                  type="text" 
                  value={editForm.phone} 
                  onChange={e => setEditForm({...editForm, phone: e.target.value})} 
                  className="w-full px-4 h-12 rounded-xl border border-slate-200 text-base font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Original Debt (Base Balance)</label>
                <input 
                  required 
                  type="number" 
                  value={editForm.debt} 
                  onChange={e => setEditForm({...editForm, debt: parseFloat(e.target.value)})} 
                  className="w-full px-4 h-12 rounded-xl border border-slate-200 text-base font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" 
                />
              </div>
              <button type="submit" disabled={editMutation.isPending} className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white font-medium h-12 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md mt-2">
                {editMutation.isPending ? 'SAVING CHANGES...' : '✓ SAVE UPDATES'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="p-6 bg-red-50 text-center border-b border-red-100">
              <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={28} />
              </div>
              <h3 className="text-lg font-medium text-red-950 uppercase tracking-tight">Confirm Deletion</h3>
              <p className="text-xs text-red-700 font-normal mt-1 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-red-950">{deleteModal.customer?.customer_name}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3 bg-slate-50/50">
              <button onClick={() => setDeleteModal({ open: false, customer: null })} className="h-12 rounded-xl bg-white border border-slate-200 text-slate-500 font-medium text-xs uppercase hover:bg-slate-100 transition-all">Cancel</button>
              <button onClick={handleDeleteCustomer} disabled={deleteMutation.isPending} className="h-12 rounded-xl bg-red-600 text-white font-medium text-xs uppercase hover:bg-red-700 transition-all shadow-sm">
                {deleteMutation.isPending ? 'DELETING...' : 'YES, DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

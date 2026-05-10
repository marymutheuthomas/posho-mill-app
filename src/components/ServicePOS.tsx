import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  CheckCircle, AlertTriangle, 
  Calendar, ChevronRight, Clock, User, RotateCcw,
  Search, ChevronDown
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '../lib/db';

interface Customer { 
  id: string; 
  customer_name: string; 
  customer_phone?: string; 
  remaining_balance?: number;
  total_debt?: number;
  total_paid?: number;
}

interface Product { 
  id: string; 
  name: string; 
  current_stock: number; 
  product_code: string; 
  selling_price?: number; 
  milling_fee?: number; 
}
interface TransactionLog { 
  id: string; 
  created_at: string; 
  total_price: number; 
  payment_method: string; 
  weight_kg: number;
  product_id: string;
  transaction_type?: string;
  customer_name?: string;
  products?: { name: string }; 
}

export default function ServicePOS() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    customerId: '',
    productId: '',
    weightKg: '',
    feeCharged: '0.00',
    transactionType: 'Service' as 'Service' | 'Product',
    paymentMethod: 'Cash' as 'Cash' | 'M-Pesa' | 'Debt'
  });

  // 1. Data Fetching Queries (Cache-First)
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      return data as Product[];
    },
    staleTime: 1000 * 60 * 30, // 30 mins
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customer_debt_summary').select('*').order('customer_name');
      if (error) throw error;
      return data as Customer[];
    },
    staleTime: 1000 * 60 * 10, // 10 mins
  });

  const { data: activeSession } = useQuery({
    queryKey: ['active-session'],
    queryFn: async () => {
      const { data, error } = await supabase.from('milling_sessions').select('*').eq('is_closed', false).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: salesHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['sales_history'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales_transactions')
        .select('id, created_at, weight_kg, total_price, payment_method, customer_name, product_id, transaction_type')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as TransactionLog[];
    },
  });

  // 2. Optimized Mutations (Optimistic UI + Offline DB)
  const checkoutMutation = useMutation({
    mutationFn: async (txData: any) => {
      if (!navigator.onLine) {
        await db.pendingTransactions.add({ type: 'sale', payload: txData, timestamp: Date.now(), retryCount: 0 });
        return { offline: true };
      }
      
      const { error } = await supabase.from('sales_transactions').insert([txData]);
      if (error) throw error;

      // Update Stock
      const p = products.find(x => x.id === txData.product_id);
      if (p) {
        await supabase.from('products').update({ current_stock: (p.current_stock || 0) - txData.weight_kg }).eq('id', p.id);
      }
      return { offline: false };
    },
    onMutate: async (txData) => {
      await queryClient.cancelQueries({ queryKey: ['sales_history'] });
      const previousHistory = queryClient.getQueryData(['sales_history']);

      // Optimistically update the history list
      queryClient.setQueryData(['sales_history'], (old: any) => [
        {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...txData,
          products: { name: products.find(p => p.id === txData.product_id)?.name || 'Item' }
        },
        ...(old || [])
      ].slice(0, 50));

      return { previousHistory };
    },
    onSuccess: (res) => {
      if (res.offline) {
        setSuccess('OFFLINE MODE: Sale recorded locally. It will sync when internet returns.');
      } else {
        setSuccess('Transaction successful and synced to cloud.');
      }
      setFormData({ customerId: '', productId: '', weightKg: '', feeCharged: '0.00', transactionType: 'Service', paymentMethod: 'Cash' });
      setShowReceipt(false);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (_err: any, txData, context: any) => {
      queryClient.setQueryData(['sales_history'], context.previousHistory);
      // Fallback to local DB on any error
      db.pendingTransactions.add({ type: 'sale', payload: txData, timestamp: Date.now(), retryCount: 0 });
      setSuccess('CONNECTION LOST: Transaction saved to offline queue.');
      setFormData({ customerId: '', productId: '', weightKg: '', feeCharged: '0.00', transactionType: 'Service', paymentMethod: 'Cash' });
      setShowReceipt(false);
    }
  });

  useEffect(() => {
    const p = products.find(x => x.id === formData.productId);
    const w = parseFloat(formData.weightKg) || 0;
    if (p && w > 0) {
      const rate = formData.transactionType === 'Service' ? (p.milling_fee || 0) : (p.selling_price || 0);
      setFormData(prev => ({ ...prev, feeCharged: (w * rate).toFixed(2) }));
    } else {
      setFormData(prev => ({ ...prev, feeCharged: '0.00' }));
    }
  }, [formData.productId, formData.weightKg, formData.transactionType, products]);

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setShowReceipt(true);
  };

  const handleFinalCheckout = async () => {
    const p = products.find(x => x.id === formData.productId);
    const c = customers.find(x => x.id === formData.customerId);

    if (!p) { setError('PRODUCT ERROR: Item not found.'); return; }
    const weight = parseFloat(formData.weightKg) || 0;
    if (weight <= 0) { setError('QUANTITY ERROR: Weight must be greater than 0.'); return; }

    if (formData.transactionType === 'Product' && weight > (p.current_stock || 0)) {
      setError(`STOCK ALERT: Only ${p.current_stock} units left.`);
      return;
    }

    if (formData.paymentMethod === 'Debt' && !formData.customerId) {
      setError('DEBT SECURITY: You MUST select a customer.');
      return;
    }

    const txData = {
      product_id: formData.productId,
      weight_kg: weight,
      total_price: parseFloat(formData.feeCharged),
      payment_method: formData.paymentMethod,
      transaction_type: formData.transactionType,
      session_id: activeSession?.id,
      customer_name: c?.customer_name || 'Walk-in Customer'
    };

    if (!txData.session_id) {
      setError('SESSION ERROR: No active milling session found.');
      return;
    }

    checkoutMutation.mutate(txData);
  };

  if ((loadingProducts || loadingHistory) && salesHistory.length === 0) return <div className="p-20 text-center font-black text-slate-400 uppercase tracking-widest italic animate-pulse">Initializing Terminal...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-48 md:pb-20 min-h-[100dvh]">
      {error && <div className="bg-red-600 text-white p-4 rounded-2xl font-black flex items-center gap-3 text-sm mb-6"><AlertTriangle size={20}/>{error}</div>}
      {success && <div className="bg-emerald-500 text-white p-4 rounded-2xl font-black flex items-center gap-3 text-sm mb-6"><CheckCircle size={20}/>{success}</div>}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-10">
        <div className="md:col-span-3">
          <div className="mill-card p-6 md:p-8 bg-white border-slate-100 shadow-2xl">
            <form onSubmit={handleInitialSubmit} className="space-y-4">
               <div>
                 <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3">Mode</label>
                  <div className="flex gap-2">
                    {['Service', 'Product'].map(type => (
                      <button 
                        key={type}
                        type="button" 
                        onClick={() => setFormData({...formData, transactionType: type as any})} 
                        className={`flex-1 py-3.5 px-4 rounded-xl font-black text-xs uppercase border transition-all ${formData.transactionType === type ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {type === 'Service' ? 'Milling Fee' : 'Retail Sale'}
                      </button>
                    ))}
                  </div>
               </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Product</label>
                  <select value={formData.productId} onChange={e => setFormData({...formData, productId: e.target.value})} className="mill-input w-full font-black py-3.5 px-4 rounded-xl uppercase text-xs">
                    <option value="">Select Item...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formData.transactionType === 'Service' ? `KES ${p.milling_fee}/KG` : `KES ${p.selling_price}/KG`})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Weight (KG)</label>
                  <div className="relative">
                    <input type="number" step="0.01" value={formData.weightKg} onChange={e => setFormData({...formData, weightKg: e.target.value})} className="mill-input w-full text-xs font-black py-3.5 px-4 rounded-xl pr-14 bg-slate-50/50" placeholder="0.00" />
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-slate-300 text-xs">KG</span>
                  </div>
                </div>



                <div className="relative">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Customer Selection</label>
                  <div className={`relative rounded-xl transition-all ${formData.paymentMethod === 'Debt' && !formData.customerId ? 'ring-2 ring-red-500 ring-offset-2' : ''}`}>
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Search size={14} />
                    </div>
                    <input 
                      type="text"
                      placeholder="Search Customer..."
                      value={searchTerm || (customers.find(c => c.id === formData.customerId)?.customer_name || '')}
                      onFocus={() => setIsDropdownOpen(true)}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      className="mill-input w-full font-black py-3.5 pl-11 pr-10 rounded-xl uppercase text-xs"
                    />
                    <button 
                      type="button"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      <ChevronDown size={14} />
                    </button>

                    {isDropdownOpen && (
                      <div className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="max-h-[250px] overflow-y-auto divide-y divide-slate-50">
                          {customers.filter(c => c.customer_name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                            <div className="p-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">No customers found in debt_book</div>
                          ) : (
                            customers.filter(c => c.customer_name.toLowerCase().includes(searchTerm.toLowerCase())).map(c => {
                              const balance = c.remaining_balance ?? 0;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setFormData({...formData, customerId: c.id});
                                    setSearchTerm(c.customer_name);
                                    setIsDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-5 py-4 transition-all flex items-center justify-between group ${formData.customerId === c.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                                >
                                  <div>
                                    <p className="text-[11px] font-black uppercase tracking-tight">
                                      {c.customer_name} — <span className={balance > 0 ? 'text-red-500' : 'text-emerald-500'}>Balance: {balance.toLocaleString()} KES</span>
                                    </p>
                                    <p className={`text-[8px] font-bold uppercase tracking-widest ${formData.customerId === c.id ? 'text-slate-500' : 'text-slate-400'}`}>
                                      {c.customer_phone || 'Account Verified'}
                                    </p>
                                  </div>
                                  <ChevronRight size={14} className={formData.customerId === c.id ? 'text-emerald-400' : 'text-slate-200'} />
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mill-card p-4 bg-white border-slate-200 shadow-lg border-t-4 border-t-slate-900">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Charge</p>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter font-mono">KES {formData.feeCharged}</h3>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3">Settlement</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['Cash', 'M-Pesa', 'Debt'].map(m => (
                      <button key={m} type="button" onClick={() => setFormData({...formData, paymentMethod: m as any})} className={`py-3.5 px-4 rounded-xl font-black text-xs uppercase border transition-all ${formData.paymentMethod === m ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>{m}</button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col space-y-3 pt-4 sm:flex-row sm:space-y-0 sm:space-x-2">
                  <button 
                    type="submit" 
                    disabled={!activeSession || (formData.paymentMethod === 'Debt' && !formData.customerId)} 
                    className={`w-full sm:flex-1 py-3.5 text-xs font-black rounded-xl flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 ${(!activeSession || (formData.paymentMethod === 'Debt' && !formData.customerId)) ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                  >
                     <ChevronRight size={18} /> CHECKOUT & SYNC
                  </button>
                </div>
             </form>
          </div>
        </div>

        {/* RIGHT COLUMN — receipt sidebar on desktop */}
        <div className="md:col-span-2 hidden md:block space-y-6">
          {showReceipt ? (
            <div className="mill-card p-10 bg-slate-900 text-white border-none space-y-8 shadow-2xl">
              <div className="border-b border-slate-800 pb-6 text-center">
                <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Clock className="text-emerald-400" size={28} />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Final Review</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Ready for Ledger Sync</p>
              </div>
              <div className="space-y-4 font-mono text-sm">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">MODE</span>
                  <span className="font-black text-emerald-400">{formData.transactionType}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">MASS</span>
                  <span className="font-black text-white">{formData.weightKg} KG</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">PAYMENT</span>
                  <span className="font-black text-amber-400">{formData.paymentMethod}</span>
                </div>
                <div className="flex justify-between pt-4 items-baseline">
                  <span className="text-lg text-slate-500 font-sans font-black">TOTAL</span>
                  <span className="text-4xl font-black text-emerald-400 tracking-tighter">KES {parseFloat(formData.feeCharged).toLocaleString()}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <button onClick={() => setShowReceipt(false)} className="py-5 rounded-2xl bg-slate-800 text-slate-400 font-black text-sm uppercase hover:bg-slate-700 transition-all">Back</button>
                <button onClick={handleFinalCheckout} disabled={checkoutMutation.isPending || (formData.paymentMethod === 'Debt' && !formData.customerId)}
                  className={`py-5 rounded-2xl font-black text-sm uppercase shadow-xl transition-all ${(formData.paymentMethod === 'Debt' && !formData.customerId) ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>
                  {checkoutMutation.isPending ? 'PROCESSING...' : 'CONFIRM SALE'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mill-card p-6 bg-white border-slate-200 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <User size={16} className="text-emerald-600" /> Registry
                </h3>
                <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded-md text-slate-500">{customers.length} Accounts</span>
              </div>
              
              <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {customers.length === 0 ? (
                  <p className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">No customers found</p>
                ) : (
                  customers.map(c => (
                    <div key={c.id} className="p-3 rounded-xl border border-slate-50 hover:bg-slate-50 transition-all group">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-[11px] font-black text-slate-900 uppercase truncate">{c.customer_name}</p>
                        <p className="text-[10px] font-black text-emerald-600 font-mono italic">KES {(c.remaining_balance || 0).toLocaleString()}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{c.customer_phone || 'No Phone'}</p>
                        <button 
                          onClick={() => setFormData({...formData, customerId: c.id})}
                          className="text-[8px] font-black text-slate-400 uppercase tracking-tighter hover:text-emerald-600 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          Select →
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FLOATING RECEIPT MODAL — mobile only */}
      {showReceipt && (
        <div className="fixed inset-0 z-50 md:hidden flex items-end">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowReceipt(false)} />
          <div className="relative w-full bg-slate-900 rounded-t-3xl p-8 space-y-6 shadow-2xl">
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-2" />
            <div className="text-center">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Final Review</h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Confirm before syncing</p>
            </div>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">MODE</span>
                <span className="font-black text-emerald-400">{formData.transactionType}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">MASS</span>
                <span className="font-black text-white">{formData.weightKg} KG</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">PAYMENT</span>
                <span className="font-black text-amber-400">{formData.paymentMethod}</span>
              </div>
              <div className="flex justify-between pt-2 items-baseline">
                <span className="text-base text-slate-400 font-sans font-black">TOTAL</span>
                <span className="text-4xl font-black text-emerald-400 tracking-tighter">KES {parseFloat(formData.feeCharged).toLocaleString()}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setShowReceipt(false)} className="py-5 rounded-2xl bg-slate-800 text-slate-400 font-black text-sm uppercase">Cancel</button>
              <button onClick={handleFinalCheckout} disabled={checkoutMutation.isPending || (formData.paymentMethod === 'Debt' && !formData.customerId)}
                className={`py-5 rounded-2xl font-black text-sm uppercase shadow-xl ${checkoutMutation.isPending ? 'bg-slate-700' : 'bg-emerald-600'}`}>
                {checkoutMutation.isPending ? 'PROCESSING...' : 'CONFIRM SALE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SALES HISTORY — cards on mobile, table on desktop */}
      <div className="mill-card p-0 overflow-hidden bg-white border-slate-200 shadow-2xl">
        <div className="p-6 md:p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-xl md:rounded-2xl shadow-sm flex items-center justify-center text-slate-900 border border-slate-100">
              <Calendar size={20} />
            </div>
            <div>
              <h3 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tighter">Sales History</h3>
              <p className="hidden md:block text-[11px] font-black text-slate-500 uppercase tracking-widest">Registry Audit · Historical Data</p>
            </div>
          </div>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['sales_history'] })} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-900 transition-all shadow-sm">
            <RotateCcw size={18} />
          </button>
        </div>

        {/* Mobile: data cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {salesHistory.length === 0 && (
            <p className="p-12 text-center text-slate-400 font-black uppercase tracking-widest text-xs italic">No recent transactions</p>
          )}
          {salesHistory.map(log => {
            const prod = products.find(p => p.id === log.product_id);
            const isService = prod && (prod.milling_fee || 0) > 0 && !(prod.selling_price || 0);
            return (
              <div key={log.id} className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-900 uppercase">{log.customer_name}</p>
                    <p className="text-[10px] text-slate-400 font-bold">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                  <span className="text-lg font-black text-slate-900 font-mono">KES {log.total_price?.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${isService ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{isService ? 'Service' : 'Retail'}</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-600">{log.weight_kg} KG</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${log.payment_method === 'Debt' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{log.payment_method}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: full table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Date</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Customer</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 text-center">Type</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Weight</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Total</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {salesHistory.map(log => {
                const prod = products.find(p => p.id === log.product_id);
                const isService = prod && (prod.milling_fee || 0) > 0 && !(prod.selling_price || 0);
                return (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-10 py-5">
                      <p className="text-[12px] font-black text-slate-900">{new Date(log.created_at).toLocaleDateString()}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase">{new Date(log.created_at).toLocaleTimeString()}</p>
                    </td>
                    <td className="px-10 py-5 font-black text-[13px] text-slate-900 uppercase">{log.customer_name}</td>
                    <td className="px-10 py-5 text-center">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${isService ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{isService ? 'Service' : 'Retail'}</span>
                    </td>
                    <td className="px-10 py-5">
                      <p className="text-[12px] font-black text-slate-900">{prod?.name || log.product_id?.slice(0,8)}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">{log.weight_kg} KG</p>
                    </td>
                    <td className="px-10 py-5 font-black text-slate-900">KES {log.total_price?.toLocaleString()}</td>
                    <td className="px-10 py-5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${log.payment_method === 'Debt' ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                        <span className={`text-[10px] font-black uppercase ${log.payment_method === 'Debt' ? 'text-red-700' : 'text-emerald-700'}`}>{log.payment_method}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {salesHistory.length === 0 && (
                <tr><td colSpan={6} className="px-10 py-24 text-center text-slate-400 font-black uppercase tracking-widest italic opacity-50">No recent transactions found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

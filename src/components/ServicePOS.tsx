import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  CheckCircle, AlertTriangle, 
  Calendar, ChevronRight, Clock, User, RotateCcw,
  Search, ChevronDown, Lock,
  Pencil, Trash2, X
} from 'lucide-react';
import { checkPreviousStockTake } from '../lib/auditUtils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveSession } from '../hooks/useActiveSession';
import { useDataMutation } from '../hooks/useDataMutation';
import ActiveSessionOverlay from './ActiveSessionOverlay';

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
  amount_cash?: number;
  amount_mpesa?: number;
  amount_debt?: number;
  products?: { name: string }; 
}

interface ServicePOSProps { role?: 'ADMIN' | 'EMPLOYEE' | string | null; }

export default function ServicePOS({ role }: ServicePOSProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [auditBlock, setAuditBlock] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Form State
  const [formData, setFormData] = useState({
    customerId: '',
    productId: '',
    weightKg: '',
    feeCharged: '0.00',
    transactionType: 'Service' as 'Service' | 'Product',
    paymentMethod: 'Cash' as 'Cash' | 'M-Pesa' | 'Debt' | 'Split',
    amountCash: '0',
    amountMpesa: '0',
    amountDebt: '0',
    backdate: new Date().toISOString().split('T')[0]
  });

  const [editingSale, setEditingSale] = useState<TransactionLog | null>(null);
  const [deletingSale, setDeletingSale] = useState<TransactionLog | null>(null);
  const [editForm, setEditForm] = useState({
    weightKg: '',
    totalPrice: '',
    paymentMethod: 'Cash' as 'Cash' | 'M-Pesa' | 'Debt' | 'Split',
    isSplit: false,
    amountCash: '0',
    amountMpesa: '0',
    amountDebt: '0'
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

  // Helper to resolve stock for retail maize to bulk maize
  const getProductStock = (product: Product) => {
    if (!product) return 0;
    const nameLower = product.name.toLowerCase();
    if (nameLower.includes('maize') && nameLower.includes('retail')) {
      const bulkMaize = products.find(x => {
        const xName = x.name.toLowerCase();
        return xName.includes('maize') && xName.includes('bulk');
      });
      return bulkMaize ? (bulkMaize.current_stock || 0) : 0;
    }
    return product.current_stock || 0;
  };

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      // Aggregate customers from both the official registry (debt_book) and historical sales
      const [salesRes, dbRes] = await Promise.all([
        supabase.from('sales_transactions').select('customer_name, amount_debt').not('customer_name', 'is', null),
        supabase.from('debt_book').select('*')
      ]);

      if (salesRes.error) {
        console.error('Customer Fetch Error (Sales):', salesRes.error);
        throw salesRes.error;
      }
      if (dbRes.error) {
        console.error('Customer Fetch Error (DebtBook):', dbRes.error);
        throw dbRes.error;
      }

      const customerMap = new Map<string, Customer>();

      // A. Pull from historical sales (Legacy/Walk-in customers with names)
      salesRes.data.forEach(tx => {
        const name = tx.customer_name?.trim();
        if (!name || name.toLowerCase().includes('walk-in')) return;
        const key = name.toUpperCase();
        if (!customerMap.has(key)) {
          customerMap.set(key, {
            id: `legacy-${name}`,
            customer_name: name,
            remaining_balance: 0
          });
        }
        if (tx.amount_debt) {
          customerMap.get(key)!.remaining_balance = (customerMap.get(key)!.remaining_balance || 0) + Number(tx.amount_debt);
        }
      });

      // B. Pull from Normalized Registry (debt_book) - Override with formal data
      dbRes.data.forEach(d => {
        const name = d.customer_name?.trim();
        if (!name) return;
        const key = name.toUpperCase();
        customerMap.set(key, {
          id: d.id,
          customer_name: d.customer_name,
          customer_phone: d.customer_phone,
          remaining_balance: (Number(d.original_debt) || 0) - (Number(d.amount_paid) || 0)
        });
      });

      return Array.from(customerMap.values()).sort((a, b) => a.customer_name.localeCompare(b.customer_name));
    },
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  const { data: activeSession } = useActiveSession();

  const { data: salesHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['sales_history'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales_transactions')
        .select('id, created_at, weight_kg, total_price, payment_method, customer_name, product_id, transaction_type, amount_cash, amount_mpesa, amount_debt')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as TransactionLog[];
    },
  });

  // 2. Optimized Mutations (Centralized Offline-First)
  const checkoutMutation = useDataMutation({
    type: 'sale',
    queryKey: ['sales_history'],
    mutationFn: async (txData) => {
      const { data, error } = await supabase.from('sales_transactions').insert([txData]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      if (res.offline) {
        setSuccess('Connection lost. Data saved locally and will sync when online.');
      } else {
        setSuccess('Transaction successful and synced to cloud.');
      }
      setFormData({ 
        customerId: '', 
        productId: '', 
        weightKg: '', 
        feeCharged: '0.00', 
        transactionType: 'Service', 
        paymentMethod: 'Cash', 
        amountCash: '0',
        amountMpesa: '0',
        amountDebt: '0',
        backdate: new Date().toISOString().split('T')[0] 
      });
      setShowReceipt(false);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['active-session'] });
      queryClient.invalidateQueries({ queryKey: ['sales_history'] });
    },
    onError: (err: any) => {
      console.error('❌ SALE REJECTION:', err.message, err.details || '');
      if (err.code === '42501' || err.code === 'PGRST116') {
        setError('Access Restricted: You do not have permission to record sales.');
      } else {
        setError(`${err.message || 'Transaction failed.'} ${err.details ? `(${err.details})` : ''}`);
      }
    }
  });

  const deleteSaleMutation = useDataMutation({
    type: 'sale_delete' as any, // We'll handle delete in sync as well
    queryKey: ['sales_history'],
    mutationFn: async (sale) => {
      const { error } = await supabase.from('sales_transactions').delete().eq('id', sale.id);
      if (error) throw error;
    },
    onSuccess: (res) => {
      if (res.offline) {
        setSuccess('OFFLINE MODE: Deletion queued.');
      } else {
        setSuccess('Sale voided. Stock restored by database.');
      }
      queryClient.invalidateQueries({ queryKey: ['sales_history'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['debt_summary'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt_book'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeletingSale(null);
    }
  });

  const editSaleMutation = useDataMutation({
    type: 'sale_update' as any,
    queryKey: ['sales_history'],
    mutationFn: async ({ id, ...updates }) => {
      const { error } = await supabase.from('sales_transactions').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (res) => {
      if (res.offline) {
        setSuccess('OFFLINE MODE: Edit queued.');
      } else {
        setSuccess('Sale updated. Stock reconciled by database.');
      }
      queryClient.invalidateQueries({ queryKey: ['sales_history'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['debt_summary'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt_book'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setEditingSale(null);
    }
  });


  useEffect(() => {
    const p = products.find(x => x.id === formData.productId);
    const w = parseFloat(formData.weightKg) || 0;
    if (p && w > 0) {
      const rate = formData.transactionType === 'Service' ? (p.milling_fee || 0) : (p.selling_price || 0);
      const exactCharge = w * rate;
      // Round up to the nearest 5 KES (Kenya's smallest common coin)
      const roundedCharge = Math.ceil(exactCharge / 5) * 5;
      setFormData(prev => ({ ...prev, feeCharged: roundedCharge.toFixed(2) }));
    } else {
      setFormData(prev => ({ ...prev, feeCharged: '0.00' }));
    }
  }, [formData.productId, formData.weightKg, formData.transactionType, products]);
  
  useEffect(() => {
    if (!editingSale) return;
    const p = products.find(x => x.id === editingSale.product_id);
    const w = parseFloat(editForm.weightKg) || 0;
    if (p && w > 0) {
      const rate = editingSale.transaction_type === 'Service' ? (p.milling_fee || 0) : (p.selling_price || 0);
      const exactCharge = w * rate;
      const roundedCharge = editingSale.transaction_type === 'Service'
        ? Math.ceil(exactCharge / 5) * 5
        : exactCharge;
      
      const totalPriceVal = roundedCharge.toFixed(2);
      
      setEditForm(prev => {
        if (!prev.isSplit) {
          return {
            ...prev,
            totalPrice: totalPriceVal,
            amountCash: prev.paymentMethod === 'Cash' ? totalPriceVal : '0',
            amountMpesa: prev.paymentMethod === 'M-Pesa' ? totalPriceVal : '0',
            amountDebt: prev.paymentMethod === 'Debt' ? totalPriceVal : '0'
          };
        } else {
          return {
            ...prev,
            totalPrice: totalPriceVal
          };
        }
      });
    } else {
      setEditForm(prev => ({
        ...prev,
        totalPrice: '0.00',
        amountCash: '0',
        amountMpesa: '0',
        amountDebt: '0'
      }));
    }
  }, [editForm.weightKg, editingSale, products, editForm.paymentMethod, editForm.isSplit]);
  
  useEffect(() => {
    const runAuditCheck = async () => {
      await checkPreviousStockTake();
      // Temporarily disabled to allow backdating
      setAuditBlock(false);
    };
    runAuditCheck();
  }, []);

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

    const stockAvailable = getProductStock(p);
    if (formData.transactionType === 'Product' && weight > stockAvailable) {
      setError(`STOCK ALERT: Only ${stockAvailable} units left.`);
      return;
    }

    const totalSplit = (parseFloat(formData.amountCash) || 0) + (parseFloat(formData.amountMpesa) || 0) + (parseFloat(formData.amountDebt) || 0);
    const totalPrice = parseFloat(formData.feeCharged);

    if (formData.paymentMethod === 'Split' && Math.abs(totalSplit - totalPrice) > 0.01) {
      setError(`SPLIT ERROR: Total payments (${totalSplit}) must equal Charge (${totalPrice})`);
      return;
    }

    const hasDebt = (formData.paymentMethod === 'Debt') || (formData.paymentMethod === 'Split' && (parseFloat(formData.amountDebt) || 0) > 0);
    if (hasDebt && !formData.customerId) {
      setError('DEBT SECURITY: You MUST select a customer for any debt component.');
      return;
    }


    const txData = {
      product_id: formData.productId,
      weight_kg: weight,
      total_price: totalPrice,
      transaction_type: formData.transactionType,
      session_id: activeSession?.id,
      customer_name: (c?.customer_name || 'Walk-in Customer').toUpperCase().trim(),
      phone_number: c?.customer_phone || null,
      amount_cash: formData.paymentMethod === 'Split' ? (parseFloat(formData.amountCash) || 0) : (formData.paymentMethod === 'Cash' ? totalPrice : 0),
      amount_mpesa: formData.paymentMethod === 'Split' ? (parseFloat(formData.amountMpesa) || 0) : (formData.paymentMethod === 'M-Pesa' ? totalPrice : 0),
      amount_debt: formData.paymentMethod === 'Split' ? (parseFloat(formData.amountDebt) || 0) : (formData.paymentMethod === 'Debt' ? totalPrice : 0),
      created_at: new Date(formData.backdate + 'T' + new Date().toISOString().split('T')[1]).toISOString()
    };

    if (!activeSession || activeSession.is_closed) {
      setError('NO ACTIVE SESSION: Please start an Internal or External session first.');
      return;
    }

    checkoutMutation.mutate(txData);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;
    
    const newWeight = parseFloat(editForm.weightKg);
    const newPrice = parseFloat(editForm.totalPrice);
    
    if (isNaN(newWeight) || newWeight <= 0) { setError('Invalid weight'); return; }

    const isSplit = editForm.isSplit;
    const amountCash = isSplit ? (parseFloat(editForm.amountCash) || 0) : (editForm.paymentMethod === 'Cash' ? newPrice : 0);
    const amountMpesa = isSplit ? (parseFloat(editForm.amountMpesa) || 0) : (editForm.paymentMethod === 'M-Pesa' ? newPrice : 0);
    const amountDebt = isSplit ? (parseFloat(editForm.amountDebt) || 0) : (editForm.paymentMethod === 'Debt' ? newPrice : 0);

    if (isSplit) {
      const sum = amountCash + amountMpesa + amountDebt;
      if (Math.abs(sum - newPrice) > 0.01) {
        setError(`Allocations (KSh ${sum}) must balance exactly to the transaction total price (KSh ${newPrice}).`);
        return;
      }
    }

    editSaleMutation.mutate({
      id: editingSale.id,
      oldWeight: editingSale.weight_kg,
      newWeight,
      productId: editingSale.product_id,
      total_price: newPrice,
      payment_method: isSplit ? 'Split' : editForm.paymentMethod,
      amount_cash: amountCash,
      amount_mpesa: amountMpesa,
      amount_debt: amountDebt
    });
  };

  const startEdit = (sale: TransactionLog) => {
    const isSplit = sale.payment_method === 'Split' ||
      ((sale.amount_cash || 0) > 0 && (sale.amount_mpesa || 0) > 0) ||
      ((sale.amount_cash || 0) > 0 && (sale.amount_debt || 0) > 0) ||
      ((sale.amount_mpesa || 0) > 0 && (sale.amount_debt || 0) > 0);

    setEditingSale(sale);
    setEditForm({
      weightKg: sale.weight_kg.toString(),
      totalPrice: sale.total_price.toString(),
      paymentMethod: (sale.payment_method === 'Split' ? 'Cash' : (sale.payment_method || 'Cash')) as any,
      isSplit,
      amountCash: (sale.amount_cash || 0).toString(),
      amountMpesa: (sale.amount_mpesa || 0).toString(),
      amountDebt: (sale.amount_debt || 0).toString()
    });
  };

  if (auditBlock) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 max-w-2xl mx-auto text-center px-4 md:px-6">
        <div className="w-20 h-20 md:w-24 md:h-24 bg-orange-50 rounded-2xl md:rounded-[2rem] flex items-center justify-center shadow-xl shadow-orange-100">
           <Lock size={40} className="text-orange-500" />
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl md:text-4xl font-semibold text-slate-900 uppercase tracking-tight">Stock Take Missing</h2>
          <p className="text-sm font-medium text-slate-500 uppercase leading-relaxed">
            Point of Sale terminal is **Locked**. Our security audit shows that the **Previous Day's Stock Take** was not recorded. 
            Please reconcile the inventory in the "Stock Take" module to resume sales.
          </p>
        </div>
        <button onClick={() => window.location.reload()} className="w-full md:w-auto px-8 py-4 bg-slate-900 text-white rounded-xl font-semibold uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-transform">
          Refresh System
        </button>
      </div>
    );
  }

  if ((loadingProducts || loadingHistory) && salesHistory.length === 0) return <div className="p-20 text-center font-semibold text-slate-400 uppercase tracking-widest italic animate-pulse">Initializing Terminal...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-32 md:pb-20 min-h-[100dvh] px-4 md:px-0">
      {error && <div className="bg-red-600 text-white p-4 rounded-xl font-semibold flex items-center gap-3 text-sm mb-4 md:mb-6"><AlertTriangle size={20}/>{error}</div>}
      {success && <div className="bg-emerald-500 text-white p-4 rounded-xl font-semibold flex items-center gap-3 text-sm mb-4 md:mb-6"><CheckCircle size={20}/>{success}</div>}
      
      {/* ACTIVE SESSION SMART HEADER */}
      <ActiveSessionOverlay activeSession={activeSession} />
      
      {!activeSession && !auditBlock && (
        <div className="bg-amber-50 border-2 border-amber-200 p-4 md:p-6 rounded-2xl md:rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 mb-6 md:mb-8 animate-pulse">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-600">
                <Clock size={20} />
             </div>
             <div>
                <h4 className="text-sm font-semibold text-amber-900 uppercase tracking-tight text-center md:text-left">No Active Session</h4>
                <p className="text-[10px] font-medium text-amber-700 uppercase tracking-widest text-center md:text-left">You must START A SESSION in "Session Control" before selling.</p>
             </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-10">
        <div className="md:col-span-3">
          <div className="mill-card p-4 md:p-8 bg-white border-slate-100 shadow-2xl rounded-2xl">
            <form onSubmit={handleInitialSubmit} className="space-y-4 md:space-y-6">
               <div>
                 <label className="block text-[10px] md:text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2 md:mb-3">Mode</label>
                  <div className="flex gap-2">
                    {['Service', 'Product'].map(type => (
                      <button 
                        key={type}
                        type="button" 
                        onClick={() => setFormData({...formData, transactionType: type as any})} 
                        className={`flex-1 py-3 md:py-4 px-4 rounded-xl font-semibold text-xs uppercase border transition-all ${formData.transactionType === type ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {type === 'Service' ? 'Milling' : 'Retail'}
                      </button>
                    ))}
                  </div>
               </div>

                <div>
                  <label className="block text-[10px] md:text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Product</label>
                  <select 
                    value={formData.productId} 
                    onChange={e => setFormData({...formData, productId: e.target.value})} 
                    className="mill-input w-full font-medium py-3 md:py-4 px-4 rounded-xl uppercase text-base md:text-xs"
                  >
                    <option value="">Select Item...</option>
                    {products
                      .filter(p => {
                        if (formData.transactionType === 'Product') {
                          return (p.selling_price || 0) > 0;
                        } else {
                          return (p.milling_fee || 0) > 0;
                        }
                      })
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Stock: {getProductStock(p)} KG) — {formData.transactionType === 'Service' ? `KES ${p.milling_fee}/KG` : `KES ${p.selling_price}/KG`}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] md:text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Weight (KG)</label>
                  <div className="relative">
                    <input type="number" step="0.01" value={formData.weightKg} onChange={e => setFormData({...formData, weightKg: e.target.value})} className="mill-input w-full text-base md:text-xs font-medium py-3 md:py-4 px-4 rounded-xl pr-14 bg-slate-50/50" placeholder="0.00" />
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 font-semibold text-slate-300 text-xs">KG</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] md:text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Transaction Date</label>
                  <div className="relative">
                    <input 
                      type="date" 
                      value={formData.backdate} 
                      onChange={e => setFormData({...formData, backdate: e.target.value})} 
                      className="mill-input w-full text-base md:text-xs font-medium py-3 md:py-4 px-4 rounded-xl bg-slate-50/50" 
                    />
                    <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                  </div>
                </div>



                <div className="relative">
                  <label className="block text-[10px] md:text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Customer Selection</label>
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
                      className="mill-input w-full font-medium py-3 md:py-4 pl-11 pr-10 rounded-xl uppercase text-base md:text-xs"
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
                            <div className="p-4 text-center text-[10px] font-medium text-slate-400 uppercase tracking-widest italic">No customers found</div>
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
                                    <p className="text-[11px] font-semibold uppercase tracking-tight">
                                      {c.customer_name} — <span className={balance > 0 ? 'text-red-500' : 'text-emerald-500'}>Balance: {balance.toLocaleString()} KES</span>
                                    </p>
                                    <p className={`text-[8px] font-medium uppercase tracking-widest ${formData.customerId === c.id ? 'text-slate-500' : 'text-slate-400'}`}>
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

                <div className="mill-card p-4 bg-white border-slate-200 shadow-lg border-t-4 border-t-slate-900 font-mono">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1 font-sans">Total Charge</p>
                  <h3 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tighter">KES {formData.feeCharged}</h3>
                </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                    {['Cash', 'M-Pesa', 'Debt', 'Split'].map(m => (
                      <button key={m} type="button" onClick={() => setFormData({...formData, paymentMethod: m as any})} className={`py-3 md:py-4 px-2 md:px-4 rounded-xl font-semibold text-[10px] md:text-xs uppercase border transition-all ${formData.paymentMethod === m ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>{m}</button>
                    ))}
                  </div>

                  {formData.paymentMethod === 'Split' && (
                    <div className="grid grid-cols-3 gap-3 mt-4 animate-in slide-in-from-top-2 duration-300">
                      <div>
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Cash</label>
                        <input type="number" step="0.01" value={formData.amountCash} onChange={e => setFormData({...formData, amountCash: e.target.value})} className="mill-input w-full text-xs py-2 px-3 bg-slate-50 border-slate-200" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-1">M-Pesa</label>
                        <input type="number" step="0.01" value={formData.amountMpesa} onChange={e => setFormData({...formData, amountMpesa: e.target.value})} className="mill-input w-full text-xs py-2 px-3 bg-slate-50 border-slate-200" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Debt</label>
                        <input type="number" step="0.01" value={formData.amountDebt} onChange={e => setFormData({...formData, amountDebt: e.target.value})} className="mill-input w-full text-xs py-2 px-3 bg-slate-50 border-slate-200" placeholder="0" />
                      </div>
                    </div>
                  )}

                <div className="flex flex-col space-y-3 pt-4">
                  <button 
                    type="submit" 
                    disabled={!activeSession || (formData.paymentMethod === 'Debt' && !formData.customerId)} 
                    className={`w-full py-4 text-xs font-semibold rounded-xl flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 ${(!activeSession || (formData.paymentMethod === 'Debt' && !formData.customerId)) ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                  >
                     <ChevronRight size={18} /> CHECKOUT & SYNC
                  </button>
                </div>
             </form>
          </div>
        </div>

        {/* RIGHT COLUMN — receipt sidebar on desktop, modal on mobile */}
        <div 
          className={`md:col-span-2 ${showReceipt ? 'fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 md:relative md:inset-auto md:z-0 md:bg-transparent md:backdrop-blur-none md:p-0 md:block' : 'hidden md:block'} space-y-6`}
          onClick={() => showReceipt && window.innerWidth < 768 && setShowReceipt(false)}
        >
          {showReceipt ? (
            <div 
              className="mill-card p-6 md:p-10 bg-slate-900 text-white border-none space-y-6 md:space-y-8 shadow-2xl w-full max-w-lg md:max-w-none animate-in zoom-in-95 duration-200 rounded-3xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="border-b border-slate-800 pb-6 text-center">
                <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Clock className="text-emerald-400" size={28} />
                </div>
                <h3 className="text-xl md:text-2xl font-semibold uppercase tracking-tight">Final Review</h3>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-1">Ready for Ledger Sync</p>
              </div>

              {error && <div className="bg-red-500/20 text-red-200 p-3 rounded-xl font-semibold text-[10px] uppercase flex items-center gap-2 border border-red-500/30 animate-pulse"><AlertTriangle size={14}/>{error}</div>}
              {success && <div className="bg-emerald-500/20 text-emerald-200 p-3 rounded-xl font-semibold text-[10px] uppercase flex items-center gap-2 border border-emerald-500/30"><CheckCircle size={14}/>{success}</div>}

              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500 font-sans">MODE</span>
                  <span className="font-semibold text-emerald-400 font-sans">{formData.transactionType}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500 font-sans">MASS</span>
                  <span className="font-semibold text-white">{formData.weightKg} KG</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500 font-sans">PAYMENT</span>
                  <span className="font-semibold text-amber-400 font-sans">{formData.paymentMethod}</span>
                </div>
                
                {formData.paymentMethod === 'Split' && (
                  <div className="bg-slate-800/50 p-3 rounded-xl space-y-1 my-2">
                    {parseFloat(formData.amountCash) > 0 && <div className="flex justify-between text-[10px]"><span className="text-slate-400">Cash:</span><span>{formData.amountCash}</span></div>}
                    {parseFloat(formData.amountMpesa) > 0 && <div className="flex justify-between text-[10px]"><span className="text-slate-400">M-Pesa:</span><span>{formData.amountMpesa}</span></div>}
                    {parseFloat(formData.amountDebt) > 0 && <div className="flex justify-between text-[10px]"><span className="text-slate-400">Debt:</span><span>{formData.amountDebt}</span></div>}
                  </div>
                )}

                <div className="flex justify-between pt-4 items-baseline">
                  <span className="text-lg text-slate-500 font-sans font-semibold">TOTAL</span>
                  <span className="text-2xl md:text-4xl font-semibold text-emerald-400 tracking-tighter">KES {parseFloat(formData.feeCharged).toLocaleString()}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <button onClick={() => setShowReceipt(false)} className="py-4 md:py-5 rounded-2xl bg-slate-800 text-slate-400 font-semibold text-sm uppercase hover:bg-slate-700 active:scale-95 transition-all">Back</button>
                <button 
                  onClick={handleFinalCheckout} 
                  disabled={checkoutMutation.isPending || (formData.paymentMethod === 'Debt' && !formData.customerId)}
                  className={`py-4 md:py-5 rounded-2xl font-semibold text-sm uppercase shadow-xl active:scale-95 transition-all ${(formData.paymentMethod === 'Debt' && !formData.customerId) ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
                >
                  {checkoutMutation.isPending ? 'PROCESSING...' : 'CONFIRM'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mill-card p-4 md:p-6 bg-white border-slate-200 flex flex-col space-y-4 rounded-2xl shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <h3 className="text-xs md:text-sm font-semibold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <User size={16} className="text-emerald-600" /> Registry
                </h3>
                <span className="text-[10px] font-semibold bg-slate-100 px-2 py-1 rounded-md text-slate-500">{customers.length} Accounts</span>
              </div>
              
              <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {customers.length === 0 ? (
                  <p className="py-10 text-center text-[10px] font-medium text-slate-400 uppercase tracking-widest italic">No customers found</p>
                ) : (
                  customers.map(c => (
                    <button 
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setFormData({...formData, customerId: c.id});
                        setSearchTerm(c.customer_name);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`w-full text-left p-4 rounded-xl border transition-all flex justify-between items-center group ${formData.customerId === c.id ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                    >
                      <div className="space-y-1">
                        <p className={`text-[11px] font-semibold uppercase ${formData.customerId === c.id ? 'text-white' : 'text-slate-900'}`}>{c.customer_name}</p>
                        <p className={`text-[9px] font-medium uppercase tracking-widest ${formData.customerId === c.id ? 'text-slate-400' : 'text-slate-400'}`}>{c.customer_phone || 'Account Verified'}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-[10px] font-semibold font-mono ${formData.customerId === c.id ? 'text-emerald-400' : 'text-emerald-600'}`}>KES {(c.remaining_balance || 0).toLocaleString()}</p>
                        <span className={`text-[8px] font-bold uppercase tracking-tighter ${formData.customerId === c.id ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {formData.customerId === c.id ? 'Selected ✓' : 'Select →'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SALES HISTORY */}
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden mt-6">
        <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white rounded-lg shadow-sm flex items-center justify-center text-slate-700 border border-slate-100 shrink-0">
              <Calendar size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-950 uppercase tracking-tight">Sales History Log</h3>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">Registry Audit · Historical Data</p>
            </div>
          </div>
          <button 
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['sales_history'] });
              setCurrentPage(1);
            }} 
            className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-slate-900 transition-all shadow-sm"
            title="Refresh History"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        <div className="p-3">
          <div className="overflow-x-auto overflow-y-auto max-h-[500px] border border-slate-100 rounded-lg">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="px-3 py-2">Client / Time</th>
                  <th className="px-3 py-2">Product & Weight</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Payment Split</th>
                  <th className="px-3 py-2 text-right">Total Price</th>
                  {role === 'ADMIN' && (
                    <th className="px-3 py-2 text-center w-24">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(() => {
                  const itemsPerPage = 10;
                  const totalPages = Math.ceil(salesHistory.length / itemsPerPage) || 1;
                  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
                  const startIndex = (validCurrentPage - 1) * itemsPerPage;
                  const paginatedSales = salesHistory.slice(startIndex, startIndex + itemsPerPage);

                  return (
                    <>
                      {paginatedSales.map(log => {
                        const prod = products.find(p => p.id === log.product_id);
                        const isService = prod && (prod.milling_fee || 0) > 0 && !(prod.selling_price || 0);
                        return (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition-colors text-xs text-slate-650">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-400 shrink-0">
                                  <User size={12} />
                                </div>
                                <div>
                                  <p className="font-medium text-slate-800 uppercase tracking-tight truncate max-w-[120px]">{log.customer_name || 'Walk-in'}</p>
                                  <span className="text-[10px] text-slate-400 block mt-0.5 leading-none">
                                    {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-700">
                              {prod?.name || 'Maize'} ({log.weight_kg} kg)
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase ${isService ? 'bg-blue-50 text-blue-700 border border-blue-100/50' : 'bg-purple-50 text-purple-700 border border-purple-100/50'}`}>
                                {isService ? 'Service' : 'Retail'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-600">
                              {[
                                (log.amount_cash || 0) > 0 ? `Cash: ${log.amount_cash}` : null,
                                (log.amount_mpesa || 0) > 0 ? `M-Pesa: ${log.amount_mpesa}` : null,
                                (log.amount_debt || 0) > 0 ? `Debt: ${log.amount_debt}` : null,
                              ].filter(Boolean).length > 0 ? (
                                <span className="text-[10px] text-slate-600 block leading-tight">
                                  {[
                                    (log.amount_cash || 0) > 0 ? `Cash: ${log.amount_cash}` : null,
                                    (log.amount_mpesa || 0) > 0 ? `M-Pesa: ${log.amount_mpesa}` : null,
                                    (log.amount_debt || 0) > 0 ? `Debt: ${log.amount_debt}` : null,
                                  ].filter(Boolean).join(' | ')}
                                </span>
                              ) : (
                                <span className={`text-[10px] font-semibold ${log.payment_method === 'Debt' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {log.payment_method}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold font-mono text-slate-800">
                              KSh {log.total_price?.toLocaleString()}
                            </td>
                            {role === 'ADMIN' && (
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button 
                                    onClick={() => startEdit(log)} 
                                    className="h-7 w-7 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-100 rounded-lg transition-all flex items-center justify-center" 
                                    title="Edit Sale"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button 
                                    onClick={() => setDeletingSale(log)} 
                                    className="h-7 w-7 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100/50 rounded-lg transition-all flex items-center justify-center" 
                                    title="Delete Sale"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      
                      {salesHistory.length === 0 && (
                        <tr>
                          <td colSpan={role === 'ADMIN' ? 6 : 5} className="p-10 text-center text-slate-450 font-medium uppercase tracking-wider text-xs italic">
                            No transactions recorded today
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Control Matrix */}
        {salesHistory.length > 0 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4 shrink-0">
            {(() => {
              const itemsPerPage = 10;
              const totalPages = Math.ceil(salesHistory.length / itemsPerPage) || 1;
              const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
              const startIndex = (validCurrentPage - 1) * itemsPerPage;

              return (
                <>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, salesHistory.length)} of {salesHistory.length} sales
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
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* EDIT SALE MODAL */}
      {editingSale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium uppercase tracking-tight">Edit Transaction</h3>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-1">Registry Correction</p>
              </div>
              <button onClick={() => setEditingSale(null)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20}/></button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1">Weight (KG)</label>
                <input 
                  required 
                  type="number" 
                  step="0.01" 
                  value={editForm.weightKg} 
                  onChange={e => setEditForm({...editForm, weightKg: e.target.value})} 
                  className="w-full px-4 h-12 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1">Total Price (KES)</label>
                <input 
                  required 
                  type="number" 
                  step="0.01" 
                  value={editForm.totalPrice} 
                  disabled 
                  className="w-full px-4 h-12 rounded-xl border border-slate-200 bg-slate-50 text-base font-semibold text-slate-500 cursor-not-allowed" 
                />
              </div>

              {/* Split Payment Options Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Split Payment Options</span>
                <button
                  type="button"
                  onClick={() => setEditForm(prev => ({ ...prev, isSplit: !prev.isSplit }))}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${editForm.isSplit ? 'bg-emerald-600' : 'bg-slate-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${editForm.isSplit ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {!editForm.isSplit ? (
                /* Toggle is OFF: Classic Single Payment Selection */
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1">Payment Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Cash', 'M-Pesa', 'Debt'].map(m => (
                      <button 
                        key={m} 
                        type="button" 
                        onClick={() => setEditForm({...editForm, paymentMethod: m as any})} 
                        className={`h-12 rounded-xl font-medium text-xs uppercase border transition-all ${editForm.paymentMethod === m ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Toggle is ON: Three Separate Active Split Amount Fields arranged side-by-side in 3-column micro-grid */
                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider ml-1 text-center">Cash</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={editForm.amountCash}
                      onChange={e => setEditForm({ ...editForm, amountCash: e.target.value })}
                      className="w-full px-2 h-12 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder-slate-300 text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider ml-1 text-center">M-Pesa</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={editForm.amountMpesa}
                      onChange={e => setEditForm({ ...editForm, amountMpesa: e.target.value })}
                      className="w-full px-2 h-12 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder-slate-300 text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider ml-1 text-center">Debt</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={editForm.amountDebt}
                      onChange={e => setEditForm({ ...editForm, amountDebt: e.target.value })}
                      className="w-full px-2 h-12 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder-slate-300 text-center"
                    />
                  </div>
                </div>
              )}

              {/* Validation Warning Guard Bar */}
              {editForm.isSplit && (() => {
                const totalAllocated = Number(editForm.amountCash || 0) + Number(editForm.amountMpesa || 0) + Number(editForm.amountDebt || 0);
                const totalPriceTarget = Number(editForm.totalPrice || 0);
                const isBalanced = Math.abs(totalAllocated - totalPriceTarget) < 0.01;
                if (!isBalanced) {
                  return (
                    <div className="p-3 bg-rose-50 text-rose-900 border border-rose-200 rounded-xl text-[10px] font-bold leading-relaxed flex items-start gap-2 shadow-sm animate-in slide-in-from-top-2 duration-200">
                      <AlertTriangle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
                      <span>
                        Allocations (KSh {totalAllocated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) must balance exactly to the transaction total price (KSh {totalPriceTarget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              <button
                type="submit"
                disabled={editSaleMutation.isPending || (editForm.isSplit && Math.abs((Number(editForm.amountCash || 0) + Number(editForm.amountMpesa || 0) + Number(editForm.amountDebt || 0)) - Number(editForm.totalPrice || 0)) >= 0.01)}
                className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white font-medium h-12 rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider disabled:bg-slate-200 disabled:text-slate-400"
              >
                {editSaleMutation.isPending ? 'UPDATING...' : '✓ SAVE CHANGES'}
              </button>
            </form>
          </div>
        </div>
      )}


      {/* DELETE SALE MODAL */}
      {deletingSale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-red-600 text-white text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter">Void Transaction</h3>
              <p className="text-xs text-red-100 font-bold uppercase mt-1 leading-relaxed">
                Are you sure? This will return <span className="font-black text-white underline">{deletingSale.weight_kg}KG of {products.find(p => p.id === deletingSale.product_id)?.name || 'Item'}</span> to the inventory.
              </p>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <button onClick={() => setDeletingSale(null)} className="py-4 rounded-xl bg-slate-100 text-slate-600 font-black text-xs uppercase hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={() => deleteSaleMutation.mutate(deletingSale)} disabled={deleteSaleMutation.isPending} className="py-4 rounded-xl bg-red-600 text-white font-black text-xs uppercase hover:bg-red-700 transition-all shadow-lg shadow-red-200">
                {deleteSaleMutation.isPending ? 'DELETING...' : 'YES, VOID'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ACTIVE SESSION SMART OVERLAY */}
      <ActiveSessionOverlay activeSession={activeSession} />
    </div>
  );
}

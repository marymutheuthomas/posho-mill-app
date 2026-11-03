import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  CheckCircle, AlertTriangle, 
  Calendar, ChevronRight, Clock, User, RotateCcw,
  Search, ChevronDown,
  Pencil, Trash2, X, Eye, Zap
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMillingSession } from '../hooks/useMillingSession';
import { useDataMutation } from '../hooks/useDataMutation';
import { useCustomers } from '../hooks/useCustomers';
import { creditCheck } from '../lib/customerLedger';
import ActiveSessionOverlay from './ActiveSessionOverlay';

// Counter tablets and phones: every field and primary button is at least 48px tall (h-12),
// and text-base on phones stops iOS zooming into the field on focus.
const FIELD = 'mill-input w-full h-12 px-4 rounded-xl font-medium text-base md:text-sm focus:ring-1 focus:ring-slate-900 focus:border-slate-900';
const FIELD_LABEL = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5';
// Shift type the POS banner starts with one tap; counter sales are mostly customer milling.
const DEFAULT_SHIFT_TYPE = 'External' as const;

interface Customer { 
  id: string; 
  customer_name: string; 
  customer_phone?: string; 
  remaining_balance?: number;
  credit_limit?: number;
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
  receipt_code?: string;
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
  customer_id?: string;
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

  // Customers come from the CRM directory; balances are derived from sales and repayments
  // (including anything still queued offline), never from a stored field.
  const { customers: crm } = useCustomers();
  const customers: Customer[] = useMemo(() => crm
    .filter(c => c.is_active !== false)
    .map(c => ({ id: c.id, customer_name: c.name, customer_phone: c.phone || undefined, remaining_balance: c.balance, credit_limit: c.credit_limit })), [crm]);

  const { activeSession, startSession } = useMillingSession();
  const [shiftError, setShiftError] = useState('');

  const startDefaultShift = () => {
    setShiftError('');
    startSession.mutate(DEFAULT_SHIFT_TYPE, {
      onSuccess: ({ offline }) => setSuccess(offline
        ? `${DEFAULT_SHIFT_TYPE} shift started offline. It will sync when the connection returns.`
        : `${DEFAULT_SHIFT_TYPE} shift started.`),
      onError: (err: Error) => setShiftError(err?.message || 'Could not start a shift.'),
    });
  };

  // Soft credit-limit check for the debt part of this sale (warns, never blocks)
  const creditWarning = useMemo(() => {
    const c = customers.find(x => x.id === formData.customerId);
    const debt = formData.paymentMethod === 'Debt' ? parseFloat(formData.feeCharged) || 0
      : formData.paymentMethod === 'Split' ? parseFloat(formData.amountDebt) || 0 : 0;
    if (!c || debt <= 0) return null;
    const check = creditCheck(c.remaining_balance || 0, c.credit_limit || 0, debt);
    if (check.level !== 'near' && check.level !== 'over') return null;
    const pct = Math.round((check.ratio || 0) * 100);
    return {
      level: check.level,
      text: check.level === 'over'
        ? `Over credit limit: ${c.customer_name} would owe KSh ${check.projected.toLocaleString()} against a KSh ${(c.credit_limit || 0).toLocaleString()} limit (${pct}%).`
        : `Near credit limit: this takes ${c.customer_name} to ${pct}% of their KSh ${(c.credit_limit || 0).toLocaleString()} limit.`,
    };
  }, [customers, formData.customerId, formData.paymentMethod, formData.feeCharged, formData.amountDebt]);

  const { data: salesHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['sales_history'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales_transactions')
        .select('id, receipt_code, created_at, weight_kg, total_price, payment_method, customer_name, product_id, transaction_type, amount_cash, amount_mpesa, amount_debt')
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
      queryClient.invalidateQueries({ queryKey: ['milling-sessions'] });
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
    type: 'sale_delete',
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
    type: 'sale_update',
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
    let fee = '0.00';
    if (p && w > 0) {
      const rate = formData.transactionType === 'Service' ? (p.milling_fee || 0) : (p.selling_price || 0);
      const exactCharge = w * rate;
      // Round up to the nearest 5 KES (Kenya's smallest common coin)
      fee = (Math.ceil(exactCharge / 5) * 5).toFixed(2);
    }
    // Bail out when unchanged: `products` is a fresh [] each render until the query has data
    // (e.g. POS opened offline), and an unconditional setState here loops until React aborts.
    setFormData(prev => (prev.feeCharged === fee ? prev : { ...prev, feeCharged: fee }));
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
      // No open shift never blocks a sale: it is saved without one (recorded_by is still stamped)
      session_id: activeSession && !activeSession.is_closed ? activeSession.id : null,
      customer_id: c?.id || null,
      customer_name: (c?.customer_name || 'Walk-in Customer').toUpperCase().trim(),
      phone_number: c?.customer_phone || null,
      amount_cash: formData.paymentMethod === 'Split' ? (parseFloat(formData.amountCash) || 0) : (formData.paymentMethod === 'Cash' ? totalPrice : 0),
      amount_mpesa: formData.paymentMethod === 'Split' ? (parseFloat(formData.amountMpesa) || 0) : (formData.paymentMethod === 'M-Pesa' ? totalPrice : 0),
      amount_debt: formData.paymentMethod === 'Split' ? (parseFloat(formData.amountDebt) || 0) : (formData.paymentMethod === 'Debt' ? totalPrice : 0),
      created_at: new Date(formData.backdate + 'T' + new Date().toISOString().split('T')[1]).toISOString()
    };

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

  if ((loadingProducts || loadingHistory) && salesHistory.length === 0) return <div className="p-20 text-center font-semibold text-slate-400 uppercase tracking-widest italic animate-pulse">Initializing Terminal...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-3 md:space-y-4 pb-32 md:pb-20 min-h-[100dvh] px-1 md:px-0">
      {error && <div className="bg-red-600 text-white px-3 py-2 rounded-xl font-semibold flex items-center gap-2 text-xs"><AlertTriangle size={16}/>{error}</div>}
      {success && <div className="bg-emerald-500 text-white px-3 py-2 rounded-xl font-semibold flex items-center gap-2 text-xs"><CheckCircle size={16}/>{success}</div>}
      
      {/* ACTIVE SESSION SMART HEADER */}
      <ActiveSessionOverlay />
      
      {!activeSession && (
        <div role="status" className="bg-amber-50 border border-amber-300 px-3 py-2 rounded-xl flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="flex-1 text-xs font-semibold text-amber-900 leading-snug">
            ⚠️ No active shift — Sales are being recorded, but please open a shift to log power meter readings.
            {shiftError && <span className="block text-red-700 mt-1">{shiftError}</span>}
          </p>
          <button
            type="button"
            onClick={startDefaultShift}
            disabled={startSession.isPending}
            className="shrink-0 h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
          >
            <Zap size={14} /> {startSession.isPending ? 'Starting…' : 'Start Default Shift'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-6">
        <div className="md:col-span-3">
          <div className="mill-card p-4 md:p-8 bg-white border-slate-100 shadow-2xl rounded-2xl">
            <form onSubmit={handleInitialSubmit} className="space-y-4 md:space-y-6">
               <div>
                 <label className={FIELD_LABEL}>Mode</label>
                  <div className="flex gap-2">
                    {['Service', 'Product'].map(type => (
                      <button 
                        key={type}
                        type="button" 
                        onClick={() => setFormData({...formData, transactionType: type as any})} 
                        className={`flex-1 h-12 px-4 rounded-xl font-semibold text-xs uppercase border transition-all ${formData.transactionType === type ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {type === 'Service' ? 'Milling' : 'Retail'}
                      </button>
                    ))}
                  </div>
               </div>

                <div>
                  <label className={FIELD_LABEL}>Product</label>
                  <select 
                    value={formData.productId} 
                    onChange={e => setFormData({...formData, productId: e.target.value})} 
                    className={`${FIELD} uppercase`}
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
                  <label className={FIELD_LABEL}>Weight (KG)</label>
                  <div className="relative">
                    <input type="number" step="0.01" value={formData.weightKg} onChange={e => setFormData({...formData, weightKg: e.target.value})} inputMode="decimal" className={`${FIELD} !pr-14 bg-slate-50/50`} placeholder="0.00" />
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 font-semibold text-slate-300 text-xs">KG</span>
                  </div>
                </div>

                <div>
                  <label className={FIELD_LABEL}>Transaction Date</label>
                  <div className="relative">
                    <input 
                      type="date" 
                      value={formData.backdate} 
                      onChange={e => setFormData({...formData, backdate: e.target.value})} 
                      className={`${FIELD} bg-slate-50/50`}
                    />
                    <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                  </div>
                </div>



                <div className="relative">
                  <label className={FIELD_LABEL}>Customer Selection</label>
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
                      className={`${FIELD} !pl-11 !pr-11 uppercase`}
                    />
                    <button 
                      type="button"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400"
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
                      <button key={m} type="button" onClick={() => setFormData({...formData, paymentMethod: m as any})} className={`h-12 px-2 md:px-4 rounded-xl font-semibold text-xs uppercase border transition-all ${formData.paymentMethod === m ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>{m}</button>
                    ))}
                  </div>

                  {formData.paymentMethod === 'Split' && (
                    <div className="grid grid-cols-3 gap-3 mt-4 animate-in slide-in-from-top-2 duration-300">
                      <div>
                        <label className={FIELD_LABEL}>Cash</label>
                        <input type="number" step="0.01" value={formData.amountCash} onChange={e => setFormData({...formData, amountCash: e.target.value})} inputMode="decimal" className={`${FIELD} !px-3 bg-slate-50`} placeholder="0" />
                      </div>
                      <div>
                        <label className={FIELD_LABEL}>M-Pesa</label>
                        <input type="number" step="0.01" value={formData.amountMpesa} onChange={e => setFormData({...formData, amountMpesa: e.target.value})} inputMode="decimal" className={`${FIELD} !px-3 bg-slate-50`} placeholder="0" />
                      </div>
                      <div>
                        <label className={FIELD_LABEL}>Debt</label>
                        <input type="number" step="0.01" value={formData.amountDebt} onChange={e => setFormData({...formData, amountDebt: e.target.value})} inputMode="decimal" className={`${FIELD} !px-3 bg-slate-50`} placeholder="0" />
                      </div>
                    </div>
                  )}

                {creditWarning && (
                  <div className={`px-3 py-2 rounded-xl border text-[11px] font-semibold flex items-start gap-2 ${creditWarning.level === 'over' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{creditWarning.text} You can still complete this sale.</span>
                  </div>
                )}
                <div className="flex flex-col space-y-3 pt-4">
                  <button 
                    type="submit" 
                    disabled={formData.paymentMethod === 'Debt' && !formData.customerId}
                    className={`w-full h-12 text-sm font-semibold rounded-xl flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 ${(formData.paymentMethod === 'Debt' && !formData.customerId) ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
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

                {creditWarning && (
                  <div className={`px-3 py-2 rounded-xl border text-[11px] font-semibold flex items-start gap-2 ${creditWarning.level === 'over' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{creditWarning.text} You can still complete this sale.</span>
                  </div>
                )}

                <div className="flex justify-between pt-4 items-baseline">
                  <span className="text-lg text-slate-500 font-sans font-semibold">TOTAL</span>
                  <span className="text-2xl md:text-4xl font-semibold text-emerald-400 tracking-tighter">KES {parseFloat(formData.feeCharged).toLocaleString()}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 pt-4">
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

        <div className="p-3 max-md:p-2">
          {/* Desktop Table View */}
          <div className="hidden md:block w-full overflow-x-auto overflow-y-auto max-h-[400px] scrollbar-thin border border-slate-100 rounded-lg">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 max-md:text-[11px] max-md:font-medium max-md:tracking-tight">
                  <th className="px-2 py-1.5 md:px-4 md:py-3 max-md:font-medium">Client / Time</th>
                  <th className="px-2 py-1.5 md:px-4 md:py-3 max-md:font-medium">Product & Weight</th>
                  <th className="px-2 py-1.5 md:px-4 md:py-3 max-md:font-medium">Category</th>
                  <th className="px-2 py-1.5 md:px-4 md:py-3 max-md:font-medium">Payment Split</th>
                  <th className="px-2 py-1.5 md:px-4 md:py-3 text-right max-md:font-medium">Total Price</th>
                  <th className="px-2 py-1.5 md:px-4 md:py-3 text-center w-28 max-md:font-medium">Actions</th>
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
                          <tr key={log.id} className="hover:bg-slate-50/50 transition-colors text-xs text-slate-600 max-md:text-[11px] max-md:font-normal">
                            <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap max-md:text-[11px]">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-400 shrink-0 max-md:w-5 max-md:h-5">
                                  <User size={12} />
                                </div>
                                <div>
                                  <p className="font-medium max-md:font-normal text-slate-800 uppercase tracking-tight truncate max-w-[120px] max-md:text-[11px]">{log.customer_name || 'Walk-in'}</p>
                                  <span className="text-[10px] max-md:text-[9px] text-slate-400 block mt-0.5 leading-none">
                                    {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {log.receipt_code && (
                                    <span className="text-[11px] font-normal text-slate-400 block mt-0.5 leading-none uppercase tracking-widest">
                                      {log.receipt_code}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap font-medium max-md:font-normal text-slate-700 max-md:text-[11px]">
                              {prod?.name || 'Maize'} ({log.weight_kg} kg)
                            </td>
                            <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap max-md:text-[11px]">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-semibold max-md:font-normal uppercase ${isService ? 'bg-blue-50 text-brand border border-blue-100/50' : 'bg-amber-50 text-amber-700 border border-amber-100/50'} max-md:text-[9px]`}>
                                {isService ? 'Service' : 'Retail'}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap font-medium max-md:font-normal text-slate-600 max-md:text-[11px]">
                              {[
                                (log.amount_cash || 0) > 0 ? `Cash: ${log.amount_cash}` : null,
                                (log.amount_mpesa || 0) > 0 ? `M-Pesa: ${log.amount_mpesa}` : null,
                                (log.amount_debt || 0) > 0 ? `Debt: ${log.amount_debt}` : null,
                              ].filter(Boolean).length > 0 ? (
                                <span className="text-[10px] max-md:text-[11px] text-slate-600 block leading-tight">
                                  {[
                                    (log.amount_cash || 0) > 0 ? `Cash: ${log.amount_cash}` : null,
                                    (log.amount_mpesa || 0) > 0 ? `M-Pesa: ${log.amount_mpesa}` : null,
                                    (log.amount_debt || 0) > 0 ? `Debt: ${log.amount_debt}` : null,
                                  ].filter(Boolean).join(' | ')}
                                </span>
                              ) : (
                                <span className={`text-[10px] max-md:text-[11px] font-semibold max-md:font-normal ${log.payment_method === 'Debt' ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {log.payment_method}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap text-right font-semibold max-md:font-normal font-mono text-slate-800 max-md:text-[11px]">
                              KSh {log.total_price?.toLocaleString()}
                            </td>
                            <td className="px-2 py-1.5 md:px-4 md:py-3 whitespace-nowrap max-md:text-[11px]">
                              <div className="flex items-center justify-center gap-1.5">
                                <button 
                                  onClick={() => {
                                    setFormData({
                                      customerId: log.customer_id || '',
                                      productId: log.product_id,
                                      weightKg: log.weight_kg.toString(),
                                      feeCharged: log.total_price.toString(),
                                      transactionType: isService ? 'Service' : 'Product',
                                      paymentMethod: log.payment_method as any,
                                      amountCash: (log.amount_cash || 0).toString(),
                                      amountMpesa: (log.amount_mpesa || 0).toString(),
                                      amountDebt: (log.amount_debt || 0).toString(),
                                      backdate: new Date(log.created_at).toISOString().split('T')[0]
                                    });
                                    setShowReceipt(true);
                                  }} 
                                  className="h-7 w-7 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-100 rounded-lg transition-all flex items-center justify-center" 
                                  title="View Receipt"
                                >
                                  <Eye size={12} />
                                </button>
                                {role === 'ADMIN' && (
                                  <>
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
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      
                      {salesHistory.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-10 text-center text-slate-450 font-medium uppercase tracking-wider text-xs italic max-md:text-[11px]">
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

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
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
                      <div key={log.id} className="bg-slate-50 border border-slate-150 p-4 rounded-2xl space-y-3 shadow-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-slate-800 uppercase text-xs truncate max-w-[150px]">{log.customer_name || 'Walk-in'}</p>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {log.receipt_code && (
                              <span className="text-[10px] text-slate-400 font-mono block mt-0.5 uppercase tracking-wider">
                                {log.receipt_code}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold font-mono text-slate-850">KSh {log.total_price?.toLocaleString()}</p>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase inline-block mt-1 ${isService ? 'bg-blue-50 text-brand border border-blue-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                              {isService ? 'Service' : 'Retail'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="text-xs text-slate-600 flex justify-between border-t border-slate-200/50 pt-2">
                          <span>{prod?.name || 'Maize'} ({log.weight_kg} kg)</span>
                          <span className="font-medium text-slate-500">{log.payment_method}</span>
                        </div>
                        
                        <div className="flex justify-between items-center gap-2 pt-3 border-t border-slate-200/50 mt-1">
                          <button 
                            onClick={() => {
                              setFormData({
                                customerId: log.customer_id || '',
                                productId: log.product_id,
                                weightKg: log.weight_kg.toString(),
                                feeCharged: log.total_price.toString(),
                                transactionType: isService ? 'Service' : 'Product',
                                paymentMethod: log.payment_method as any,
                                amountCash: (log.amount_cash || 0).toString(),
                                amountMpesa: (log.amount_mpesa || 0).toString(),
                                amountDebt: (log.amount_debt || 0).toString(),
                                backdate: new Date(log.created_at).toISOString().split('T')[0]
                              });
                              setShowReceipt(true);
                            }}
                            className="flex-1 px-3 py-2 h-10 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                          >
                            <Eye size={14} /> View
                          </button>
                          
                          <button 
                            onClick={() => { if (role === 'ADMIN') startEdit(log); }} 
                            disabled={role !== 'ADMIN'}
                            className={`flex-1 px-3 py-2 h-10 rounded-xl text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm transition-colors ${role === 'ADMIN' ? 'bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 border border-slate-200' : 'bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed opacity-60'}`}
                            title={role === 'ADMIN' ? 'Edit Transaction' : 'Admin Access Required'}
                          >
                            <Pencil size={14} /> Edit
                          </button>
                          
                          <button 
                            onClick={() => { if (role === 'ADMIN') setDeletingSale(log); }} 
                            disabled={role !== 'ADMIN'}
                            className={`flex-1 px-3 py-2 h-10 rounded-xl text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm transition-colors ${role === 'ADMIN' ? 'bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 border border-red-100' : 'bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed opacity-60'}`}
                            title={role === 'ADMIN' ? 'Delete Transaction' : 'Admin Access Required'}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>

                      </div>
                    );
                  })}
                  
                  {salesHistory.length === 0 && (
                    <div className="p-10 text-center text-slate-450 font-medium uppercase tracking-wider text-xs italic">
                      No transactions recorded today
                    </div>
                  )}
                </>
              );
            })()}
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
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Weight (KG)</label>
                <input 
                  required 
                  type="number" 
                  step="0.01" 
                  value={editForm.weightKg} 
                  onChange={e => setEditForm({...editForm, weightKg: e.target.value})} 
                  className="w-full px-4 h-12 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Total Price (KES)</label>
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
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider ml-1 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Payment Method</label>
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
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider ml-1 text-center max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Cash</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={editForm.amountCash}
                      onChange={e => setEditForm({ ...editForm, amountCash: e.target.value })}
                      className="w-full px-2 h-12 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all placeholder-slate-300 text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider ml-1 text-center max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">M-Pesa</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={editForm.amountMpesa}
                      onChange={e => setEditForm({ ...editForm, amountMpesa: e.target.value })}
                      className="w-full px-2 h-12 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all placeholder-slate-300 text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wider ml-1 text-center max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Debt</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={editForm.amountDebt}
                      onChange={e => setEditForm({ ...editForm, amountDebt: e.target.value })}
                      className="w-full px-2 h-12 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all placeholder-slate-300 text-center"
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
                    <div className="p-3 bg-red-50 text-red-900 border border-red-200 rounded-xl text-[10px] font-bold leading-relaxed flex items-start gap-2 shadow-sm animate-in slide-in-from-top-2 duration-200">
                      <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
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
                className="w-full bg-brand hover:bg-brand/90 text-white font-medium h-12 rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider disabled:bg-slate-200 disabled:text-slate-400"
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
            <div className="p-6 grid grid-cols-1 gap-3 md:grid-cols-2">
              <button onClick={() => setDeletingSale(null)} className="py-4 rounded-xl bg-slate-100 text-slate-600 font-black text-xs uppercase hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={() => deleteSaleMutation.mutate(deletingSale)} disabled={deleteSaleMutation.isPending} className="py-4 rounded-xl bg-red-600 text-white font-black text-xs uppercase hover:bg-red-700 transition-all shadow-lg shadow-red-200">
                {deleteSaleMutation.isPending ? 'DELETING...' : 'YES, VOID'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ACTIVE SESSION SMART OVERLAY */}
      <ActiveSessionOverlay />
    </div>
  );
}

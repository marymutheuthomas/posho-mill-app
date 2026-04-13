import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingCart, User, Hash, CheckCircle, AlertCircle, Loader2, Zap, Tag, Receipt, XCircle, PowerOff, Wallet, Phone, Coins } from 'lucide-react';

const POWER_RATE_PER_KWH = 25;

interface Product {
  id: string;
  name: string;
  milling_fee: number;
  selling_price: number;
  current_stock: number;
}

interface MillingSession {
  id: string;
  start_reading: number;
}

type TransactionType = 'Service' | 'Product';
type PaymentMethod = 'Cash' | 'Mpesa' | 'Debt';

export default function ServicePOS() {
  const [loading, setLoading] = useState(false);
  const [fetchingProducts, setFetchingProducts] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeSession, setActiveSession] = useState<MillingSession | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [isClosingMeter, setIsClosingMeter] = useState(false);
  const [endReading, setEndReading] = useState('');
  
  const [formData, setFormData] = useState({
    customerName: '',
    phoneNumber: '',
    productId: '',
    weightKg: '',
    feeCharged: '0.00',
    transactionType: 'Service' as TransactionType,
    paymentMethod: 'Cash' as PaymentMethod,
  });

  useEffect(() => {
    async function init() {
      try {
        const { data: pData, error: pErr } = await supabase
          .from('products')
          .select('id, name, milling_fee, selling_price, current_stock')
          .in('category', ['Finished'])
          .order('name');
        
        if (pErr) throw pErr;
        setProducts(pData || []);

        const { data: sData, error: sErr } = await supabase
          .from('milling_sessions')
          .select('id, start_reading')
          .eq('status', 'Started')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (sErr) throw sErr;
        setActiveSession(sData);
      } catch (err: any) {
        setError('Init Error: ' + err.message);
      } finally {
        setFetchingProducts(false);
      }
    }
    init();
  }, [success]);

  // Auto-calculation logic
  useEffect(() => {
    const selectedProduct = products.find(p => p.id === formData.productId);
    const weight = parseFloat(formData.weightKg);
    
    if (selectedProduct && !isNaN(weight)) {
      const rate = formData.transactionType === 'Service' 
        ? selectedProduct.milling_fee 
        : selectedProduct.selling_price;
      
      const calculatedFee = weight * rate;
      setFormData(prev => ({ ...prev, feeCharged: calculatedFee.toFixed(2) }));
    } else {
      setFormData(prev => ({ ...prev, feeCharged: '0.00' }));
    }
  }, [formData.productId, formData.weightKg, formData.transactionType, products]);

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!activeSession) {
      setError('Mill Motor Not Initialized: Start a Service Session to record sales.');
      return;
    }
    
    const selectedProduct = products.find(p => p.id === formData.productId);
    const weight = parseFloat(formData.weightKg);

    if (formData.transactionType === 'Product' && selectedProduct) {
      if (weight > selectedProduct.current_stock) {
        setError(`Insufficient Stock! Only ${selectedProduct.current_stock}kg available.`);
        return;
      }
    }

    if (formData.paymentMethod === 'Debt' && !formData.customerName) {
      setError('Debt Sales Require a Customer Name and Phone Number.');
      return;
    }

    setShowReceipt(true);
  };

  const commitTransaction = async () => {
    if (!activeSession) return;
    setLoading(true);
    setError('');
    
    try {
      const selectedProduct = products.find(p => p.id === formData.productId);
      if (!selectedProduct) throw new Error("Product not selected");

      // Prepare Transaction Object
      const newTransaction = {
        customer_name: formData.paymentMethod === 'Debt' ? formData.customerName : (formData.customerName || 'Walk-in'),
        phone_number: formData.phoneNumber,
        service_type: selectedProduct.name,
        transaction_type: formData.transactionType,
        payment_method: formData.paymentMethod,
        session_id: activeSession.id,
        product_id: selectedProduct.id,
        weight_kg: parseFloat(formData.weightKg),
        fee_charged: parseFloat(formData.feeCharged),
        created_at: new Date().toISOString()
      };

      // Push to Speed Layer (Local Queue)
      const queueRaw = localStorage.getItem('mill_sync_queue');
      const queue = queueRaw ? JSON.parse(queueRaw) : [];
      queue.push({ table: 'service_transactions', data: newTransaction });
      localStorage.setItem('mill_sync_queue', JSON.stringify(queue));

      // Update Local Stock Persistence (Instant Feedback)
      if (formData.transactionType === 'Product') {
        setProducts(prev => prev.map(p => 
          p.id === selectedProduct.id 
            ? { ...p, current_stock: p.current_stock - parseFloat(formData.weightKg) }
            : p
        ));
      }

      // Instant UI Success
      setSuccess(`✅ ${formData.transactionType} sale saved locally! System will sync in background.`);
      setShowReceipt(false);
      
      // Reset Form
      setFormData({ 
        customerName: '', 
        phoneNumber: '',
        productId: '', 
        weightKg: '', 
        feeCharged: '0.00', 
        transactionType: 'Service',
        paymentMethod: 'Cash'
      });

    } catch (err: any) {
      setError(err.message);
      setShowReceipt(false);
    } finally {
      setLoading(false);
    }
  };

  const closeMeter = async () => {
    if (!activeSession) return;
    const end = parseFloat(endReading);
    if (isNaN(end) || end < activeSession.start_reading) {
      setError(`End reading must be >= ${activeSession.start_reading}`);
      return;
    }

    const powerCost = (end - activeSession.start_reading) * POWER_RATE_PER_KWH;

    setLoading(true);
    try {
      const { error: updErr } = await supabase
        .from('milling_sessions')
        .update({ 
          status: 'Completed', 
          end_reading: end, 
          power_cost: powerCost 
        })
        .eq('id', activeSession.id);
      
      if (updErr) throw updErr;
      setActiveSession(null);
      setIsClosingMeter(false);
      setSuccess('Meter closed and power cost audited!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetchingProducts) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl shadow-sm border border-slate-100">
        <Loader2 size={48} className="text-[#06B6D4] animate-spin mb-4" />
        <p className="text-[#0F172A] font-bold tracking-tight">Syncing Hybrid POS Rates...</p>
      </div>
    );
  }

  const selectedProduct = products.find(p => p.id === formData.productId);
  const unitsConsumed = endReading ? (parseFloat(endReading) - (activeSession?.start_reading || 0)) : 0;

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-700 relative pb-20">
      {/* Receipt Modal */}
      {showReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300">
            <div className="bg-[#4F46E5] p-10 text-center relative">
              <div className="absolute top-0 left-0 w-full h-2 bg-[repeating-linear-gradient(90deg,transparent,transparent_10px,#06B6D4_10px,#06B6D4_20px)]"></div>
              <Receipt size={64} className="text-white mx-auto mb-4" />
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Sale Summary</h3>
            </div>
            <div className="p-10 space-y-6">
              <div className="flex justify-between items-center border-b border-slate-50 pb-4">
                <span className="text-slate-400 font-bold uppercase text-xs tracking-widest">Type</span>
                <span className={`px-4 py-1 rounded-full font-black text-sm uppercase ${formData.transactionType === 'Service' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                  {formData.transactionType}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-50 pb-4">
                <span className="text-slate-400 font-bold uppercase text-xs tracking-widest">Payment</span>
                <span className="font-black text-[#0F172A] uppercase text-sm">{formData.paymentMethod}</span>
              </div>
              <div className="flex justify-between items-start border-b border-slate-50 pb-4">
                <span className="text-slate-400 font-bold uppercase text-xs tracking-widest">Item</span>
                <span className="font-black text-[#0F172A] text-right">{selectedProduct?.name}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-50 pb-4">
                <span className="text-slate-400 font-bold uppercase text-xs tracking-widest">Quantity</span>
                <span className="font-black text-[#0F172A]">{formData.weightKg} KG</span>
              </div>
              <div className="bg-[#F8FAFC] p-6 rounded-2xl border-2 border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-black uppercase text-sm tracking-tighter">Total Amount</span>
                  <span className="text-3xl font-black text-[#0F172A]">KES {formData.feeCharged}</span>
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowReceipt(false)} className="flex-1 px-6 py-4 rounded-xl border-2 border-slate-100 font-bold text-slate-400 hover:bg-slate-50 flex items-center justify-center gap-2"><XCircle size={18} /> Cancel</button>
                <button onClick={commitTransaction} disabled={loading} className="flex-[2] px-6 py-4 rounded-xl bg-[#4F46E5] text-white font-black shadow-xl hover:bg-[#3730A3] flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle size={18} /> Confirm & Save</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meter Closing Modal */}
      {isClosingMeter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-10 border border-slate-100">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-black text-[#0F172A] uppercase tracking-tighter">Power Audit & Close</h3>
                 <button onClick={() => setIsClosingMeter(false)} className="text-slate-300 hover:text-slate-600"><XCircle size={32} /></button>
              </div>
              <div className="space-y-8">
                 <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Ending Reading (kWh)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder={`Current meter (Min: ${activeSession?.start_reading})`}
                      className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-2xl px-6 py-6 text-3xl font-black focus:border-[#4F46E5] outline-none"
                      value={endReading}
                      onChange={(e) => setEndReading(e.target.value)}
                    />
                 </div>
                 <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-dashed border-slate-100 grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Units Consumed</p>
                      <p className="text-2xl font-black text-[#0F172A]">{unitsConsumed.toFixed(2)} kWh</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Power Cost (KES)</p>
                      <p className="text-2xl font-black text-red-600">KES {(unitsConsumed * 25).toLocaleString()}</p>
                    </div>
                 </div>
                 <button onClick={closeMeter} disabled={loading} className="w-full bg-red-600 text-white font-black py-7 rounded-2xl shadow-xl flex items-center justify-center gap-4 text-xl uppercase tracking-widest hover:bg-red-700 disabled:opacity-50">
                    {loading ? <Loader2 className="animate-spin" /> : <><PowerOff size={28} /> Confirm Close</>}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Main Form */}
      <div className="bg-[#4F46E5] p-10 rounded-[2.5rem] shadow-2xl flex flex-col md:flex-row items-center justify-between border border-white/5 mb-10 overflow-hidden relative gap-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#06B6D4]/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="bg-[#06B6D4] p-4 rounded-[1.5rem] shadow-lg">
            < Zap size={32} className="text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-white tracking-tight leading-none mb-3">Hybrid POS</h2>
            <div className="flex gap-2">
               <button 
                 onClick={() => setFormData(prev => ({...prev, transactionType: 'Service'}))}
                 className={`px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-[0.15em] transition-all ${formData.transactionType === 'Service' ? 'bg-white text-[#4F46E5] shadow-lg scale-105' : 'bg-white/10 text-white/40 hover:text-white'}`}
               >
                 Service Sale
               </button>
               <button 
                 onClick={() => setFormData(prev => ({...prev, transactionType: 'Product'}))}
                 className={`px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-[0.15em] transition-all ${formData.transactionType === 'Product' ? 'bg-white text-[#4F46E5] shadow-lg scale-105' : 'bg-white/10 text-white/40 hover:text-white'}`}
               >
                 Product Sale
               </button>
            </div>
          </div>
        </div>
        
        {activeSession ? (
          <button 
            onClick={() => setIsClosingMeter(true)}
            className="relative z-10 bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 shadow-xl transition-all hover:scale-105"
          >
            <PowerOff size={18} /> Stop Mill & Audit
          </button>
        ) : (
          <div className="bg-red-900/40 px-6 py-4 rounded-2xl border border-red-500/30 text-red-200 text-[10px] font-black uppercase tracking-widest relative z-10 animate-pulse">
            Mill Motor Not Initialized
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border-l-8 border-red-500 p-6 rounded-2xl flex items-center gap-4 mb-8">
          <AlertCircle className="text-red-500" size={28} />
          <p className="text-red-700 font-bold">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border-l-8 border-green-500 p-6 rounded-2xl flex items-center gap-4 mb-8">
          <CheckCircle className="text-green-500" size={28} />
          <p className="text-green-700 font-bold">{success}</p>
        </div>
      )}

      <form onSubmit={handleInitialSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
            <div className="w-2 h-8 bg-[#4F46E5] rounded-full"></div>
            <h3 className="font-black text-slate-400 uppercase tracking-widest text-sm text-opacity-60">Sale Registry</h3>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Method</label>
            <div className="grid grid-cols-3 gap-3">
              {(['Cash', 'Mpesa', 'Debt'] as PaymentMethod[]).map(method => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setFormData({...formData, paymentMethod: method})}
                  className={`py-4 rounded-2xl font-black text-xs uppercase transition-all flex flex-col items-center gap-2 border-2 ${formData.paymentMethod === method ? 'bg-[#4F46E5] border-[#4F46E5] text-white shadow-lg scale-105' : 'bg-[#F8FAFC] border-slate-50 text-slate-400 hover:border-[#4F46E5]/40'}`}
                >
                  {method === 'Cash' && <Coins size={18} />}
                  {method === 'Mpesa' && <Wallet size={18} />}
                  {method === 'Debt' && <User size={18} />}
                  {method}
                </button>
              ))}
            </div>
          </div>

          {(formData.paymentMethod === 'Debt' || formData.transactionType === 'Product') && (
            <div className="space-y-4 pt-2 animate-in slide-in-from-top-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Customer Name {formData.paymentMethod === 'Debt' && '*'}</label>
                <div className="relative">
                   <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                   <input type="text" required={formData.paymentMethod === 'Debt'} className="w-full bg-[#F8FAFC] border-2 border-slate-50 rounded-2xl pl-12 pr-6 py-4 font-bold focus:border-[#4F46E5] outline-none" placeholder="Individual" value={formData.customerName} onChange={(e) => setFormData({...formData, customerName: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number {formData.paymentMethod === 'Debt' && '*'}</label>
                <div className="relative">
                   <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                   <input type="tel" required={formData.paymentMethod === 'Debt'} className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-2xl pl-12 pr-6 py-4 font-bold focus:border-[#4F46E5] outline-none" placeholder="0712345678" value={formData.phoneNumber} onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{formData.transactionType === 'Service' ? 'Service Type' : 'Select Product'}</label>
            <div className="relative">
              <Tag size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <select required className="w-full bg-[#F8FAFC] border-2 border-slate-50 rounded-2xl pl-12 pr-6 py-4 font-bold focus:border-[#4F46E5] outline-none transition-all" value={formData.productId} onChange={(e) => setFormData({...formData, productId: e.target.value})}>
                <option value="">Choose item...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} {formData.transactionType === 'Product' ? `(Stock: ${p.current_stock}kg)` : `(Fee: KES ${p.milling_fee})`}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
            <div className="w-2 h-8 bg-[#06B6D4] rounded-full"></div>
            <h3 className="font-black text-slate-400 uppercase tracking-widest text-sm text-opacity-60">Financial Calculation</h3>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{formData.transactionType === 'Service' ? 'Service Weight (KG)' : 'Product Weight (KG)'}</label>
            <div className="relative">
              <Hash size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input type="number" step="0.1" required className="w-full bg-[#F8FAFC] border-2 border-slate-50 rounded-2xl pl-12 pr-6 py-4 font-bold focus:border-[#4F46E5] outline-none" placeholder="0.0" value={formData.weightKg} onChange={(e) => setFormData({...formData, weightKg: e.target.value})} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Total Fee (KES)</label>
            <div className="relative">
              <ShoppingCart size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input type="text" readOnly className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-6 py-4 font-black text-[#0F172A] text-2xl" value={formData.feeCharged} />
            </div>
          </div>

          {!activeSession && (
             <div className="p-4 bg-red-50 rounded-2xl border-2 border-red-100 flex items-center gap-3">
                <AlertCircle size={20} className="text-red-500" />
                <p className="text-[10px] font-black text-red-700 uppercase leading-none">Initialization Required: Start a Service Session first.</p>
             </div>
          )}
        </div>

        <button type="submit" disabled={!activeSession} className="md:col-span-2 w-full bg-[#4F46E5] hover:bg-[#3730A3] text-white font-black py-7 rounded-[2.5rem] shadow-2xl transition-all hover:-translate-y-1 flex items-center justify-center gap-4 text-xl uppercase tracking-widest mt-4 disabled:opacity-30 disabled:grayscale disabled:hover:translate-y-0">
          <Receipt size={32} className="text-white" /> Review Receipt & Checkout
        </button>
      </form>
    </div>
  );
}

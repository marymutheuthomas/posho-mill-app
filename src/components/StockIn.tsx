import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingCart, CheckCircle, AlertCircle, Loader2, Truck, DollarSign, Package } from 'lucide-react';

interface Product {
  id: string;
  product_code: string;
  name: string;
  category: string;
}

type LoadingState = 'idle' | 'fetching' | 'saving';

export default function StockIn() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('fetching');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [formData, setFormData] = useState({
    productId: '',
    qtyReceived: '',
    unitPrice: '',
    supplierName: '',
  });

  useEffect(() => {
    async function fetchProducts() {
      setLoadingState('fetching');
      try {
        const { data: prods, error: pErr } = await supabase
          .from('products')
          .select('id, product_code, name, category')
          .order('name');

        if (pErr) throw pErr;
        setProducts(prods ?? []);
      } catch (err: any) {
        setError(`Database Connection Error: ${err.message}`);
      } finally {
        setLoadingState('idle');
      }
    }
    fetchProducts();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    setLoadingState('saving');
    try {
      const { error: insErr } = await supabase
        .from('purchases')
        .insert([{
          product_id: formData.productId,
          qty_received: parseFloat(formData.qtyReceived),
          unit_price: parseFloat(formData.unitPrice),
          supplier_name: formData.supplierName,
        }]);

      if (insErr) throw insErr;
      setSuccessMsg('Stock purchase recorded successfully!');
      setFormData({ productId: '', qtyReceived: '', unitPrice: '', supplierName: '' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingState('idle');
    }
  };

  const totalCost = (parseFloat(formData.qtyReceived || '0') * parseFloat(formData.unitPrice || '0')).toFixed(2);

  if (loadingState === 'fetching') {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl shadow-sm border border-slate-100">
        <Loader2 size={48} className="text-[#06B6D4] animate-spin mb-4" />
        <p className="text-[#0F172A] font-bold tracking-tight">Syncing Inventory Data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
      <form onSubmit={handleSave} className="space-y-8">
        {/* Header Block */}
        <div className="bg-[#4F46E5] p-8 rounded-[2rem] shadow-xl flex items-center justify-between border border-white/5 relative overflow-hidden">
             {/* Decorative background element */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#06B6D4]/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="bg-[#06B6D4] p-4 rounded-2xl shadow-lg">
              <ShoppingCart size={28} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Stock In / Purchases</h2>
              <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-1">Grains & Raw Materials Entry</p>
            </div>
          </div>
          
          <div className="hidden md:block bg-white/10 px-6 py-3 rounded-2xl border border-white/10 relative z-10 backdrop-blur-sm">
            <p className="text-white/40 text-[10px] font-black uppercase tracking-tighter mb-0.5">Total Transaction</p>
            <p className="text-white font-mono font-black text-xl">KES {totalCost}</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-8 border-red-500 p-6 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-left-4">
            <AlertCircle className="text-red-500" size={28} />
            <p className="text-red-700 font-bold">{error}</p>
          </div>
        )}

        {successMsg && (
          <div className="bg-green-50 border-l-8 border-green-500 p-6 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-left-4">
            <CheckCircle className="text-green-500" size={28} />
            <p className="text-green-700 font-bold">{successMsg}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product Details Card */}
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <div className="w-2 h-8 bg-[#4F46E5] rounded-full"></div>
              <div className="flex items-center gap-2">
                <Package size={18} className="text-slate-400" />
                <h3 className="font-black text-slate-400 uppercase tracking-widest text-sm">Product Information</h3>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Select Product</label>
              <select
                required
                className="w-full bg-[#F8FAFC] border-2 border-slate-50 rounded-2xl px-6 py-4 font-bold focus:border-[#4F46E5] outline-none transition-all appearance-none"
                value={formData.productId}
                onChange={(e) => setFormData({...formData, productId: e.target.value})}
              >
                <option value="">Choose item...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Quantity (KG)</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold focus:border-[#4F46E5] outline-none transition-all"
                value={formData.qtyReceived}
                onChange={(e) => setFormData({...formData, qtyReceived: e.target.value})}
              />
            </div>
          </div>

          {/* Supplier & Price Card */}
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <div className="w-2 h-8 bg-[#06B6D4] rounded-full"></div>
              <div className="flex items-center gap-2">
                <Truck size={18} className="text-slate-400" />
                <h3 className="font-black text-slate-400 uppercase tracking-widest text-sm">Supplier & Costing</h3>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Supplier Name</label>
              <input
                type="text"
                required
                placeholder="Name of Farmer/Supplier"
                className="w-full bg-[#F8FAFC] border-2 border-slate-50 rounded-2xl px-6 py-4 font-bold focus:border-[#4F46E5] outline-none transition-all"
                value={formData.supplierName}
                onChange={(e) => setFormData({...formData, supplierName: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Unit Price (KES/KG)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="w-full bg-[#F8FAFC] border-2 border-slate-50 rounded-2xl px-6 py-4 font-bold focus:border-[#4F46E5] outline-none transition-all pl-12"
                  value={formData.unitPrice}
                  onChange={(e) => setFormData({...formData, unitPrice: e.target.value})}
                />
                <DollarSign size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={loadingState === 'saving'}
            className="group relative w-full h-[84px] bg-[#4F46E5] hover:bg-[#3730A3] text-white rounded-[2rem] shadow-2xl transition-all active:scale-[0.98] overflow-hidden disabled:opacity-50"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            
            <div className="flex items-center justify-center gap-4 relative z-10">
              {loadingState === 'saving' ? (
                <Loader2 className="animate-spin" size={32} />
              ) : (
                <>
                  <CheckCircle size={32} className="text-[#06B6D4]" />
                  <span className="text-xl font-black uppercase tracking-[0.2em]">Commit Purchase to Ledger</span>
                </>
              )}
            </div>
          </button>
        </div>
      </form>
    </div>
  );
}

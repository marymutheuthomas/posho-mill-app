import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Send, 
  Inbox, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Truck, 
  ArrowRight,
  Package,
  History,
  Clock
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  mill_stock: number;
  current_stock: number;
}

interface Transfer {
  id: string;
  product_id: string;
  quantity: number;
  status: 'Pending' | 'Completed';
  created_at: string;
  product: {
    name: string;
  };
}

export default function StockTransfer() {
  const [activeTab, setActiveTab] = useState<'dispatch' | 'incoming' | 'history'>('dispatch');
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    productId: '',
    quantity: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Products
      const { data: pData } = await supabase
        .from('products')
        .select('id, name, mill_stock, current_stock')
        .order('name');
      setProducts(pData || []);

      // Fetch Transfers
      const { data: tData } = await supabase
        .from('stock_transfers')
        .select(`
          *,
          product:products(name)
        `)
        .order('created_at', { ascending: false });
      setTransfers(tData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const product = products.find(p => p.id === formData.productId);
    const qty = parseFloat(formData.quantity);

    if (!product || isNaN(qty) || qty <= 0) {
      setError('Please select a product and valid quantity.');
      return;
    }

    if (qty > product.mill_stock) {
      setError(`Insufficient Mill Stock! Only ${product.mill_stock}kg available.`);
      return;
    }

    try {
      // 1. Create Transfer Record
      const { error: tErr } = await supabase
        .from('stock_transfers')
        .insert([{
          product_id: formData.productId,
          quantity: qty,
          status: 'Pending'
        }]);
      if (tErr) throw tErr;

      // 2. Deduct from Mill Stock
      const { error: pErr } = await supabase
        .from('products')
        .update({ mill_stock: product.mill_stock - qty })
        .eq('id', product.id);
      if (pErr) throw pErr;

      setSuccess(`Success: ${qty}kg of ${product.name} dispatched to shop!`);
      setFormData({ productId: '', quantity: '' });
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReceive = async (transfer: Transfer) => {
    setError('');
    setSuccess('');

    try {
      const product = products.find(p => p.id === transfer.product_id);
      if (!product) throw new Error("Product data not found");

      // 1. Update status to Completed
      const { error: tErr } = await supabase
        .from('stock_transfers')
        .update({ status: 'Completed' })
        .eq('id', transfer.id);
      if (tErr) throw tErr;

      // 2. Add to Shop Stock (current_stock)
      const { error: pErr } = await supabase
        .from('products')
        .update({ current_stock: product.current_stock + transfer.quantity })
        .eq('id', product.id);
      if (pErr) throw pErr;

      setSuccess(`Received: ${transfer.quantity}kg of ${transfer.product?.name} added to shop inventory.`);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading && !products.length) {
    return (
      <div className="flex justify-center p-20">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Navigation Header */}
      <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex gap-2">
        {(['dispatch', 'incoming', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${activeTab === tab ? 'bg-[#4F46E5] text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
          >
            {tab === 'dispatch' && <Send size={16} />}
            {tab === 'incoming' && <Inbox size={16} />}
            {tab === 'history' && <History size={16} />}
            {tab}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border-l-8 border-red-500 p-6 rounded-2xl flex items-center gap-4">
          <AlertCircle className="text-red-500" size={28} />
          <p className="text-red-700 font-bold">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border-l-8 border-emerald-500 p-6 rounded-2xl flex items-center gap-4">
          <CheckCircle className="text-emerald-500" size={28} />
          <p className="text-emerald-700 font-bold">{success}</p>
        </div>
      )}

      {activeTab === 'dispatch' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8">
            <div className="flex items-center gap-4 border-b border-slate-50 pb-6">
              <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600">
                <Truck size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Dispatch to Shop</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Move stock from Mill to Retail</p>
              </div>
            </div>

            <form onSubmit={handleDispatch} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Product</label>
                <select
                  required
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold outline-none focus:border-[#4F46E5] transition-all"
                  value={formData.productId}
                  onChange={(e) => setFormData({...formData, productId: e.target.value})}
                >
                  <option value="">Choose item...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Mill: {p.mill_stock}kg)</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Transfer Quantity (KG)</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="0.0"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold outline-none focus:border-[#4F46E5] transition-all"
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#4F46E5] text-white font-black py-6 rounded-2xl shadow-xl hover:bg-[#3730A3] transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
              >
                <ArrowRight size={20} /> Initialize Dispatch
              </button>
            </form>
          </div>

          <div className="bg-[#4F46E5] p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col justify-center text-white">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
            <Package size={80} className="mb-6 opacity-20" />
            <h4 className="text-3xl font-black uppercase tracking-tighter mb-4 leading-none">Safe Transfer System</h4>
            <p className="text-white/60 font-bold text-sm leading-relaxed mb-8">
              Every bag dispatched is tracked. Stock is only considered "Retail Ready" after the shop manager verifies the receipt on their terminal.
            </p>
            <div className="bg-white/10 p-6 rounded-2xl border border-white/10 backdrop-blur-md">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Internal Audit Rule</p>
              <p className="text-xs font-bold leading-relaxed">System flags any dispatch pending for more than 24 hours to prevent "Lost in Transit" inventory errors.</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'incoming' && (
        <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
           <div className="flex items-center justify-between mb-10 pb-6 border-b border-slate-50">
              <div className="flex items-center gap-4">
                 <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600">
                    <Inbox size={24} />
                 </div>
                 <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Stock Waiting for Reception</h3>
              </div>
           </div>

           <div className="grid gap-4">
              {transfers.filter(t => t.status === 'Pending').length === 0 ? (
                <div className="text-center py-20 text-slate-300 font-bold uppercase tracking-widest">
                   No shipments currently in transit
                </div>
              ) : (
                transfers.filter(t => t.status === 'Pending').map(t => (
                  <div key={t.id} className="bg-slate-50 p-8 rounded-3xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-indigo-200 transition-all">
                    <div className="flex items-center gap-6">
                      <div className="bg-white p-4 rounded-2xl shadow-sm text-[#4F46E5]">
                        <Package size={28} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Incoming Shipment</p>
                        <h4 className="text-xl font-black text-slate-800">{t.quantity}kg of {t.product?.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock size={12} className="text-indigo-400" />
                          <span className="text-[10px] font-bold text-indigo-400 uppercase">{new Date(t.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleReceive(t)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center gap-2"
                    >
                      <CheckCircle size={16} /> Verify & Receive
                    </button>
                  </div>
                ))
              )}
           </div>
        </div>
      )}

      {activeTab === 'history' && (
         <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-8 px-2">Audit History</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-slate-50">
                    <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Date</th>
                    <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Product</th>
                    <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 text-center">Qty</th>
                    <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {transfers.map(t => (
                    <tr key={t.id} className="group hover:bg-slate-50 transition-all">
                      <td className="py-6 px-4 text-xs font-bold text-slate-500 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="py-6 px-4 text-sm font-black text-slate-800">{t.product?.name}</td>
                      <td className="py-6 px-4 text-sm font-black text-slate-800 text-center">{t.quantity}kg</td>
                      <td className="py-6 px-4 text-right">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${t.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600 animate-pulse'}`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
         </div>
      )}
    </div>
  );
}

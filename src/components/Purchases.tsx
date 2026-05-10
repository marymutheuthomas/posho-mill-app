import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { withRetry } from '../lib/network';
import { Package, User as UserIcon, RotateCcw, History, CheckCircle, AlertCircle, Pencil, Trash2, X, DollarSign } from 'lucide-react';

const CATEGORIES = ['Maize Grain', 'Sacks', 'Fuel', 'Maintenance', 'Other'];
type SyncStatus = 'pending' | 'synced' | 'failed';
interface PurchaseRecord { 
  id: string; 
  category: string; 
  quantity: number; 
  unit_price: number;
  total_amount: number; 
  supplier_name?: string;
  created_at: string;
  status?: SyncStatus; 
}
type LoadingState = 'idle' | 'saving' | 'fetching';

export default function Purchases() {
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [history, setHistory] = useState<PurchaseRecord[]>([]);
  const [formData, setFormData] = useState({ category: '', qtyReceived: '', unitPrice: '', supplierName: '' });

  // Admin Actions
  const [editModal, setEditModal] = useState<{ open: boolean; record: PurchaseRecord | null }>({ open: false, record: null });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; record: PurchaseRecord | null }>({ open: false, record: null });
  const [editForm, setEditForm] = useState({ category: '', qty: 0, price: 0, supplier: '' });

  const fetchHistory = async () => {
    setLoadingState('fetching');
    try {
      const { data, error: fetchErr } = await supabase
        .from('purchases')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (fetchErr) throw fetchErr;
      setHistory((data as PurchaseRecord[]) || []);
    } catch (err: any) {
      console.error('Fetch Error:', err.message);
    } finally {
      setLoadingState('idle');
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccessMsg('');
    const qty = parseFloat(formData.qtyReceived || '1');
    const price = parseFloat(formData.unitPrice || '0');
    const total_amount = qty * price;
    
    // SCHEMA CHECK: Using customer_name instead of supplier_name as requested
    const payload = { 
      category: formData.category, 
      quantity: qty, 
      unit_price: price, 
      total_amount, 
      supplier_name: formData.supplierName 
    };

    const np: PurchaseRecord = { 
      id: Date.now().toString(), 
      category: payload.category, 
      quantity: qty, 
      unit_price: price,
      total_amount, 
      supplier_name: payload.supplier_name,
      created_at: new Date().toISOString(),
      status: 'pending' 
    };
    setHistory(prev => [np, ...prev]);
    setFormData({ category: '', qtyReceived: '', unitPrice: '', supplierName: '' });
    
    setLoadingState('saving');
    try {
      const { error: insErr } = await withRetry('Insert Purchase', async () => await supabase.from('purchases').insert([payload]));
      if (insErr) throw insErr;

      // STOCK-IN LOGIC: If Maize (101), increment product stock
      if (payload.category === 'Maize Grain') {
        const { data: prods, error: pErr } = await supabase.from('products').select('id, current_stock, product_code, name');
        if (pErr) throw new Error('Failed to access product catalog: ' + pErr.message);
        
        const pData = prods?.find(p => p.product_code === '101' || p.name.toLowerCase().includes('maize bulk') || p.name.toLowerCase().includes('grain'));
        
        if (pData) {
          const { error: updErr } = await supabase
            .from('products')
            .update({ current_stock: Number(pData.current_stock || 0) + qty })
            .eq('id', pData.id);
          
          if (updErr) throw new Error('Failed to update stock: ' + updErr.message);
        } else {
          throw new Error('SYSTEM ERROR: Could not find "Maize Bulk" (101) in the product registry to refill stock.');
        }
      }

      setHistory(prev => prev.map(p => p.id === np.id ? { ...p, status: 'synced' } : p));
      setSuccessMsg('Expense recorded & Stock Updated!');
      fetchHistory();
    } catch (err: any) {
      setHistory(prev => prev.map(p => p.id === np.id ? { ...p, status: 'failed' } : p));
      setError(err.message);
    } finally {
      setLoadingState('idle');
    }
  };

  const openEditModal = (record: PurchaseRecord) => {
    setEditForm({ category: record.category, qty: record.quantity, price: record.unit_price, supplier: record.supplier_name || '' });
    setEditModal({ open: true, record });
  };

  const handleEditPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.record) return;
    setLoadingState('saving');
    try {
      const oldQty = editModal.record.quantity;
      const newQty = editForm.qty;
      const diff = newQty - oldQty;

      // 1. Update Purchase Record
      const { error: updErr } = await supabase
        .from('purchases')
        .update({
          category: editForm.category,
          quantity: newQty,
          unit_price: editForm.price,
          total_amount: newQty * editForm.price,
          supplier_name: editForm.supplier
        })
        .eq('id', editModal.record.id);
      
      if (updErr) throw updErr;

      // 2. Adjust Stock if Maize Grain
      if (editForm.category === 'Maize Grain') {
        const { data: prods } = await supabase.from('products').select('id, current_stock, product_code, name');
        const pData = prods?.find(p => p.product_code === '101' || p.name.toLowerCase().includes('maize bulk'));
        if (pData) {
          await supabase.from('products').update({ current_stock: (pData.current_stock || 0) + diff }).eq('id', pData.id);
        }
      }

      setSuccessMsg('Record and inventory updated successfully.');
      setEditModal({ open: false, record: null });
      fetchHistory();
    } catch (err: any) { setError(err.message); }
    finally { setLoadingState('idle'); }
  };

  const handleDeletePurchase = async () => {
    if (!deleteModal.record) return;
    setLoadingState('saving');
    try {
      const { error: delErr } = await supabase.from('purchases').delete().eq('id', deleteModal.record.id);
      if (delErr) throw delErr;

      setSuccessMsg('Expense record removed.');
      setDeleteModal({ open: false, record: null });
      fetchHistory();
    } catch (err: any) { setError(err.message); }
    finally { setLoadingState('idle'); }
  };

  const totalPreview = (parseFloat(formData.qtyReceived || '1') * parseFloat(formData.unitPrice || '0')).toFixed(2);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-end">
        <div className="bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Est. Cost</p>
          <p className="text-lg font-black text-slate-900">KES {totalPreview}</p>
        </div>
      </div>

      {error && <div className="bg-red-600 text-white p-4 rounded-xl font-black flex items-center gap-3 shadow-lg"><AlertCircle size={20}/>{error}</div>}
      {successMsg && <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-900 p-4 rounded-xl font-bold flex items-center gap-3"><CheckCircle size={20}/>{successMsg}</div>}

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="mill-card p-8 space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Package size={16}/> Classification</h3>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Category</label>
              <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                className="mill-input w-full font-bold">
                <option value="">Select category...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="mill-card p-8 space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><DollarSign size={16}/> Financials</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Quantity (KG)</label>
                <input type="number" step="0.01" placeholder="1" value={formData.qtyReceived} onChange={e => setFormData({...formData, qtyReceived: e.target.value})}
                  className="mill-input w-full" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Unit Price</label>
                <input type="number" step="0.01" required placeholder="0.00" value={formData.unitPrice} onChange={e => setFormData({...formData, unitPrice: e.target.value})}
                  className="mill-input w-full" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Supplier Name</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="text" placeholder="Vendor details" value={formData.supplierName} onChange={e => setFormData({...formData, supplierName: e.target.value})}
                  className="mill-input w-full pl-10" />
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <button type="submit" disabled={loadingState === 'saving'}
            className="mill-btn-primary w-full py-5 text-lg shadow-lg shadow-mill-primary/20 flex items-center justify-center gap-3 uppercase tracking-widest">
            {loadingState === 'saving' ? 'PROCESSING...' : '✓ RECORD EXPENSE & STOCK-IN'}
          </button>
        </div>
      </form>

      {/* PURCHASES HISTORY TABLE */}
      <div className="mill-card p-0 overflow-hidden bg-white border-slate-200 shadow-2xl">
        <div className="p-6 md:p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-xl md:rounded-2xl shadow-sm flex items-center justify-center text-slate-900 border border-slate-100">
              <History size={20} />
            </div>
            <div>
              <h3 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tighter">Purchase History</h3>
              <p className="hidden md:block text-[11px] font-black text-slate-500 uppercase tracking-widest">Expense Audit · Last 50 Records</p>
            </div>
          </div>
          <button onClick={fetchHistory} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-900 transition-all shadow-sm">
            <RotateCcw size={18} className={loadingState === 'fetching' ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Mobile: Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {history.length === 0 && loadingState !== 'fetching' && (
            <p className="p-12 text-center text-slate-400 font-black uppercase tracking-widest text-xs italic">No records found</p>
          )}
          {history.map(p => (
            <div key={p.id} className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-900 uppercase">{p.category}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <span className="text-lg font-black text-slate-900 font-mono">KES {p.total_amount?.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-slate-500 uppercase">{p.supplier_name || 'N/A'}</span>
                <span className="font-bold text-slate-400">{p.quantity} units</span>
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-50">
                <button onClick={() => openEditModal(p)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase">Edit</button>
                <button onClick={() => setDeleteModal({ open: true, record: p })} className="flex-1 py-2 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase">Delete</button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Date</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Category</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Supplier</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Quantity</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Unit Price</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Total</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-10 py-5">
                    <p className="text-[12px] font-black text-slate-900">{new Date(p.created_at).toLocaleDateString()}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">{new Date(p.created_at).toLocaleTimeString()}</p>
                  </td>
                  <td className="px-10 py-5">
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[9px] font-black uppercase">{p.category}</span>
                  </td>
                  <td className="px-10 py-5 font-black text-[13px] text-slate-900 uppercase">{p.supplier_name || '-'}</td>
                  <td className="px-10 py-5 font-black text-slate-900">{p.quantity}</td>
                  <td className="px-10 py-5 font-bold text-slate-500 text-sm">KES {p.unit_price?.toLocaleString()}</td>
                  <td className="px-10 py-5 font-black text-slate-900 text-lg">KES {p.total_amount?.toLocaleString()}</td>
                  <td className="px-10 py-5 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditModal(p)} className="p-2 bg-slate-100 text-slate-400 hover:text-slate-900 rounded-lg transition-all"><Pencil size={14}/></button>
                      <button onClick={() => setDeleteModal({ open: true, record: p })} className="p-2 bg-red-50 text-red-400 hover:text-red-600 rounded-lg transition-all"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* EDIT MODAL */}
      {editModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Edit Purchase</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Correct Typo or Amount</p>
              </div>
              <button onClick={() => setEditModal({ open: false, record: null })} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20}/></button>
            </div>
            <form onSubmit={handleEditPurchase} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Category</label>
                <select value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} className="mill-input w-full font-bold">
                   {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Quantity (KG)</label>
                  <input type="number" step="0.01" value={editForm.qty} onChange={e => setEditForm({...editForm, qty: parseFloat(e.target.value)})} className="mill-input w-full font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Unit Price</label>
                  <input type="number" step="0.01" value={editForm.price} onChange={e => setEditForm({...editForm, price: parseFloat(e.target.value)})} className="mill-input w-full font-bold" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Supplier Name</label>
                <input type="text" value={editForm.supplier} onChange={e => setEditForm({...editForm, supplier: e.target.value})} className="mill-input w-full font-bold uppercase" />
              </div>
              <button type="submit" disabled={loadingState === 'saving'} className="mill-btn-primary w-full py-4 shadow-xl">
                {loadingState === 'saving' ? 'UPDATING...' : '✓ SAVE CHANGES'}
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
              <h3 className="text-xl font-black uppercase tracking-tighter">Delete Record?</h3>
              <p className="text-xs text-red-100 font-bold uppercase mt-1 leading-relaxed">
                This action will permanently remove the record for <span className="font-black text-white">{deleteModal.record?.category}</span>. Inventory levels will NOT be reversed.
              </p>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <button onClick={() => setDeleteModal({ open: false, record: null })} className="py-4 rounded-xl bg-slate-100 text-slate-600 font-black text-xs uppercase hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={handleDeletePurchase} disabled={loadingState === 'saving'} className="py-4 rounded-xl bg-red-600 text-white font-black text-xs uppercase hover:bg-red-700 transition-all shadow-lg shadow-red-200">
                {loadingState === 'saving' ? 'DELETING...' : 'YES, DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

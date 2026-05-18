import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { withRetry } from '../lib/network';
import { Package, User as UserIcon, RotateCcw, History, CheckCircle, AlertCircle, Pencil, Trash2, X, DollarSign } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type SyncStatus = 'pending' | 'synced' | 'failed';
type PurchaseMode = 'restock' | 'expense';

interface Product {
  id: string;
  name: string;
  product_code: string;
}

interface PurchaseRecord { 
  id: string; 
  product_id: string | null;
  old_item_name?: string | null;
  category?: string | null;
  quantity: number; 
  unit_price: number;
  total_amount: number; 
  supplier_name?: string;
  created_at: string;
  status?: SyncStatus; 
}

const EXPENSE_CATEGORIES = ['Salary Payment', 'Electricity Bill', 'Mill Repair & Maintenance', 'Grease / Lubricants', 'Airtime & Internet', 'Packing Bags', 'Others'];

type LoadingState = 'idle' | 'saving' | 'fetching';

export default function Purchases() {
  const queryClient = useQueryClient();
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [history, setHistory] = useState<PurchaseRecord[]>([]);
  const [mode, setMode] = useState<PurchaseMode>('restock');
  const [formData, setFormData] = useState({ product_id: '', expenseDesc: '', expenseCategory: '', qtyReceived: '', unitPrice: '', supplierName: '' });

  const handleModeChange = (m: PurchaseMode) => {
    setMode(m);
    setFormData(prev => ({ ...prev, product_id: '', expenseDesc: '', expenseCategory: '' }));
  };
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // Fetch Products for the Dropdown
  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name, product_code').order('name');
      if (error) throw error;
      return data as Product[];
    }
  });

  const getProductName = (pid: string) => {
    return allProducts.find(p => p.id === pid)?.name || 'Unknown Item';
  };

  /** Single source of truth for display name in table rows and modals */
  const getRecordLabel = (p: PurchaseRecord) =>
    p.product_id ? getProductName(p.product_id) : (p.old_item_name || p.category || '—');

  // Admin Actions
  const [editModal, setEditModal] = useState<{ open: boolean; record: PurchaseRecord | null; mode: PurchaseMode }>({ open: false, record: null, mode: 'restock' });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; record: PurchaseRecord | null }>({ open: false, record: null });
  const [editForm, setEditForm] = useState({ product_id: '', expenseDesc: '', expenseCategory: '', qty: 0, price: 0, supplier: '' });

  const fetchHistory = async () => {
    setLoadingState('fetching');
    try {
      const { data, error: fetchErr } = await supabase
        .from('purchases')
        .select(`*`)
        .gte('created_at', `${dateRange.start}T00:00:00`)
        .lte('created_at', `${dateRange.end}T23:59:59`)
        .order('created_at', { ascending: false });
      
      if (fetchErr) throw fetchErr;
      setHistory((data || []) as PurchaseRecord[]);
    } catch (err: any) {
      console.error('Fetch Error:', err.message);
    } finally {
      setLoadingState('idle');
    }
  };

  // Re-fetch whenever the date range changes
  useEffect(() => {
    fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccessMsg('');
    
    if (mode === 'restock' && !formData.product_id) {
      setError('Please select a valid product.');
      return;
    }
    if (mode === 'expense' && !formData.expenseDesc.trim()) {
      setError('Please enter an expense description.');
      return;
    }

    const qty = parseFloat(formData.qtyReceived || '1');
    const price = parseFloat(formData.unitPrice || '0');
    const total_amount = qty * price;
    
    const payload = mode === 'restock'
      ? { product_id: formData.product_id, old_item_name: null, category: null, quantity: qty, unit_price: price, total_amount, supplier_name: formData.supplierName }
      : { product_id: null, old_item_name: formData.expenseDesc, category: formData.expenseCategory || 'Others', quantity: qty, unit_price: price, total_amount, supplier_name: formData.supplierName };

    const np: PurchaseRecord = { 
      id: Date.now().toString(), 
      ...payload,
      created_at: new Date().toISOString(),
      status: 'pending' 
    };
    
    setHistory(prev => [np, ...prev]);
    setFormData({ product_id: '', expenseDesc: '', expenseCategory: '', qtyReceived: '', unitPrice: '', supplierName: '' });
    
    setLoadingState('saving');
    try {
      const { data, error: insErr } = await withRetry('Insert Purchase', async () => await supabase.from('purchases').insert([payload]).select());
      if (insErr) throw insErr;
      
      const serverRecord = data && data.length > 0 ? data[0] : null;
      setHistory(prev => prev.map(p => p.id === np.id ? { ...p, id: serverRecord ? serverRecord.id : p.id, status: 'synced' } : p));
      setSuccessMsg('Record saved successfully!');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      fetchHistory();
    } catch (err: any) {
      setHistory(prev => prev.map(p => p.id === np.id ? { ...p, status: 'failed' } : p));
      setError(`Insert Error: ${err.message}`);
    } finally {
      setLoadingState('idle');
    }
  };

  const openEditModal = (record: PurchaseRecord) => {
    const recMode: PurchaseMode = record.product_id ? 'restock' : 'expense';
    setEditForm({ 
      product_id: record.product_id || '', 
      expenseDesc: record.old_item_name || '',
      expenseCategory: record.category || '',
      qty: record.quantity, 
      price: record.unit_price, 
      supplier: record.supplier_name || '' 
    });
    setEditModal({ open: true, record, mode: recMode });
  };

  const handleEditPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.record) return;
    setLoadingState('saving');
    try {
      const newQty = editForm.qty;
      const updatePayload = editModal.mode === 'restock'
        ? { product_id: editForm.product_id, old_item_name: null, category: null, quantity: newQty, unit_price: editForm.price, total_amount: newQty * editForm.price, supplier_name: editForm.supplier }
        : { product_id: null, old_item_name: editForm.expenseDesc, category: editForm.expenseCategory || 'Others', quantity: newQty, unit_price: editForm.price, total_amount: newQty * editForm.price, supplier_name: editForm.supplier };

      const { error: updErr } = await supabase.from('purchases').update(updatePayload).eq('id', editModal.record.id);
      if (updErr) throw updErr;

      setSuccessMsg('Purchase updated successfully.');
      setEditModal({ open: false, record: null, mode: 'restock' });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      fetchHistory();
    } catch (err: any) { 
      setError(`Update Error: ${err.message}`); 
      setEditModal({ open: false, record: null, mode: 'restock' });
    }
    finally { setLoadingState('idle'); }
  };

  const handleDeletePurchase = async () => {
    if (!deleteModal.record) return;
    setLoadingState('saving');
    try {
      const { error: delErr } = await supabase.from('purchases').delete().eq('id', deleteModal.record.id);
      if (delErr) throw delErr;

      setSuccessMsg('Record removed successfully.');
      setDeleteModal({ open: false, record: null });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      fetchHistory();
    } catch (err: any) { 
      setError(`Delete Error: ${err.message}`);
      setDeleteModal({ open: false, record: null });
    }
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

      {/* MODE TOGGLE */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-1.5 w-fit shadow-sm">
        <button type="button" onClick={() => handleModeChange('restock')}
          className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
            mode === 'restock' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700'
          }`}>📦 Inventory Restock</button>
        <button type="button" onClick={() => handleModeChange('expense')}
          className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
            mode === 'expense' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700'
          }`}>💸 General Expense</button>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="mill-card p-8 space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Package size={16}/> {mode === 'restock' ? 'Product' : 'Expense Details'}</h3>
            {mode === 'restock' ? (
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Product</label>
                <select required value={formData.product_id} onChange={e => setFormData({...formData, product_id: e.target.value})}
                  className="mill-input w-full font-bold bg-white">
                  <option value="">Select product...</option>
                  {allProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.product_code})</option>)}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Expense Description</label>
                  <input type="text" required placeholder="e.g. Monthly salary for staff" value={formData.expenseDesc}
                    onChange={e => setFormData({...formData, expenseDesc: e.target.value})} className="mill-input w-full" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Category</label>
                  <select value={formData.expenseCategory} onChange={e => setFormData({...formData, expenseCategory: e.target.value})} className="mill-input w-full font-bold bg-white">
                    <option value="">Select category...</option>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="mill-card p-8 space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><DollarSign size={16}/> Financials</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Quantity (KG/Units)</label>
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
            className={`mill-btn-primary w-full py-5 text-lg shadow-lg flex items-center justify-center gap-3 uppercase tracking-widest ${
              mode === 'expense' ? 'bg-amber-500 hover:bg-amber-600' : ''
            }`}>
            {loadingState === 'saving' ? 'PROCESSING...' : mode === 'restock' ? '📦 RECORD RESTOCK' : '💸 RECORD EXPENSE'}
          </button>
        </div>
      </form>

      {/* PURCHASES HISTORY TABLE */}
      <div className="mill-card p-0 overflow-hidden bg-white border-slate-200 shadow-2xl">
        <div className="p-6 md:p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-white rounded-lg md:rounded-xl shadow-sm flex items-center justify-center text-slate-900 border border-slate-100">
              <History size={16} />
            </div>
            <div>
              <h3 className="text-sm md:text-lg font-semibold text-slate-900 uppercase tracking-tight">Purchase History</h3>
              <p className="hidden md:block text-[9px] font-medium text-slate-400 uppercase tracking-widest">Audit · Last 50 Records</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <div className="flex items-center gap-1 bg-white border border-slate-100 p-1 rounded-md shadow-sm">
                <input 
                  type="date" 
                  value={dateRange.start} 
                  onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="text-[8px] font-semibold uppercase text-slate-500 outline-none bg-transparent w-[85px]"
                />
                <span className="text-slate-300 text-[8px]">/</span>
                <input 
                  type="date" 
                  value={dateRange.end} 
                  onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="text-[8px] font-semibold uppercase text-slate-500 outline-none bg-transparent w-[85px]"
                />
                <button onClick={fetchHistory} className="p-1 hover:bg-slate-50 rounded text-slate-400 hover:text-slate-900 transition-all">
                  <RotateCcw size={11} className={loadingState === 'fetching' ? 'animate-spin' : ''} />
                </button>
             </div>
          </div>
        </div>

        <div className="overflow-auto max-h-[500px] border-t border-slate-100 p-3">
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {history.length === 0 && loadingState !== 'fetching' && (
                <tr>
                  <td colSpan={7} className="p-20 text-center text-slate-300 font-semibold uppercase tracking-widest italic text-xs">No records found</td>
                </tr>
              )}
              {history.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group text-xs text-slate-650">
                  <td className="px-3 py-1.5">
                    <p className="font-medium text-slate-800">{new Date(p.created_at).toLocaleDateString()}</p>
                    <p className="text-[9px] text-slate-400 uppercase flex items-center gap-1 mt-0.5"><History size={10} className="opacity-40" /> {new Date(p.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {p.product_id 
                        ? <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 text-[8px] font-semibold uppercase">Stock</span>
                        : <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 text-[8px] font-semibold uppercase">Expense</span>
                      }
                      <span className="font-semibold text-slate-700 uppercase">
                        {p.product_id ? getProductName(p.product_id) : (p.old_item_name || p.category || '-')}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 font-medium text-slate-700 uppercase truncate max-w-[120px]">{p.supplier_name || '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-slate-800">{p.quantity}</td>
                  <td className="px-3 py-1.5 font-mono text-slate-600">{p.unit_price?.toLocaleString()}</td>
                  <td className="px-3 py-1.5 font-mono font-medium text-slate-900">KES {p.total_amount?.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEditModal(p)} className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-100 rounded-md transition-all"><Pencil size={11}/></button>
                      <button onClick={() => setDeleteModal({ open: true, record: p })} className="p-1 bg-red-50 hover:bg-red-100 text-red-655 border border-red-100/50 rounded-md transition-all"><Trash2 size={11}/></button>
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
              <button onClick={() => setEditModal({ open: false, record: null, mode: 'restock' })} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20}/></button>
            </div>
            <form onSubmit={handleEditPurchase} className="p-8 space-y-6">
              {/* Mode toggle inside edit modal */}
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => {
                    setEditModal(prev => ({...prev, mode: 'restock'}));
                    // Clear expense fields; keep product_id as-is
                    setEditForm(prev => ({...prev, expenseDesc: '', expenseCategory: ''}));
                  }}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${editModal.mode === 'restock' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}
                >📦 Restock</button>
                <button type="button"
                  onClick={() => {
                    setEditModal(prev => ({...prev, mode: 'expense'}));
                    // *** CRITICAL: null out product_id to prevent FK constraint violations ***
                    setEditForm(prev => ({...prev, product_id: ''}));
                  }}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${editModal.mode === 'expense' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-400 border-slate-200'}`}
                >💸 Expense</button>
              </div>
              {editModal.mode === 'restock' ? (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Product</label>
                  <select value={editForm.product_id} onChange={e => setEditForm({...editForm, product_id: e.target.value})} className="mill-input w-full font-bold bg-white text-slate-900">
                    <option value="">Select product...</option>
                    {allProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.product_code})</option>)}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Expense Description</label>
                    <input type="text" value={editForm.expenseDesc} onChange={e => setEditForm({...editForm, expenseDesc: e.target.value})} className="mill-input w-full font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Category</label>
                    <select value={editForm.expenseCategory} onChange={e => setEditForm({...editForm, expenseCategory: e.target.value})} className="mill-input w-full font-bold bg-white">
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Quantity (KG/Units)</label>
                  <input type="number" step="0.01" value={editForm.qty || ''} onChange={e => setEditForm({...editForm, qty: parseFloat(e.target.value) || 0})} className="mill-input w-full font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Unit Price</label>
                  <input type="number" step="0.01" value={editForm.price || ''} onChange={e => setEditForm({...editForm, price: parseFloat(e.target.value) || 0})} className="mill-input w-full font-bold" />
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
                This action will permanently remove the record for{' '}
                <span className="font-black text-white">
                  {deleteModal.record ? getRecordLabel(deleteModal.record) : '—'}
                </span>.
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

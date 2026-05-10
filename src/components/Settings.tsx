import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Tag, Database, Shield, RefreshCcw, Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Product {
  id: string;
  name: string;
  product_code: string;
  milling_fee: number;
  selling_price: number;
  current_stock: number;
  category: string;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [editedProducts, setEditedProducts] = useState<Product[]>([]);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // 1. Database Binding (Fetch Actual Values)
  const { data: dbProducts, isLoading, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      return data as Product[];
    }
  });

  // Sync local state when DB data arrives
  useEffect(() => {
    if (dbProducts) {
      setEditedProducts(JSON.parse(JSON.stringify(dbProducts)));
    }
  }, [dbProducts]);

  // 3. Supabase Mutation
  const saveMutation = useMutation({
    mutationFn: async (updatedList: Product[]) => {
      // For efficiency, we only update products that actually changed
      const changes = updatedList.filter(p => {
        const original = dbProducts?.find(orig => orig.id === p.id);
        return original?.milling_fee !== p.milling_fee || original?.selling_price !== p.selling_price;
      });

      if (changes.length === 0) return;

      const updatePromises = changes.map(p => 
        supabase.from('products').update({
          milling_fee: p.milling_fee,
          selling_price: p.selling_price
        }).eq('id', p.id)
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error).map(r => r.error?.message);
      if (errors.length > 0) throw new Error(errors.join(', '));
    },
    onSuccess: () => {
      // 4. Global Cache Invalidation
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSuccess('Global Price Ledger Updated!');
      setTimeout(() => setSuccess(''), 4000);
    },
    onError: (err: any) => {
      setError(`Update Failed: ${err.message}`);
      setTimeout(() => setError(''), 5000);
    }
  });

  const handleInputChange = (id: string, field: 'milling_fee' | 'selling_price', value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditedProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: numValue } : p));
  };

  const hasChanges = JSON.stringify(dbProducts) !== JSON.stringify(editedProducts);

  if (isLoading) return <div className="p-20 text-center font-black text-slate-400 uppercase tracking-widest animate-pulse">Synchronizing Pricing Ledger...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-32">
      {/* Notifications */}
      {error && <div className="bg-red-600 text-white p-4 rounded-xl font-black flex items-center gap-3 shadow-lg mb-6 sticky top-4 z-50">{error}</div>}
      {success && <div className="bg-emerald-500 text-white p-4 rounded-xl font-black flex items-center gap-3 shadow-lg mb-6 sticky top-4 z-50">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* PRICE CONFIGURATION CARD */}
        <div className="lg:col-span-2 space-y-6">
          <div className="mill-card p-0 overflow-hidden bg-white border-slate-200 shadow-2xl relative">
            <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                  <Tag size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Price Configuration</h2>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Rate Management</p>
                </div>
              </div>
              <button onClick={() => refetch()} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
                <RefreshCcw size={16} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="overflow-x-auto pb-24">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b">Product Name</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b">Milling Fee (KES)</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b">Retail Price (KES)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {editedProducts.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-4 font-black text-slate-900 uppercase text-xs">
                        {p.name}
                        <p className="text-[9px] text-slate-400 font-bold tracking-widest">{p.product_code}</p>
                      </td>
                      <td className="px-8 py-4">
                        <div className="relative max-w-[120px]">
                          <input 
                            type="number" 
                            value={p.milling_fee} 
                            onChange={(e) => handleInputChange(p.id, 'milling_fee', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all"
                          />
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <div className="relative max-w-[120px]">
                          <input 
                            type="number" 
                            value={p.selling_price} 
                            onChange={(e) => handleInputChange(p.id, 'selling_price', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 2. The Save Mechanism (Sticky Button) */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-md border-t border-slate-100 flex justify-end items-center z-10">
               <button 
                onClick={() => saveMutation.mutate(editedProducts)}
                disabled={!hasChanges || saveMutation.isPending}
                className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all ${
                  hasChanges 
                  ? 'bg-slate-900 text-white shadow-xl hover:scale-105 active:scale-95' 
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
               >
                 <Save size={16} />
                 {saveMutation.isPending ? 'Syncing...' : 'Save Price Changes'}
               </button>
            </div>
          </div>
        </div>

        {/* SYSTEM INFO & SECURITY */}
        <div className="space-y-8">
          <div className="mill-card p-6 bg-slate-900 text-white border-none shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
                <Database size={20} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tighter">System Info</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Master Terminal Sync</p>
              </div>
            </div>
            
            <div className="space-y-4 font-mono text-[11px]">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">VERSION</span>
                <span className="text-white font-black">v2.4.0-PRO</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">DB STATUS</span>
                <span className="text-emerald-400 font-black">CONNECTED</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-500">LOCATION</span>
                <span className="text-white font-black">MAINA MILL - T1</span>
              </div>
            </div>
          </div>

          <div className="mill-card p-6 bg-white border-slate-200 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                <Shield size={20} className="text-slate-900" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tighter text-slate-900">Security</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Access & Policies</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-black text-slate-700 uppercase">Audit Logging</span>
                <div className="w-10 h-5 bg-emerald-500 rounded-full relative">
                  <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-black text-slate-700 uppercase">Auth Required</span>
                <div className="w-10 h-5 bg-emerald-500 rounded-full relative">
                  <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => queryClient.invalidateQueries()}
              className="w-full mt-6 py-4 bg-slate-100 text-slate-500 text-[10px] font-black uppercase rounded-xl hover:bg-slate-200 transition-all"
            >
              Force Cache Refresh
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

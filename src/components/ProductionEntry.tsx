import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { withRetry } from '../lib/network';
import { Scale, AlertTriangle, CheckCircle, Save, Activity, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const PRODUCT_CODES = {
  INPUT: '101',
  MAIN_OUTPUTS: ['102', '103', '104', '105'],
  BY_PRODUCTS: ['106', '107'],
  KUKU_FEED: '108'
};

interface Product { id: string; product_code: string; name: string; current_stock: number; minimum_level?: number; }
interface MillingSession { id: string; start_meter: number; session_type: string; }
interface ProductionLog {
  id: string;
  created_at: string;
  input_kg: number;
  main_output_kg: number;
  byproduct_kg: number;
  waste_kg: number;
  output_product_id: string;
  products?: { name: string; product_code: string };
}
type LoadingState = 'idle' | 'fetching' | 'saving';

export default function ProductionEntry() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [activeSession, setActiveSession] = useState<MillingSession | null>(null);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('fetching');
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [inputKg, setInputKg] = useState('');
  const [mainProductId, setMainProductId] = useState('');
  const [mainOutputKg, setMainOutputKg] = useState('');
  const [byProductId, setByProductId] = useState('');
  const [byProductKg, setByProductKg] = useState('');
  const [manualWasteKg, setManualWasteKg] = useState('0');

  const initData = async () => {
    setLoadingState('fetching');
    try {
      const { data: prods } = await withRetry('Fetch Products', async () => await supabase.from('products').select('id, product_code, name, current_stock, minimum_level'));
      setAllProducts((prods as Product[]) ?? []);

      const { data: sess } = await withRetry('Fetch Active Session', async () => 
        await supabase.from('milling_sessions').select('*').eq('is_closed', false).order('created_at', { ascending: false }).limit(1).maybeSingle()
      );
      setActiveSession(sess as unknown as MillingSession);

      // Fetch Month's Logs
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: logData } = await withRetry('Fetch Logs', async () => 
        await supabase.from('production_logs')
          .select(`
            id, created_at, input_kg, main_output_kg, byproduct_kg, waste_kg, output_product_id,
            products:output_product_id (name, product_code)
          `)
          .gte('created_at', startOfMonth.toISOString())
          .order('created_at', { ascending: false })
          .limit(50)
      );
      const formattedLogs = (logData as any[])?.map(log => ({
        ...log,
        products: Array.isArray(log.products) ? log.products[0] : log.products
      }));
      setLogs(formattedLogs || []);
    } catch (err: any) { setError(`Sync Error: ${err.message}`); }
    finally { setLoadingState('idle'); }
  };

  useEffect(() => { initData(); }, [successMsg]);

  const inputProduct = useMemo(() => allProducts.find(p => p.product_code === PRODUCT_CODES.INPUT), [allProducts]);
  const mainOutputProducts = useMemo(() => allProducts.filter(p => PRODUCT_CODES.MAIN_OUTPUTS.includes(p.product_code) || p.name.toLowerCase().includes('maize retail') || p.name.toLowerCase().includes('retail')), [allProducts]);
  const byProductOptions = useMemo(() => allProducts.filter(p => PRODUCT_CODES.BY_PRODUCTS.includes(p.product_code)), [allProducts]);

  const inputVal = parseFloat(inputKg) || 0;
  const mainVal = parseFloat(mainOutputKg) || 0;
  const byVal = parseFloat(byProductKg) || 0;
  const wasteVal = parseFloat(manualWasteKg) || 0;
  const kukuFeedVal = Math.max(0, inputVal - mainVal - byVal - wasteVal);
  
  const hasEnoughStock = inputProduct && inputVal <= inputProduct.current_stock;
  const isInputValid = inputVal > 0 && mainVal > 0 && (mainVal + byVal + wasteVal) <= inputVal && hasEnoughStock;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccessMsg('');
    if (!activeSession) { setError('NO ACTIVE SESSION: Open a session in "Session Control" first.'); return; }
    if (!inputProduct) { setError('SYSTEM ERROR: Maize Bulk (101) not found in registry.'); return; }
    if (!mainProductId) { setError('Please select an Output Product (e.g., Grade 1).'); return; }
    
    if (inputVal <= 0) { setError('Input weight must be greater than 0.'); return; }
    if (inputVal > inputProduct.current_stock) {
      setError(`INSUFFICIENT STOCK: Only ${inputProduct.current_stock} KG of Maize Bulk available. Please restock in "Purchases" first.`);
      return;
    }
    if (!isInputValid) { setError('Check weights: Total output cannot exceed input.'); return; }

    setIsSyncing(true);
    setLoadingState('saving');
    try {
      // Optimistic UI Update
      const optimisticLog: ProductionLog = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        input_kg: inputVal,
        main_output_kg: mainVal,
        byproduct_kg: byVal || 0,
        waste_kg: kukuFeedVal,
        output_product_id: mainProductId,
        products: { 
          name: allProducts.find(p => p.id === mainProductId)?.name || '', 
          product_code: allProducts.find(p => p.id === mainProductId)?.product_code || '' 
        }
      };
      setLogs(prev => [optimisticLog, ...prev.slice(0, 49)]);

      const { error: logErr } = await withRetry('Insert Log', async () =>
        await supabase.from('production_logs').insert([{
          session_id: activeSession.id,
          input_product_id: inputProduct.id,
          input_kg: inputVal,
          output_product_id: mainProductId,
          main_output_kg: mainVal,
          byproduct_id: byProductId || null,
          byproduct_kg: byVal || 0,
          waste_kg: kukuFeedVal 
        }])
      );

      if (logErr) throw logErr;

      setSuccessMsg(`Yield recorded successfully!`);
      setInputKg(''); setMainOutputKg(''); setByProductKg(''); setByProductId(''); setManualWasteKg('0');
    } catch (err: any) { setError(`DATABASE ERROR: ${err.message}`); }
    finally { setIsSyncing(false); setLoadingState('idle'); }
  };

  if (loadingState === 'fetching' && logs.length === 0) return <div className="p-20 text-center font-black text-slate-300 uppercase tracking-widest">Synchronizing...</div>;

  return (
    <div className="space-y-10">
      {error && <div className="bg-red-600 text-white p-4 rounded-xl font-black flex items-center gap-3 shadow-lg mb-6"><AlertTriangle size={20}/>{error}</div>}
      {successMsg && <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-900 p-4 rounded-xl font-bold flex items-center gap-3 mb-6"><CheckCircle size={20}/>{successMsg}</div>}

      {error && <div className="bg-red-600 text-white p-4 rounded-xl font-black flex items-center gap-3 shadow-lg"><AlertTriangle size={20}/>{error}</div>}
      {successMsg && <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-900 p-4 rounded-xl font-bold flex items-center gap-3"><CheckCircle size={20}/>{successMsg}</div>}

      {!activeSession ? (
        <div className="mill-card p-16 text-center max-w-lg mx-auto border-dashed">
          <Activity size={64} className="mx-auto mb-8 text-slate-200" />
          <h2 className="text-2xl font-black text-mill-text uppercase mb-3">Mill is Idle</h2>
          <p className="text-sm text-slate-500 mb-10 leading-relaxed uppercase font-bold tracking-tight">Initialize an **Internal Production** session to enable logging.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
          <div className="lg:col-span-3">
            {/* Entry Form */}
            <div className="mill-card p-10 bg-white border-slate-100 shadow-xl shadow-slate-100/50">
              <form onSubmit={handleSave} className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <div>
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Phase 1: Raw Input (Bulk)</label>
                      <div className="relative group">
                        <input type="number" step="0.01" required value={inputKg} onChange={e => setInputKg(e.target.value)} placeholder="0.00" className="mill-input w-full text-4xl font-black pr-20 py-6 border-slate-200 focus:border-mill-primary" />
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-300 uppercase text-lg group-focus-within:text-mill-primary transition-colors">KG</span>
                      </div>
                      <div className="mt-3 flex justify-between px-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Available Bulk</span>
                        <span className={`text-[10px] font-black ${!hasEnoughStock && inputVal > 0 ? 'text-red-600 animate-pulse' : 'text-mill-text'}`}>{inputProduct?.current_stock.toLocaleString()} KG</span>
                      </div>
                      {!hasEnoughStock && inputVal > 0 && (
                        <p className="mt-2 text-[10px] font-black text-red-600 uppercase flex items-center gap-1">
                          <AlertTriangle size={12} /> INSUFFICIENT STOCK FOR PROCESSING
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Phase 2: Main Flour Output</label>
                      <select required value={mainProductId} onChange={e => setMainProductId(e.target.value)} className="mill-input w-full font-black mb-4 py-4 text-sm uppercase tracking-tight">
                        <option value="">Select Flour Grade...</option>
                        {mainOutputProducts.map(p => <option key={p.id} value={p.id}>{p.product_code} · {p.name}</option>)}
                      </select>
                      <div className="relative group">
                        <input type="number" step="0.01" required value={mainOutputKg} onChange={e => setMainOutputKg(e.target.value)} placeholder="0.00" className="mill-input w-full text-4xl font-black pr-20 py-6" />
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-300 uppercase text-lg">KG</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div>
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Phase 3: By-Products & Yield</label>
                      <select value={byProductId} onChange={e => setByProductId(e.target.value)} className="mill-input w-full font-black mb-4 py-4 text-sm uppercase tracking-tight bg-slate-50">
                        <option value="">None (Optional By-Product)</option>
                        {byProductOptions.map(p => <option key={p.id} value={p.id}>{p.product_code} · {p.name}</option>)}
                      </select>
                      <div className="relative">
                        <input type="number" step="0.01" value={byProductKg} onChange={e => setByProductKg(e.target.value)} placeholder="0.00" disabled={!byProductId} className="mill-input w-full text-4xl font-black pr-20 py-6 disabled:bg-slate-50 disabled:text-slate-300" />
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-300 uppercase text-lg">KG</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="mill-card p-6 bg-emerald-50 border-emerald-200 flex flex-col justify-center">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Kuku Feed (108)</p>
                        <p className="text-3xl font-black text-emerald-900">{kukuFeedVal.toFixed(2)} <span className="text-sm">KG</span></p>
                        <p className="text-[8px] font-bold text-emerald-600 uppercase mt-1">Ready for sale</p>
                      </div>
                      <div className="mill-card p-6 bg-slate-50 border-slate-200 flex flex-col justify-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">4. Processing Loss (Dust/Waste)</p>
                        <input type="number" step="0.01" value={manualWasteKg} onChange={e => setManualWasteKg(e.target.value)} placeholder="0.01" className="mill-input w-full text-2xl" />
                        <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase">Defaults to 0.01kg per batch</p>
                      </div>
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={!isInputValid || isSyncing} className="mill-btn-primary w-full py-8 text-xl font-black flex items-center justify-center gap-4 shadow-2xl shadow-mill-primary/20 hover:-translate-y-1 active:translate-y-0 disabled:translate-y-0 disabled:bg-slate-200 disabled:shadow-none">
                  <Save size={24} />
                  {isSyncing ? 'SYNCING...' : 'CONFIRM & SYNC PRODUCTION'}
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-8">
            <div className="mill-card p-6 bg-white border-slate-100 shadow-lg">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Scale size={16} className="text-mill-primary" /> Stock Monitor
              </h3>
              <div className="space-y-4">
                {allProducts.slice(0, 10).map(p => {
                  const isLow = p.minimum_level && p.current_stock < p.minimum_level;
                  return (
                    <div key={p.id} className="flex flex-col gap-1 border-b border-slate-50 pb-3 last:border-0">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-mill-text uppercase">{p.name}</span>
                        <span className={`text-[10px] font-black ${isLow ? 'text-red-600' : 'text-slate-400'}`}>{p.product_code}</span>
                      </div>
                      <div className="flex items-end justify-between">
                        <span className="text-lg font-black text-mill-text">{p.current_stock.toLocaleString()} <span className="text-[10px] text-slate-300">KG</span></span>
                        <div className={`w-1.5 h-1.5 rounded-full ${isLow ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monthly History Table */}
      <div className="mill-card p-0 overflow-hidden bg-white border-slate-100 shadow-xl">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
              <Calendar size={20} className="text-mill-primary" />
            </div>
            <div>
              <h3 className="text-lg font-black text-mill-text uppercase tracking-tight">Monthly Ledger</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Yield History · Current Month</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="px-4 py-2 bg-white rounded-lg border border-slate-200 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Monthly Total</p>
              <p className="text-sm font-black text-mill-text">
                {logs.reduce((acc, l) => acc + (l.main_output_kg || 0), 0).toLocaleString()} KG
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50">
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Date/Time</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Input (101)</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Main Output</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">By-Prod (Manual)</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Kuku Feed (108)</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <p className="text-[11px] font-black text-mill-text">{new Date(log.created_at).toLocaleDateString()}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(log.created_at).toLocaleTimeString()}</p>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <ArrowDownRight size={14} className="text-red-400" />
                      <span className="text-sm font-black text-mill-text">{log.input_kg.toLocaleString()} <span className="text-[10px] text-slate-300">KG</span></span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <ArrowUpRight size={14} className="text-emerald-400" />
                      <div>
                        <p className="text-sm font-black text-mill-text">{log.main_output_kg.toLocaleString()} <span className="text-[10px] text-slate-300">KG</span></p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{log.products?.product_code} · {log.products?.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">
                      {log.byproduct_kg > 0 ? `${log.byproduct_kg.toLocaleString()} KG` : '--'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className="inline-block px-3 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest">
                      {log.waste_kg.toLocaleString()} KG
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Synced</span>
                    </div>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest italic">No production recorded this month</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

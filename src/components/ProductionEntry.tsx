import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { checkPreviousStockTake } from '../lib/auditUtils';
import { Scale, AlertTriangle, CheckCircle, Save, Activity, Calendar, ArrowUpRight, ArrowDownRight, Lock, RotateCcw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataMutation } from '../hooks/useDataMutation';
import { useActiveSession } from '../hooks/useActiveSession';
import ActiveSessionOverlay from './ActiveSessionOverlay';

const PRODUCT_CODES = {
  INPUT: '101',
  MAIN_OUTPUTS: ['102', '103', '104', '105'],
  BY_PRODUCTS: ['106', '107'],
  KUKU_FEED: '108'
};

interface Product { id: string; product_code: string; name: string; current_stock: number; minimum_level?: number; category?: string; }

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


export default function ProductionEntry() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [auditBlock, setAuditBlock] = useState(false);

  // Form State
  const [inputKg, setInputKg] = useState('');
  const [mainProductId, setMainProductId] = useState('');
  const [mainOutputKg, setMainOutputKg] = useState('');
  const [byProductId, setByProductId] = useState('');
  const [byProductKg, setByProductKg] = useState('');
  const [manualWasteKg, setManualWasteKg] = useState('0');
  const [backdate, setBackdate] = useState(new Date().toISOString().split('T')[0]);

  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, product_code, name, category, current_stock, minimum_level').order('product_code', { ascending: true });
      if (error) throw error;
      return data as Product[];
    }
  });

  const { data: activeSession } = useActiveSession();

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['production-logs'],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase.from('production_logs')
        .select(`
          id, created_at, input_kg, main_output_kg, byproduct_kg, waste_kg, output_product_id,
          products:output_product_id (name, product_code)
        `)
        .gte('created_at', startOfMonth.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return (data as any[])?.map(log => ({
        ...log,
        products: Array.isArray(log.products) ? log.products[0] : log.products
      })) as ProductionLog[];
    }
  });

  const productionMutation = useDataMutation({
    type: 'production_log',
    queryKey: ['production-logs'],
    mutationFn: async (payload) => {
      // STRICT INSERT ONLY. Zero stock math. Let the DB trigger handle it.
      const { data, error } = await supabase.from('production_logs').insert([payload]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      if (res.offline) {
        setSuccessMsg('Connection lost. Data saved locally and will sync when online.');
      } else {
        setSuccessMsg('Yield recorded successfully!');
      }
      
      setInputKg(''); setMainOutputKg(''); setByProductKg(''); setByProductId(''); setManualWasteKg('0');
      
      // Invalidate queries so React pulls the newly triggered stock calculations straight from the DB
      queryClient.invalidateQueries({ queryKey: ['production-logs'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['active-session'] });
      queryClient.invalidateQueries({ queryKey: ['last-end-meter'] });
    },
    onError: (err: any) => {
      if (err.code === '42501' || err.code === 'PGRST116') {
        setError('Access Restricted: You do not have permission to record production logs.');
      } else {
        setError(err.message || 'Production recording failed.');
      }
    }
  });

  useEffect(() => {
    const runAuditCheck = async () => {
      await checkPreviousStockTake();
      // Temporarily disabled to allow backdating
      setAuditBlock(false); 
    };
    runAuditCheck();
  }, []);

  const inputProduct = useMemo(() => allProducts.find(p => p.product_code === PRODUCT_CODES.INPUT), [allProducts]);
  const mainOutputProducts = useMemo(() => allProducts.filter(p => PRODUCT_CODES.MAIN_OUTPUTS.includes(p.product_code)), [allProducts]);
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
    if (!activeSession) { 
      setError('NO ACTIVE SESSION: Please open a session in "Session Control" first.'); 
      return; 
    }
    if (activeSession.is_closed) {
      setError('SESSION IS CLOSED: This session has already been finalized.');
      return;
    }
    const inputProduct = allProducts.find(p => p.product_code === PRODUCT_CODES.INPUT);
    if (!inputProduct) { setError('SYSTEM ERROR: Maize Bulk (101) not found in registry.'); return; }
    if (!mainProductId) { setError('Please select an Output Product (e.g., Grade 1).'); return; }
    
    if (inputVal <= 0) { setError('Input weight must be greater than 0.'); return; }
    if (inputVal > inputProduct.current_stock) {
      setError(`INSUFFICIENT STOCK: Only ${inputProduct.current_stock} KG of Maize Bulk available. Please restock in "Purchases" first.`);
      return;
    }
    if (!isInputValid) { setError('Check weights: Total output cannot exceed input.'); return; }

    const dateObj = new Date(backdate);
    dateObj.setHours(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds());

    const payload = {
      session_id: activeSession.id,
      input_product_id: inputProduct.id || null,
      input_kg: Number(inputKg) || 0,
      output_product_id: mainProductId === "" ? null : mainProductId,
      main_output_kg: Number(mainOutputKg) || 0,
      byproduct_id: byProductId === "" ? null : byProductId,
      byproduct_kg: byProductKg === "" ? 0 : Number(byProductKg),
      waste_kg: Number(kukuFeedVal) || 0,
      created_at: dateObj.toISOString()
    };

    if (!payload.input_product_id) {
      setError('FRONTEND LEAK PREVENTED: Missing valid input_product_id UUID.');
      return;
    }
    if (!payload.output_product_id) {
      setError('FRONTEND LEAK PREVENTED: Missing valid output_product_id UUID.');
      return;
    }

    // Check for silent "undefined" strings
    for (const [key, value] of Object.entries(payload)) {
      if (value === "undefined" || String(value) === "undefined") {
        setError(`FRONTEND LEAK PREVENTED: Field [${key}] evaluated to string "undefined".`);
        return;
      }
    }
    
    console.log('SANITIZED PRODUCTION LOG PAYLOAD:', payload);
    productionMutation.mutate(payload);
  };

  if (auditBlock) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 max-w-2xl mx-auto text-center px-4 md:px-6">
        <div className="w-20 h-20 md:w-24 md:h-24 bg-orange-50 rounded-2xl md:rounded-[2rem] flex items-center justify-center shadow-xl shadow-orange-100">
           <Lock size={40} className="text-orange-500" />
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl md:text-4xl font-semibold text-slate-900 uppercase tracking-tight">Stock Take Required</h2>
          <p className="text-sm font-medium text-slate-500 uppercase leading-relaxed">
            Production is restricted. Our records indicate that the **Previous Day's Stock Take** has not been completed. 
            Please perform a stock take to reconcile inventory before starting today's production.
          </p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => window.location.reload()} 
            className="w-full md:w-auto px-8 py-4 bg-slate-900 text-white rounded-xl font-semibold uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-transform"
          >
            Refresh Status
          </button>
        </div>
      </div>
    );
  }

  if (loadingLogs && logs.length === 0) return <div className="p-20 text-center font-semibold text-slate-300 uppercase tracking-widest animate-pulse">Synchronizing...</div>;

  return (
    <div className="space-y-6 md:space-y-10 pb-32 px-4 md:px-0">
      {error && <div className="bg-red-600 text-white p-4 rounded-xl font-semibold flex items-center gap-3 shadow-lg mb-6"><AlertTriangle size={20}/>{error}</div>}
      {successMsg && <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-900 p-4 rounded-xl font-semibold flex items-center gap-3 mb-6"><CheckCircle size={20}/>{successMsg}</div>}
      
      {/* ACTIVE SESSION SMART HEADER */}
      <ActiveSessionOverlay activeSession={activeSession} />

      {!activeSession ? (
        <div className="mill-card p-8 md:p-16 text-center max-w-lg mx-auto border-dashed rounded-2xl">
          <Activity className="mx-auto mb-6 md:mb-8 text-slate-200 w-12 h-12 md:w-16 md:h-16" />
          <h2 className="text-xl md:text-2xl font-semibold text-slate-900 uppercase mb-3">Mill is Idle</h2>
          <p className="text-sm text-slate-500 mb-8 md:mb-10 leading-relaxed uppercase font-medium tracking-tight">Initialize an **Internal Production** session to enable logging.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-10">
          <div className="lg:col-span-3">
            {/* Entry Form */}
            <div className="mill-card p-4 md:p-10 bg-white border-slate-100 shadow-xl shadow-slate-100/50 rounded-2xl">
              <div className="mb-6 md:mb-8 border-b border-slate-100 pb-4">
                <h3 className="text-lg md:text-xl font-bold text-slate-900 uppercase tracking-tight">Production Log</h3>
                <p className="text-[10px] md:text-xs font-semibold italic text-amber-600 mt-2 bg-amber-50 p-3 rounded-lg border border-amber-100/50 inline-block">
                  Note: To sell raw or unmilled products, please use the Sales/POS terminal. They cannot be logged as milled production.
                </p>
              </div>
              <form onSubmit={handleSave} className="space-y-8 md:space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                  <div className="space-y-6 md:space-y-8">
                    <div>
                      <div className="flex items-center justify-between mb-3 md:mb-4">
                        <label className="block text-[10px] md:text-[11px] font-semibold text-slate-400 uppercase tracking-widest max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Phase 1: Raw Input (Bulk)</label>
                        <input 
                          type="date" 
                          value={backdate}
                          onChange={e => setBackdate(e.target.value)}
                          className="text-[10px] max-md:text-[10px] font-semibold text-slate-900 bg-white border border-slate-200 px-3 py-1.5 max-md:px-2 max-md:py-1 rounded-lg outline-none cursor-pointer"
                        />
                      </div>
                      <div className="relative group">
                        <input type="number" step="0.01" required value={inputKg} onChange={e => setInputKg(e.target.value)} placeholder="0.00" className="mill-input w-full text-2xl md:text-4xl font-semibold pr-16 md:pr-20 py-4 md:py-6 border-slate-200 focus:border-blue-600 text-base md:text-4xl max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" />
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 font-semibold text-slate-300 uppercase text-lg group-focus-within:text-blue-600 transition-colors">KG</span>
                      </div>
                      <div className="mt-3 flex justify-between px-2">
                        <span className="text-[10px] font-medium text-slate-400 uppercase">Available Bulk</span>
                        <span className={`text-[10px] font-semibold ${!hasEnoughStock && inputVal > 0 ? 'text-red-600 animate-pulse' : 'text-slate-900'}`}>{inputProduct?.current_stock.toLocaleString()} KG</span>
                      </div>
                      {!hasEnoughStock && inputVal > 0 && (
                        <p className="mt-2 text-[10px] font-semibold text-red-600 uppercase flex items-center gap-1">
                          <AlertTriangle size={12} /> INSUFFICIENT STOCK
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] md:text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3 md:mb-4 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Phase 2: Main Flour Output</label>
                      <select required value={mainProductId} onChange={e => setMainProductId(e.target.value)} className="mill-input w-full font-semibold mb-4 py-3 md:py-4 text-base md:text-sm uppercase tracking-tight max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900">
                        <option value="">Select Grade...</option>
                        {mainOutputProducts.map(p => <option key={p.id} value={p.id}>{p.product_code} · {p.name}</option>)}
                      </select>
                      <div className="relative group">
                        <input type="number" step="0.01" required value={mainOutputKg} onChange={e => setMainOutputKg(e.target.value)} placeholder="0.00" className="mill-input w-full text-2xl md:text-4xl font-semibold pr-16 md:pr-20 py-4 md:py-6 text-base md:text-4xl max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" />
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 font-semibold text-slate-300 uppercase text-lg">KG</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 md:space-y-8">
                    <div>
                      <label className="block text-[10px] md:text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3 md:mb-4 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Phase 3: By-Products</label>
                      <select value={byProductId} onChange={e => setByProductId(e.target.value)} className="mill-input w-full font-semibold mb-4 py-3 md:py-4 text-base md:text-sm uppercase tracking-tight bg-slate-50 max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900">
                        <option value="">None (Optional)</option>
                        {byProductOptions.map(p => <option key={p.id} value={p.id}>{p.product_code} · {p.name}</option>)}
                      </select>
                      <div className="relative">
                        <input type="number" step="0.01" value={byProductKg} onChange={e => setByProductKg(e.target.value)} placeholder="0.00" disabled={!byProductId} className="mill-input w-full text-2xl md:text-4xl font-semibold pr-16 md:pr-20 py-4 md:py-6 disabled:bg-slate-50 disabled:text-slate-300 text-base md:text-4xl max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" />
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 font-semibold text-slate-300 uppercase text-lg">KG</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="mill-card p-4 md:p-6 bg-emerald-50 border-emerald-200 flex flex-col justify-center rounded-xl">
                        <p className="text-[9px] font-semibold text-emerald-600 uppercase tracking-widest mb-1">Kuku Feed</p>
                        <p className="text-xl md:text-3xl font-semibold text-emerald-900">{kukuFeedVal.toFixed(2)} <span className="text-xs">KG</span></p>
                      </div>
                      <div className="mill-card p-4 md:p-6 bg-slate-50 border-slate-200 flex flex-col justify-center rounded-xl">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Processing Loss</p>
                        <input type="number" step="0.01" value={manualWasteKg} onChange={e => setManualWasteKg(e.target.value)} placeholder="0.01" className="mill-input w-full text-lg md:text-2xl font-semibold text-center max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 md:pt-6">
                  <button 
                    type="submit" 
                    disabled={!isInputValid || productionMutation.isPending} 
                    className={`w-full py-4 md:py-6 rounded-2xl font-semibold uppercase text-sm tracking-widest flex items-center justify-center gap-4 shadow-xl transition-all active:scale-95 ${!isInputValid ? 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                  >
                    {productionMutation.isPending ? (
                      <><RotateCcw className="animate-spin" size={20} /> RECORDING...</>
                    ) : (
                      <><Save size={20} /> Record Daily Yield</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="space-y-6 md:space-y-8">
            <div className="mill-card p-4 md:p-6 bg-white border-slate-100 shadow-lg rounded-2xl">
              <h3 className="text-[10px] md:text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-4 md:mb-6 flex items-center gap-2">
                <Scale size={16} className="text-blue-600" /> Stock Monitor
              </h3>
              <div className="space-y-4">
                {allProducts.filter(p => (p.category || '').toLowerCase() !== 'service' && (p.category || '').toLowerCase() !== 'milling').map(p => {
                  const isLow = p.minimum_level && p.current_stock < p.minimum_level;
                  return (
                    <div key={p.id} className="flex flex-col gap-1 border-b border-slate-50 pb-3 last:border-0">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-semibold text-slate-900 uppercase">{p.name}</span>
                        <span className={`text-[10px] font-semibold ${isLow ? 'text-red-600' : 'text-slate-400'}`}>{p.product_code}</span>
                      </div>
                      <div className="flex items-end justify-between">
                        <span className="text-base md:text-lg font-semibold text-slate-900">{p.current_stock.toLocaleString()} <span className="text-[10px] text-slate-300">KG</span></span>
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
      <div className="mill-card p-0 overflow-hidden bg-white border-slate-100 shadow-xl rounded-2xl">
        <div className="p-4 md:p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
              <Calendar size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-semibold text-slate-900 uppercase tracking-tight">Monthly Ledger</h3>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Yield History</p>
            </div>
          </div>
          <div className="hidden md:flex gap-4">
            <div className="px-4 py-2 bg-white rounded-lg border border-slate-200 text-center">
              <p className="text-[9px] font-semibold text-slate-400 uppercase mb-0.5">Total</p>
              <p className="text-sm font-semibold text-slate-900">
                {logs.reduce((acc, l) => acc + (l.main_output_kg || 0), 0).toLocaleString()} KG
              </p>
            </div>
          </div>
        </div>        <div className="w-full overflow-x-auto overflow-y-auto max-h-[500px] scrollbar-thin p-3 max-md:p-2">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider max-md:text-[11px] max-md:font-medium max-md:tracking-tight bg-slate-50">
                <th className="px-2 py-1.5 md:px-3 md:py-2 max-md:font-medium">Date / Time</th>
                <th className="px-2 py-1.5 md:px-3 md:py-2 max-md:font-medium">Input</th>
                <th className="px-2 py-1.5 md:px-3 md:py-2 max-md:font-medium">Main Output</th>
                <th className="px-2 py-1.5 md:px-3 md:py-2 max-md:font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {logs.map((log, index) => (
                <tr key={log.id || index} className="hover:bg-slate-50/50 transition-colors group text-xs text-slate-650 max-md:text-[11px] max-md:font-normal">
                  <td className="px-2 py-1.5 md:px-3 md:py-1.5 max-md:text-[11px] whitespace-nowrap">
                    <p className="font-medium max-md:font-normal text-slate-800 max-md:text-[11px]">{new Date(log.created_at).toLocaleDateString()}</p>
                    <p className="text-[9px] max-md:text-[9px] text-slate-400 uppercase flex items-center gap-1 mt-0.5"><Scale size={10} className="opacity-40" /> {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </td>
                  <td className="px-2 py-1.5 md:px-3 md:py-1.5 font-mono text-slate-650 max-md:text-[11px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <ArrowDownRight size={12} className="text-rose-500 animate-pulse" />
                      <span>{log.input_kg.toLocaleString()} kg</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 md:px-3 md:py-1.5 font-mono max-md:text-[11px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <ArrowUpRight size={12} className="text-emerald-500" />
                      <div>
                        <span className="text-slate-800 font-medium max-md:font-normal max-md:text-[11px]">{log.main_output_kg.toLocaleString()} kg</span>
                        <p className="text-[9px] max-md:text-[9px] font-medium max-md:font-normal text-slate-400 uppercase tracking-tight font-sans mt-0.5">{log.products?.product_code} · {log.products?.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 md:px-3 md:py-1.5 max-md:text-[11px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[9px] max-md:text-[9px] font-medium max-md:font-normal text-slate-400 uppercase tracking-wider">Synced</span>
                    </div>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-450 font-medium uppercase tracking-wider text-xs italic max-md:text-[11px]">No production recorded</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

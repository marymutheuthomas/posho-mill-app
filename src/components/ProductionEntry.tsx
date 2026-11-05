import { useState, useMemo } from 'react';
import { usePagination } from '../hooks/usePagination';
import Pagination from './Pagination';
import { supabase } from '../lib/supabase';
import { Scale, AlertTriangle, CheckCircle, Save, Calendar, ArrowUpRight, ArrowDownRight, RotateCcw, Zap } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataMutation } from '../hooks/useDataMutation';
import { useMillingSession } from '../hooks/useMillingSession';
import ActiveSessionOverlay from './ActiveSessionOverlay';
import { FIELD, FIELD_NUM, FIELD_LABEL, SECTION_TITLE, btn } from '../lib/ui';

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

  const { activeSession, startSession } = useMillingSession();
  const [shiftError, setShiftError] = useState('');

  // Milling own stock is an Internal session; one tap from the banner, without leaving the hub
  const startDefaultShift = () => {
    setShiftError('');
    startSession.mutate('Internal', {
      onSuccess: ({ offline }) => setSuccessMsg(offline
        ? 'Internal shift started offline. It will sync when the connection returns.'
        : 'Internal shift started.'),
      onError: (err: Error) => setShiftError(err?.message || 'Could not start a shift.'),
    });
  };

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
      queryClient.invalidateQueries({ queryKey: ['milling-sessions'] });
    },
    onError: (err: any) => {
      if (err.code === '42501' || err.code === 'PGRST116') {
        setError('Access Restricted: You do not have permission to record production logs.');
      } else {
        setError(err.message || 'Production recording failed.');
      }
    }
  });


  const inputProduct = useMemo(() => allProducts.find(p => p.product_code === PRODUCT_CODES.INPUT), [allProducts]);
  const mainOutputProducts = useMemo(() => allProducts.filter(p => PRODUCT_CODES.MAIN_OUTPUTS.includes(p.product_code)), [allProducts]);
  const byProductOptions = useMemo(() => allProducts.filter(p => PRODUCT_CODES.BY_PRODUCTS.includes(p.product_code)), [allProducts]);

  // All weights rounded to 2dp so they match the numeric(10,2) columns and chk_production_mass_balance
  const round2 = (n: number) => Number(n.toFixed(2));
  const inputVal = round2(parseFloat(inputKg) || 0);
  const mainVal = round2(parseFloat(mainOutputKg) || 0);
  const byVal = round2(parseFloat(byProductKg) || 0);
  const wasteVal = round2(parseFloat(manualWasteKg) || 0);
  const kukuFeedVal = Math.max(0, round2(inputVal - mainVal - byVal - wasteVal));
  
  const hasEnoughStock = inputProduct && inputVal <= inputProduct.current_stock;
  const isInputValid = inputVal > 0 && mainVal > 0 && (mainVal + byVal + wasteVal) <= inputVal && hasEnoughStock;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccessMsg('');
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
      // No open shift never blocks logging: saved without one (recorded_by is still stamped)
      session_id: activeSession && !activeSession.is_closed ? activeSession.id : null,
      input_product_id: inputProduct.id || null,
      input_kg: inputVal,
      output_product_id: mainProductId === "" ? null : mainProductId,
      main_output_kg: mainVal,
      byproduct_id: byProductId === "" ? null : byProductId,
      byproduct_kg: byVal,
      // No separate column for kuku feed vs processing loss: waste_kg carries both so the row balances
      waste_kg: round2(kukuFeedVal + wasteVal),
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

  const { pageItems, pager } = usePagination(logs);

  if (loadingLogs && logs.length === 0) return <div className="p-20 text-center font-semibold text-slate-300 uppercase tracking-widest animate-pulse">Synchronizing...</div>;

  return (
    <div className="space-y-6 md:space-y-10 pb-32 px-4 md:px-0">
      {error && <div className="bg-red-600 text-white p-4 rounded-xl font-semibold flex items-center gap-3 shadow-lg mb-6"><AlertTriangle size={20}/>{error}</div>}
      {successMsg && <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-900 p-4 rounded-xl font-semibold flex items-center gap-3 mb-6"><CheckCircle size={20}/>{successMsg}</div>}
      
      {/* ACTIVE SESSION SMART HEADER */}
      <ActiveSessionOverlay />

      {!activeSession && (
        <div role="status" className="bg-amber-50 border border-amber-300 px-3 py-2 rounded-xl flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="flex-1 text-xs font-semibold text-amber-900 leading-snug">
            ⚠️ No active shift — Production is being recorded, but please open a shift to log power meter readings.
            {shiftError && <span className="block text-red-700 mt-1">{shiftError}</span>}
          </p>
          <button
            type="button"
            onClick={startDefaultShift}
            disabled={startSession.isPending}
            className={`${btn.primary} shrink-0`}
          >
            <Zap size={14} /> {startSession.isPending ? 'Starting…' : 'Start Default Shift'}
          </button>
        </div>
      )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-10">
          <div className="lg:col-span-3">
            {/* Entry Form */}
            <div className="mill-card p-4 md:p-10 bg-white border-slate-100 shadow-xl shadow-slate-100/50 rounded-2xl">
              <div className="mb-6 md:mb-8 border-b border-slate-100 pb-4">
                <h3 className={`${SECTION_TITLE} text-slate-900`}>Production Log</h3>
                <p className="text-[11px] md:text-xs font-semibold italic text-amber-600 mt-2 bg-amber-50 p-3 rounded-lg border border-amber-100/50 inline-block">
                  Note: To sell raw or unmilled products, please use the Sales/POS terminal. They cannot be logged as milled production.
                </p>
              </div>
              <form onSubmit={handleSave} className="space-y-8 md:space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                  <div className="space-y-6 md:space-y-8">
                    <div>
                      <div className="mb-4">
                        <label htmlFor="prod-date" className={FIELD_LABEL}>Production Date</label>
                        <input
                          id="prod-date"
                          type="date"
                          value={backdate}
                          onChange={e => setBackdate(e.target.value)}
                          className={`${FIELD} cursor-pointer`}
                        />
                      </div>
                      <label htmlFor="prod-input-kg" className={FIELD_LABEL}>Phase 1: Raw Input (Bulk)</label>
                      <div className="relative group">
                        <input id="prod-input-kg" type="number" step="0.01" required value={inputKg} onChange={e => setInputKg(e.target.value)} placeholder="0.00" className={`${FIELD_NUM} !pr-16`} />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono font-semibold text-slate-400 text-sm group-focus-within:text-emerald-600 transition-colors">KG</span>
                      </div>
                      <div className="mt-2 flex justify-between px-1">
                        <span className="text-xs font-medium text-slate-500 uppercase">Available Bulk</span>
                        <span className={`font-mono text-xs font-semibold ${!hasEnoughStock && inputVal > 0 ? 'text-red-600 animate-pulse' : 'text-slate-900'}`}>{inputProduct?.current_stock.toLocaleString()} KG</span>
                      </div>
                      {!hasEnoughStock && inputVal > 0 && (
                        <p className="mt-2 text-[11px] font-semibold text-red-600 uppercase flex items-center gap-1">
                          <AlertTriangle size={12} /> INSUFFICIENT STOCK
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="prod-main" className={FIELD_LABEL}>Phase 2: Main Flour Output</label>
                      <select id="prod-main" required value={mainProductId} onChange={e => setMainProductId(e.target.value)} className={`${FIELD} mb-3 uppercase`}>
                        <option value="">Select Grade...</option>
                        {mainOutputProducts.map(p => <option key={p.id} value={p.id}>{p.product_code} · {p.name}</option>)}
                      </select>
                      <div className="relative group">
                        <input aria-label="Main output weight (kg)" type="number" step="0.01" required value={mainOutputKg} onChange={e => setMainOutputKg(e.target.value)} placeholder="0.00" className={`${FIELD_NUM} !pr-16`} />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono font-semibold text-slate-400 text-sm">KG</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 md:space-y-8">
                    <div>
                      <label htmlFor="prod-by" className={FIELD_LABEL}>Phase 3: By-Products</label>
                      <select id="prod-by" value={byProductId} onChange={e => setByProductId(e.target.value)} className={`${FIELD} mb-3 uppercase bg-slate-50`}>
                        <option value="">None (Optional)</option>
                        {byProductOptions.map(p => <option key={p.id} value={p.id}>{p.product_code} · {p.name}</option>)}
                      </select>
                      <div className="relative">
                        <input aria-label="By-product weight (kg)" type="number" step="0.01" value={byProductKg} onChange={e => setByProductKg(e.target.value)} placeholder="0.00" disabled={!byProductId} className={`${FIELD_NUM} !pr-16 disabled:bg-slate-50 disabled:text-slate-300`} />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono font-semibold text-slate-400 text-sm">KG</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="mill-card p-4 bg-emerald-50 border-emerald-200 flex flex-col justify-center rounded-xl">
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">Kuku Feed</p>
                        <p className="h-12 flex items-center font-mono text-2xl font-semibold text-emerald-900">{kukuFeedVal.toFixed(2)} <span className="ml-1 text-sm text-emerald-700">KG</span></p>
                      </div>
                      <div className="mill-card p-4 bg-slate-50 border-slate-200 flex flex-col justify-center rounded-xl">
                        <label htmlFor="prod-loss" className={FIELD_LABEL}>Processing Loss (KG)</label>
                        <input id="prod-loss" type="number" step="0.01" value={manualWasteKg} onChange={e => setManualWasteKg(e.target.value)} placeholder="0.01" className={`${FIELD_NUM} text-center`} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 md:pt-6">
                  <button 
                    type="submit" 
                    disabled={!isInputValid || productionMutation.isPending} 
                    className={`${btn.primary} w-full shadow-xl`}
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
              <h3 className={`${SECTION_TITLE} text-slate-900 mb-4 flex items-center gap-2`}>
                <Scale size={16} className="text-brand" /> Stock Monitor
              </h3>
              <div className="space-y-4">
                {allProducts.filter(p => (p.category || '').toLowerCase() !== 'service' && (p.category || '').toLowerCase() !== 'milling').map(p => {
                  const isLow = p.minimum_level && p.current_stock < p.minimum_level;
                  return (
                    <div key={p.id} className="flex flex-col gap-1 border-b border-slate-50 pb-3 last:border-0">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-semibold text-slate-900 uppercase">{p.name}</span>
                        <span className={`text-[11px] font-semibold ${isLow ? 'text-red-600' : 'text-slate-400'}`}>{p.product_code}</span>
                      </div>
                      <div className="flex items-end justify-between">
                        <span className="font-mono text-base md:text-lg font-semibold text-slate-900">{p.current_stock.toLocaleString()} <span className="text-[11px] text-slate-400">KG</span></span>
                        <div className={`w-1.5 h-1.5 rounded-full ${isLow ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      {/* Monthly History Table */}
      <div className="mill-card p-0 overflow-hidden bg-white border-slate-100 shadow-xl rounded-2xl">
        <div className="p-4 md:p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
              <Calendar size={20} className="text-brand" />
            </div>
            <div>
              <h3 className={`${SECTION_TITLE} text-slate-900`}>Monthly Ledger</h3>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">Yield History</p>
            </div>
          </div>
          <div className="hidden md:flex gap-4">
            <div className="px-4 py-2 bg-white rounded-lg border border-slate-200 text-center">
              <p className="text-[11px] font-semibold text-slate-400 uppercase mb-0.5">Total</p>
              <p className="font-mono text-sm font-semibold text-slate-900">
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
              {pageItems.map((log, index) => (
                <tr key={log.id || index} className="hover:bg-slate-50/50 transition-colors group text-xs text-slate-650 max-md:text-[11px] max-md:font-normal">
                  <td className="px-2 py-1.5 md:px-3 md:py-1.5 max-md:text-[11px] whitespace-nowrap">
                    <p className="font-medium max-md:font-normal text-slate-800 max-md:text-[11px]">{new Date(log.created_at).toLocaleDateString()}</p>
                    <p className="text-[11px] text-slate-400 uppercase flex items-center gap-1 mt-0.5"><Scale size={10} className="opacity-40" /> {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </td>
                  <td className="px-2 py-1.5 md:px-3 md:py-1.5 font-mono text-slate-650 max-md:text-[11px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <ArrowDownRight size={12} className="text-red-500 animate-pulse" />
                      <span>{log.input_kg.toLocaleString()} kg</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 md:px-3 md:py-1.5 font-mono max-md:text-[11px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <ArrowUpRight size={12} className="text-emerald-500" />
                      <div>
                        <span className="text-slate-800 font-medium max-md:font-normal max-md:text-[11px]">{log.main_output_kg.toLocaleString()} kg</span>
                        <p className="text-[11px] font-medium max-md:font-normal text-slate-400 uppercase tracking-tight font-sans mt-0.5">{log.products?.product_code} · {log.products?.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 md:px-3 md:py-1.5 max-md:text-[11px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-medium max-md:font-normal text-slate-400 uppercase tracking-wider">Synced</span>
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
        <Pagination pager={pager} noun="production runs" className="px-3 pb-3" />
      </div>
    </div>
  );
}

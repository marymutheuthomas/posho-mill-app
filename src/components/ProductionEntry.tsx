import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Play, CheckCircle, AlertCircle, Loader2, XCircle, PowerOff, Zap } from 'lucide-react';

const POWER_RATE_PER_KWH = 25;

interface Product {
  id: string; // UUID
  product_code: string;
  name: string;
}

interface MillingSession {
  id: string;
  start_reading: number;
}

type LoadingState = 'idle' | 'fetching' | 'saving';

export interface ProductionEntryProps {
  onNavigateToService: () => void;
}

export default function ProductionEntry({ 
  onNavigateToService 
}: ProductionEntryProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isSessionStarted, setIsSessionStarted] = useState<boolean | null>(null);
  const [activeSession, setActiveSession] = useState<MillingSession | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('fetching');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Start Session States
  const [startReading, setStartReading] = useState('');

  // Close Session States
  const [isClosing, setIsClosing] = useState(false);
  const [endReading, setEndReading] = useState('');
  const [sessionClosed, setSessionClosed] = useState(false);

  const [formData, setFormData] = useState({
    inputProductId: '',
    inputQty: '',
    outputProductId: '',
    outputQty: '',
  });

  useEffect(() => {
    async function init() {
      setLoadingState('fetching');
      try {
        const { data: prods, error: pErr } = await supabase
          .from('products')
          .select('id, product_code, name, milling_fee')
          .in('product_code', ['101', '102', '103', '104', '105', '106', '107'])
          .order('product_code');

        if (pErr) throw pErr;
        setProducts(prods ?? []);

        const { data: sess, error: sErr } = await supabase
          .from('milling_sessions')
          .select('id, start_reading')
          .eq('status', 'Started')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sErr) throw sErr;

        if (sess) {
          setIsSessionStarted(true);
          setActiveSession(sess);
        } else {
          setIsSessionStarted(false);
        }
      } catch (err: any) {
        setError(`Database Connection Error: ${err.message}`);
      } finally {
        setLoadingState('idle');
      }
    }
    init();
  }, []);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const startVal = parseFloat(startReading);
    if (isNaN(startVal) || startVal < 0) {
      setError('Please enter a valid meter reading.');
      return;
    }

    setLoadingState('saving');
    try {
       const sessionId = crypto.randomUUID();
       const newSession = {
         id: sessionId,
         start_reading: startVal, 
         status: 'Started',
         created_at: new Date().toISOString()
       };

       // Push to Sync Queue
       const queueRaw = localStorage.getItem('mill_sync_queue');
       const queue = queueRaw ? JSON.parse(queueRaw) : [];
       queue.push({ table: 'milling_sessions', data: newSession });
       localStorage.setItem('mill_sync_queue', JSON.stringify(queue));
      
       setActiveSession({ id: sessionId, start_reading: startVal });
       setIsSessionStarted(true);
       setStartReading('');
       setSuccessMsg('Session initialized locally! You can now record production.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingState('idle');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!activeSession) {
      setError('Cannot save: No active product production session found.');
      return;
    }

    setLoadingState('saving');
    try {
      const logId = crypto.randomUUID();
      const newLog = {
        id: logId,
        session_id: activeSession.id,
        input_product_id: formData.inputProductId,
        input_qty: parseFloat(formData.inputQty),
        output_product_id: formData.outputProductId,
        output_qty: parseFloat(formData.outputQty),
        created_at: new Date().toISOString()
      };

      // Push to Sync Queue
      const queueRaw = localStorage.getItem('mill_sync_queue');
      const queue = queueRaw ? JSON.parse(queueRaw) : [];
      queue.push({ table: 'production_logs', data: newLog });
      localStorage.setItem('mill_sync_queue', JSON.stringify(queue));

      setSuccessMsg('✅ Production record saved locally! Syncing in background.');
      setFormData({ inputProductId: '', inputQty: '', outputProductId: '', outputQty: '' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingState('idle');
    }
  };

  const handleCloseSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!activeSession) return;

    const endReadingNum = parseFloat(endReading);
    if (isNaN(endReadingNum) || endReadingNum < activeSession.start_reading) {
      setError(`Error: Ending reading cannot be less than ${activeSession.start_reading}`);
      return;
    }

    const unitsConsumed = endReadingNum - activeSession.start_reading;
    const powerCost = unitsConsumed * POWER_RATE_PER_KWH;

    setLoadingState('saving');
    try {
      const { error: updErr } = await supabase
        .from('milling_sessions')
        .update({
          status: 'Completed',
          end_reading: endReadingNum,
          power_cost: powerCost
        })
        .eq('id', activeSession.id);

      if (updErr) throw updErr;
      
      setSessionClosed(true);
      setIsSessionStarted(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingState('idle');
    }
  };

  // Close Session Preview Math
  const previewUnits = parseFloat(endReading) ? (parseFloat(endReading) - (activeSession?.start_reading || 0)) : 0;
  const previewPowerCost = previewUnits * POWER_RATE_PER_KWH;

  if (loadingState === 'fetching') {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl shadow-sm border border-slate-100">
        <Loader2 size={48} className="text-[#06B6D4]" animate-spin mb-4 />
        <p className="text-[#0F172A] font-bold tracking-tight">Syncing Product Logs...</p>
      </div>
    );
  }

  if (sessionClosed) {
    return (
      <div className="max-w-xl mx-auto bg-[#4F46E5] rounded-[2.5rem] p-12 text-center shadow-2xl animate-in zoom-in-95 duration-500">
        <div className="bg-[#06B6D4] w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg">
          <CheckCircle size={48} className="text-white" />
        </div>
        <h3 className="text-3xl font-black text-white mb-4">Production Completed</h3>
        <p className="text-white/80 font-bold text-lg mb-10 leading-relaxed">
          Meter closed successfully. Power audit and stock levels updated.
        </p>
        <button
          onClick={onNavigateToService}
          className="w-full bg-white hover:bg-slate-50 text-[#4F46E5] font-black py-6 rounded-2xl flex items-center justify-center gap-4 transition-all hover:scale-[1.02] shadow-xl group text-xl"
        >
          < Zap size={28} className="text-[#06B6D4] group-hover:animate-pulse" />
          Switch to Service POS
        </button>
      </div>
    );
  }

  if (isSessionStarted === false) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-[2.5rem] p-12 text-center shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-500">
        <div className="bg-[#4F46E5] w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg">
          <Zap size={48} className="text-[#06B6D4]" />
        </div>
        <h3 className="text-3xl font-black text-[#0F172A] mb-4 uppercase tracking-tighter">Initialize Mill</h3>
        <p className="text-slate-400 font-bold mb-10 leading-relaxed">
          Enter the current meter reading to begin the production and service session.
        </p>
        <form onSubmit={handleStartSession} className="space-y-6">
          <div className="text-left space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Current Meter Reading (kWh)</label>
            <input 
              type="number" 
              step="0.1" 
              required
              placeholder="0.0"
              className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-2xl px-6 py-5 text-2xl font-black focus:border-[#4F46E5] outline-none text-center"
              value={startReading}
              onChange={(e) => setStartReading(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loadingState === 'saving'}
            className="w-full bg-[#4F46E5] hover:bg-[#3730A3] text-white font-black py-6 rounded-2xl flex items-center justify-center gap-4 transition-all hover:scale-[1.02] shadow-xl text-xl uppercase tracking-widest"
          >
            {loadingState === 'saving' ? <Loader2 className="animate-spin" /> : <><Play size={28} className="text-white" /> Start Work Session</>}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="space-y-10">
        <div className="bg-[#4F46E5] p-8 rounded-[2.5rem] shadow-xl flex items-center justify-between border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
          <div className="flex items-center gap-6 relative z-10">
            <div className="bg-[#06B6D4] p-4 rounded-2xl shadow-lg">
              <Play size={28} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Production Hub</h2>
              <p className="text-white/60 text-xs font-bold uppercase tracking-[0.2em] mt-1">In-house Stock Management</p>
            </div>
          </div>
          <div className="flex gap-4 items-center relative z-10">
            <div className="bg-white/10 px-6 py-3 rounded-2xl border border-white/10 hidden sm:block">
              <p className="text-white/40 text-[10px] font-black uppercase tracking-tighter mb-0.5">Start Reading</p>
              <p className="text-white font-mono font-black text-lg">{activeSession?.start_reading}</p>
            </div>
            <button
              onClick={() => setIsClosing(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-2xl flex items-center gap-3 font-black text-sm uppercase tracking-widest transition-all hover:scale-[1.05] shadow-xl shadow-red-900/20 border border-white/10"
            >
              <PowerOff size={18} />
              End Production
            </button>
          </div>
        </div>

        {isClosing ? (
          <div className="bg-white p-12 rounded-[2.5rem] shadow-2xl border-4 border-red-600/10 animate-in slide-in-from-top-4">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center">
                     <PowerOff size={20} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-black text-[#0F172A]">Finalize Meter Reading</h3>
                </div>
                <button onClick={() => setIsClosing(false)} className="text-slate-300 hover:text-slate-600 transition-colors">
                  <XCircle size={32} />
                </button>
              </div>
             
             <form onSubmit={handleCloseSession} className="space-y-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Ending Reading (kWh/Value)</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      autoFocus
                      placeholder={`Min: ${activeSession?.start_reading}`}
                      className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-2xl px-6 py-6 text-3xl font-black focus:border-[#4F46E5] outline-none transition-all placeholder:text-slate-200"
                      value={endReading}
                      onChange={(e) => setEndReading(e.target.value)}
                    />
                  </div>
                  
                  <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col justify-center">
                    <div className="flex items-center justify-between mb-2">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Units Consumed</p>
                       <Zap size={14} className="text-slate-300" />
                    </div>
                    <p className="text-2xl font-black text-[#0F172A]">{previewUnits.toFixed(2)} kWh</p>
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Power Cost</p>
                      <p className="text-2xl font-black text-red-600">KES {previewPowerCost.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 text-red-700 p-6 rounded-2xl flex items-center gap-4 font-bold border-l-4 border-red-500">
                    <AlertCircle size={24} />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loadingState === 'saving'}
                  className="w-full bg-red-600 text-white font-black py-7 rounded-2xl shadow-[0_20px_40px_rgba(220,38,38,0.2)] flex items-center justify-center gap-4 text-xl uppercase tracking-[0.2em] hover:bg-red-700 transition-all disabled:opacity-50"
                >
                  {loadingState === 'saving' ? <Loader2 className="animate-spin" /> : <><CheckCircle size={28} /> Confirm Meter Closure</>}
                </button>
             </form>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-10 animate-in fade-in duration-700">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="w-2 h-8 bg-[#4F46E5] rounded-full"></div>
                  <h3 className="font-black text-slate-400 uppercase tracking-widest text-sm text-opacity-60">Source Product</h3>
                </div>
                
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Identify Product</label>
                  <select
                    required
                    className="w-full bg-[#F8FAFC] border-2 border-slate-50 rounded-2xl px-6 py-5 font-bold focus:border-[#4F46E5] outline-none transition-all appearance-none"
                    value={formData.inputProductId}
                    onChange={(e) => setFormData({...formData, inputProductId: e.target.value})}
                  >
                    <option value="">Select Raw Material...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.product_code})</option>)}
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Quantity (KG)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    className="w-full bg-[#F8FAFC] border-2 border-slate-50 rounded-2xl px-6 py-5 font-bold focus:border-[#4F46E5] outline-none transition-all"
                    value={formData.inputQty}
                    onChange={(e) => setFormData({...formData, inputQty: e.target.value})}
                  />
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-[#5C4033]/5 space-y-8 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                  <div className="w-2 h-8 bg-[#E0B0FF] rounded-full"></div>
                  <h3 className="font-black text-[#5C4033] uppercase tracking-widest text-sm text-opacity-60">Resulting Product</h3>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black text-[#5C4033]/40 uppercase tracking-widest ml-1">Select Output</label>
                  <select
                    required
                    className="w-full bg-[#FDFCFB] border-2 border-[#5C4033]/5 rounded-2xl px-6 py-5 font-bold focus:border-[#E0B0FF] outline-none transition-all appearance-none"
                    value={formData.outputProductId}
                    onChange={(e) => setFormData({...formData, outputProductId: e.target.value})}
                  >
                    <option value="">Select Finished Item...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.product_code})</option>)}
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black text-[#5C4033]/40 uppercase tracking-widest ml-1">Processed Weight (KG)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    className="w-full bg-[#FDFCFB] border-2 border-[#5C4033]/5 rounded-2xl px-6 py-5 font-bold focus:border-[#E0B0FF] outline-none transition-all"
                    value={formData.outputQty}
                    onChange={(e) => setFormData({...formData, outputQty: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loadingState === 'saving'}
              className="w-full bg-[#4F46E5] hover:bg-[#3730A3] text-white font-black py-7 rounded-[2.5rem] shadow-2xl transition-all hover:-translate-y-1 active:scale-[0.98] flex items-center justify-center gap-4 text-xl uppercase tracking-[0.2em] disabled:opacity-50"
            >
              {loadingState === 'saving' ? (
                <Loader2 className="animate-spin" size={32} />
              ) : (
                <>
                  <CheckCircle size={32} className="text-[#06B6D4]" />
                  Commit Production Record
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

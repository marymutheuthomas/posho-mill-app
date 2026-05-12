import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Zap, Play, Square, AlertCircle, History, 
  CheckCircle, ArrowRight, ClipboardCheck, Lock 
} from 'lucide-react';

type SessionType = 'Internal' | 'External';
interface Session { id: string; session_type: SessionType; start_meter: number; end_meter: number | null; is_closed: boolean; created_at: string; closed_at?: string; }

interface SessionControlProps {
  onNavigate?: (tab: string) => void;
}

export default function SessionControl({ onNavigate }: SessionControlProps) {
  const [activeTab, setActiveTab] = useState<SessionType>('Internal');
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [lastEndMeter, setLastEndMeter] = useState<number>(0);
  const [startMeterInput, setStartMeterInput] = useState<string>('');
  const [endMeterInput, setEndMeterInput] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRecon, setShowRecon] = useState(false);
  const [closingMeter, setClosingMeter] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [reconLoading, setReconLoading] = useState(false);
  const [reconSuccess, setReconSuccess] = useState('');
  const [stockTakeVerified, setStockTakeVerified] = useState(false);
  const [isDayLocked, setIsDayLocked] = useState(false);

  const fetchSessionStatus = async () => {
    setLoading(true);
    try {
      // 1. Fetch Current Open Session
      const { data: open, error: oErr } = await supabase
        .from('milling_sessions')
        .select('id, start_meter, end_meter, session_type, is_closed, created_at')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (oErr) throw oErr;
      if (open && open.length > 0) {
        setCurrentSession(open[0]);
        setActiveTab((open[0].session_type as SessionType) || 'Internal');
      } else {
        setCurrentSession(null);
      }

      // 2. Fetch Last Closed Session
      const { data: lastClosed, error: lcErr } = await supabase
        .from('milling_sessions')
        .select('end_meter, closed_at')
        .eq('is_closed', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (lcErr) throw lcErr;

      // 3. Fetch Most Recent Stock Take
      const { data: lastStockTake, error: stErr } = await supabase
        .from('stock_take_history')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);

      if (stErr) throw stErr;

      // 4. HARD GATE LOGIC: Verify Compliance
      if (lastClosed && lastClosed.length > 0) {
        const lastClosedTime = new Date(lastClosed[0].closed_at || '').getTime();
        setLastEndMeter(Number(lastClosed[0].end_meter) || 0);
        setStartMeterInput((lastClosed[0].end_meter || 0).toString());

        if (lastStockTake && lastStockTake.length > 0) {
          const lastStockTime = new Date(lastStockTake[0].created_at).getTime();
          // If no session is open AND the last stock take was BEFORE the last session closed, LOCK IT.
          if (!open?.length && lastStockTime < lastClosedTime) {
            setIsDayLocked(true);
          } else {
            setIsDayLocked(false);
          }
        } else if (!open?.length) {
          // No stock take ever? Definitely lock it if a session has ever closed.
          setIsDayLocked(true);
        }
      }

      // Legacy Check (Keep for the reconciliation button)
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: recentStockHistory } = await supabase
        .from('stock_take_history')
        .select('physical_stock')
        .gte('created_at', twelveHoursAgo)
        .limit(1);

      setStockTakeVerified(!!recentStockHistory?.length);

    } catch (err: any) {
      console.error('Session Fetch Error:', err);
      setError('System connectivity issue. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessionStatus(); }, []);

  const handleStartSession = async () => {
    if (isDayLocked) return;
    setError(null);
    
    try {
      setLoading(true);
      
      // 1. RE-VERIFY: Ensure NO other session is open in the DB
      const { data: existing, error: checkErr } = await supabase
        .from('milling_sessions')
        .select('id, session_type')
        .eq('is_closed', false)
        .limit(1);

      if (checkErr) throw checkErr;
      if (existing && existing.length > 0) {
        setError(`CONFLICT: A ${existing[0].session_type} session is already active. You must close it first.`);
        fetchSessionStatus(); // Refresh UI to show the active session
        return;
      }

      // Determine the correct start reading (use fallback if 0)
      const effectiveStart = lastEndMeter === 0 ? 791.19 : lastEndMeter;
      const v = parseFloat(startMeterInput) || effectiveStart;

      if (isNaN(v)) { setError('Invalid start reading.'); return; }
      if (v < lastEndMeter && lastEndMeter !== 0) { setError('Start meter cannot be less than previous end.'); return; }

      const { data, error } = await supabase
        .from('milling_sessions')
        .insert([{ session_type: activeTab, start_meter: v, is_closed: false }])
        .select('id, start_meter, end_meter, session_type, is_closed, created_at');
      
      if (error) throw error;
      if (data?.length) setCurrentSession(data[0]);
      setStartMeterInput('');
    } catch (err: any) { 
      setError('Start failed: ' + (err.message || 'Unknown error')); 
    } finally { setLoading(false); }
  };

  const handleCloseSession = async () => {
    if (!currentSession) return;
    setError(null);
    const v = parseFloat(endMeterInput);
    if (isNaN(v)) { setError('Invalid end reading.'); return; }
    if (v < currentSession.start_meter) { setError('End meter cannot be less than start meter.'); return; }
    try {
      setLoading(true);
      const powerCost = (v - currentSession.start_meter) * 25.79; 
      const { error } = await supabase
        .from('milling_sessions')
        .update({ end_meter: v, is_closed: true, power_cost: powerCost, closed_at: new Date().toISOString() })
        .eq('id', currentSession.id);
      
      if (error) throw error;
      setCurrentSession(null); setEndMeterInput(''); fetchSessionStatus();
    } catch (err: any) { 
      setError('Close failed: ' + (err.message || 'Unknown error')); 
    } finally { setLoading(false); }
  };

  const handleSubmitReconciliation = async () => {
    if (!stockTakeVerified) {
      setError('ACTION BLOCKED: You MUST perform an inventory Stock-Take before submitting the daily audit.');
      return;
    }
    setReconLoading(true); setReconSuccess(''); setError(null);
    try {
      const s = new Date(); s.setHours(0,0,0,0);
      const { data: sales } = await supabase.from('sales_transactions').select('total_price').gte('created_at', s.toISOString());
      const expectedCash = sales?.reduce((a, c) => a + (c.total_price || 0), 0) || 0;
      
      const { data: fs } = await supabase.from('milling_sessions').select('start_meter').gte('created_at', s.toISOString()).order('created_at', { ascending: true }).limit(1);
      let openingMeter = lastEndMeter;
      if (fs?.length) openingMeter = fs[0].start_meter;

      const { error: ie } = await supabase.from('daily_audits').insert([{
        audit_date: new Date().toISOString().split('T')[0],
        opening_meter: openingMeter,
        closing_meter: parseFloat(closingMeter),
        actual_cash_collected: parseFloat(actualCash),
        expected_cash_system: expectedCash
      }]);
      if (ie) throw ie;
      setReconSuccess('Final Daily Audit submitted successfully.');
      setClosingMeter(''); setActualCash('');
    } catch (err: any) { setError(err.message); }
    finally { setReconLoading(false); }
  };

  if (loading && !currentSession && lastEndMeter === 0) return <div className="p-20 text-center font-black text-slate-400 uppercase tracking-widest animate-pulse">Syncing Session State...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between border-b border-slate-200 pb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl">
            <Zap className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Session Control</h1>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">3-Phase Meter · Odometer Logic</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 px-6 py-3 rounded-2xl shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tariff Rate</p>
          <p className="text-xl font-black text-slate-900">25.79 <span className="text-xs text-slate-400 font-bold uppercase">Ksh/kWh</span></p>
        </div>
      </div>

      {isDayLocked && !currentSession && (
        <div className="bg-red-600 rounded-[2rem] p-8 text-white shadow-2xl animate-in slide-in-from-top-4 duration-500">
           <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="bg-white/20 p-6 rounded-3xl backdrop-blur-md">
                 <Lock size={48} className="text-white" />
              </div>
              <div className="flex-1 text-center md:text-left space-y-2">
                 <h2 className="text-2xl font-black uppercase tracking-tighter italic">🚨 System Locked</h2>
                 <p className="text-sm font-bold text-red-100 leading-relaxed uppercase">
                    Previous day inventory not reconciled. You must complete a Physical Stock Take before opening a new session.
                 </p>
              </div>
              <button 
                onClick={() => onNavigate?.('Stock Take')}
                className="bg-white text-red-600 px-10 py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-slate-50 transition-all hover:scale-105 active:scale-95"
              >
                 Go to Stock Take
              </button>
           </div>
        </div>
      )}

      {error && (
        <div className="bg-red-600 text-white p-6 rounded-2xl font-black flex items-center gap-4 shadow-xl animate-shake">
          <AlertCircle size={24} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          {currentSession ? (
            <div className="mill-card p-10 border-2 border-slate-900 bg-white shadow-2xl relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                    Live Session: {currentSession?.session_type?.toUpperCase()}
                  </h2>
                </div>
                
                <div className="grid grid-cols-2 gap-10 mb-10">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Start Reading</label>
                    <p className="text-5xl font-black text-slate-900 tracking-tighter">
                      {currentSession?.start_meter} <span className="text-xl text-slate-300">kWh</span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Started At</label>
                    <p className="text-2xl font-black text-slate-900 uppercase">
                      {new Date(currentSession.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-8 border-t border-slate-100">
                  <label className="block text-[11px] font-black text-slate-900 uppercase tracking-widest">Enter Closing Meter Reading</label>
                  <div className="flex gap-4">
                    <input
                      type="number" step="0.1"
                      value={endMeterInput}
                      onChange={(e) => setEndMeterInput(e.target.value)}
                      placeholder="00000.0"
                      className="mill-input flex-1 text-3xl font-black py-6 bg-slate-50 border-slate-200 focus:bg-white focus:border-slate-900 transition-all"
                    />
                    <button onClick={handleCloseSession} className="mill-btn-primary px-10 flex items-center gap-3 shadow-xl">
                      <Square size={20} fill="white" />
                      CLOSE
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`mill-card p-10 bg-white border-slate-200 shadow-2xl transition-all ${isDayLocked ? 'opacity-50 grayscale' : ''}`}>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8">Initialize Session</h2>
              
              <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl mb-10">
                {(['Internal', 'External'] as SessionType[]).map(t => (
                  <button
                    key={t}
                    disabled={isDayLocked}
                    onClick={() => setActiveTab(t)}
                    className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'} ${isDayLocked ? 'cursor-not-allowed' : ''}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Previous End Meter</label>
                  <div className="flex items-center gap-3 text-3xl font-black text-slate-300">
                    <History size={24} />
                    {lastEndMeter} <span className="text-sm">kWh</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Starting At</label>
                  <div className="flex items-center justify-between mill-input bg-slate-50 border-slate-200 cursor-not-allowed py-4">
                    <span className="text-3xl font-black text-slate-900/40">
                      {(lastEndMeter === 0 ? 791.19 : lastEndMeter)} <span className="text-sm italic">kWh</span>
                    </span>
                    <Zap size={20} className="text-slate-300 mr-2" />
                  </div>
                  {lastEndMeter === 0 && (
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">System Initialized to Base Meter: 791.19</p>
                  )}
                </div>
              </div>

              <button 
                onClick={handleStartSession} 
                disabled={isDayLocked}
                className={`w-full flex items-center justify-center gap-3 py-8 text-xl font-black shadow-xl transition-all ${isDayLocked ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'mill-btn-primary shadow-slate-900/20 hover:-translate-y-1'}`}
              >
                <Play size={28} fill={isDayLocked ? "gray" : "white"} />
                {isDayLocked ? 'SYSTEM LOCKED' : `START ${activeTab.toUpperCase()} SESSION`}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className={`mill-card p-8 border-2 transition-all ${stockTakeVerified ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50 shadow-xl animate-pulse'}`}>
             <div className="flex items-center gap-3 mb-4">
               <ClipboardCheck className={stockTakeVerified ? 'text-emerald-600' : 'text-amber-600'} size={24} />
               <h3 className={`text-[11px] font-black uppercase tracking-widest ${stockTakeVerified ? 'text-emerald-700' : 'text-amber-700'}`}>
                 Daily Stock-Take
               </h3>
             </div>
             <p className={`text-[10px] font-bold uppercase leading-relaxed ${stockTakeVerified ? 'text-emerald-600' : 'text-amber-600'}`}>
               {stockTakeVerified ? 'Inventory audit successfully recorded for today.' : 'MANDATORY: You must record a physical stock count before closing for the day.'}
             </p>
             {!stockTakeVerified && (
               <button 
                onClick={() => onNavigate?.('Stock Take')}
                className="mt-4 w-full bg-amber-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-amber-700 transition-all"
               >
                 Perform Count Now
               </button>
             )}
          </div>

          <div className="mill-card p-8 bg-white border-slate-200 shadow-xl">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <CheckCircle size={16} /> Final Daily Audit
            </h2>
            
            <button
              onClick={() => setShowRecon(!showRecon)}
              className="w-full flex items-center justify-between p-5 bg-slate-50 hover:bg-white rounded-2xl transition-all border border-slate-200 group shadow-sm"
            >
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Reconciliation</span>
              <ArrowRight size={18} className="text-slate-400 group-hover:text-slate-900 transition-all" />
            </button>

            {showRecon && (
              <div className="mt-8 space-y-6 pt-8 border-t border-slate-100 animate-in slide-in-from-top-4 duration-300">
                {reconSuccess && <p className="text-[11px] font-black text-emerald-600 bg-emerald-100 p-3 rounded-xl border border-emerald-200">{reconSuccess}</p>}
                
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Final Day Meter</label>
                  <input type="number" step="0.1" value={closingMeter} onChange={e => setClosingMeter(e.target.value)} className="mill-input w-full font-black bg-slate-50" placeholder="00000.0" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Actual Cash Collected</label>
                  <input type="number" value={actualCash} onChange={e => setActualCash(e.target.value)} className="mill-input w-full font-black bg-slate-50" placeholder="KES 0.00" />
                </div>
                <button 
                  onClick={handleSubmitReconciliation} 
                  disabled={reconLoading} 
                  className={`w-full py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-xl ${stockTakeVerified ? 'bg-slate-900 text-white hover:-translate-y-1' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                  {reconLoading ? 'SUBMITTING...' : 'COMPLETE DAILY AUDIT'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

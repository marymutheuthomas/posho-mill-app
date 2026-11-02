import { useState } from 'react';
import { useMillingSession, useSessionHistory, type MillingSession, type SessionType } from '../hooks/useMillingSession';
import {
  Zap, AlertTriangle, Play, 
  CheckCircle, Clock,
  Activity, RotateCcw, ZapOff, X,
  Pencil, Trash2
} from 'lucide-react';


// ——— Types ————————————————————————————————————————————————————————————————
type Session = MillingSession;

interface SessionControlProps {
  onNavigate?: (tab: string) => void;
  isOnline: boolean;
  pendingCount: number;
  role: string | null;
}

// ——— Component ——————————————————————————————————————————————————————————————
export default function SessionControl({ role, onNavigate }: SessionControlProps) {
  // UI state

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [closingMeter, setClosingMeter] = useState('');
  
  const [startModal, setStartModal] = useState<{open: boolean; type: SessionType | null}>({open: false, type: null});
  const [endModal, setEndModal] = useState(false);
  const [editSessionModal, setEditSessionModal] = useState<{ open: boolean; record: Session | null }>({ open: false, record: null });
  const [deleteSessionModal, setDeleteSessionModal] = useState<{ open: boolean; record: Session | null }>({ open: false, record: null });
  const [editSessionForm, setEditSessionForm] = useState({ start_meter: 0, end_meter: 0, created_at: '', closed_at: '' });

  const toDateTimeLocal = (dateString?: string) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
  };

  // —— Shared session state (same source as POS, Production, Dashboard and the nav locks) ——
  const { activeSession, isLoading: loadingSession, lastEndMeter, stockTakeDue, startSession, closeSession } = useMillingSession();
  const { pastSessions, isLoading: loadingPastSessions, editSession, deleteSession } = useSessionHistory();

  const isSyncing = startSession.isPending || closeSession.isPending || editSession.isPending || deleteSession.isPending;

  const flash = (msg: string) => {
    setError(null);
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleStart = (type: SessionType) => {
    startSession.mutate(type, {
      onSuccess: ({ offline }) => {
        flash(offline ? 'Session started offline. It will sync when the connection returns.' : 'Session Started');
        setStartModal({ open: false, type: null });
      },
      onError: (err: any) => setError(err.message),
    });
  };

  const handleEnd = () => {
    closeSession.mutate(parseFloat(closingMeter), {
      onSuccess: ({ offline }) => {
        flash(offline ? 'Session closed offline. It will sync when the connection returns.' : 'Session Closed');
        setEndModal(false);
        setClosingMeter('');
      },
      onError: (err: any) => setError(err.message),
    });
  };

  const handleEditSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSessionModal.record) return;
    editSession.mutate({
      id: editSessionModal.record.id,
      payload: {
        start_meter: Number(editSessionForm.start_meter) || 0,
        end_meter: Number(editSessionForm.end_meter) || 0,
        created_at: editSessionForm.created_at,
        closed_at: editSessionForm.closed_at,
      }
    }, {
      onSuccess: () => {
        flash('Session updated successfully.');
        setEditSessionModal({ open: false, record: null });
      },
      onError: (err: any) => setError(err.message),
    });
  };

  const handleDeleteSession = () => {
    if (!deleteSessionModal.record) return;
    deleteSession.mutate(deleteSessionModal.record.id, {
      onSuccess: () => {
        flash('Session deleted successfully.');
        setDeleteSessionModal({ open: false, record: null });
      },
      onError: (err: any) => setError(err.message),
    });
  };

  if (loadingSession || loadingPastSessions) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RotateCcw className="w-10 h-10 text-slate-300 animate-spin" />
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Synchronizing Registry...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-10 pb-32 px-4 md:px-0">
      {error && <div className="bg-red-600 text-white p-4 rounded-xl font-semibold flex items-center gap-3 shadow-lg mb-6"><AlertTriangle size={20}/>{error}</div>}
      {successMsg && <div className="bg-emerald-600 text-white p-4 rounded-xl font-semibold flex items-center gap-3 shadow-lg mb-6"><CheckCircle size={20}/>{successMsg}</div>}
      
      {/* 1. SESSION STATUS ORCHESTRATOR */}
      <div className={`relative overflow-hidden rounded-2xl md:rounded-[2.5rem] border transition-all duration-500 shadow-2xl ${activeSession ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
         {activeSession && (
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent animate-in fade-in duration-1000" />
         )}
         <div className="relative z-10 p-6 md:p-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
               <div className="flex items-center gap-4 md:gap-6">
                  <div className={`w-16 h-16 md:w-24 md:h-24 rounded-2xl md:rounded-3xl flex items-center justify-center transition-all duration-500 ${activeSession ? 'bg-emerald-500 shadow-xl shadow-emerald-900/40 rotate-3' : 'bg-slate-100 rotate-0'}`}>
                     {activeSession ? <Zap className="text-white animate-pulse" size={32} /> : <ZapOff className="text-slate-300" size={32} />}
                  </div>
                  <div>
                     <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.2em] ${activeSession ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-100 text-slate-400'}`}>
                           {activeSession ? 'System Active' : 'System Standby'}
                        </span>
                        {isSyncing && <RotateCcw size={14} className="text-blue-400 animate-spin" />}
                     </div>
                     <h1 className={`text-2xl md:text-5xl font-semibold tracking-tighter uppercase transition-colors ${activeSession ? 'text-white' : 'text-slate-900'}`}>
                        {activeSession ? activeSession.session_type : 'Ready to Start'}
                     </h1>
                     <p className={`text-[10px] md:text-xs font-medium uppercase tracking-widest mt-2 ${activeSession ? 'text-slate-400' : 'text-slate-400'}`}>
                        {activeSession ? `Operator Terminal · Session: ${activeSession.session_code || '---'}` : 'Initialize Mill Session to enable Point of Sale & Production Logging'}
                     </p>
                  </div>
               </div>

               {!activeSession ? (
                  <div className="flex flex-col gap-3 w-full md:w-auto max-w-sm">
                    <div className="flex flex-wrap gap-3">
                       {(['Internal', 'External'] as SessionType[]).map((type) => (
                          <button
                             key={type}
                             onClick={() => setStartModal({ open: true, type: type as any })}
                             className="flex-1 md:flex-none px-6 md:px-10 py-4 md:py-5 bg-slate-900 text-white rounded-xl md:rounded-2xl font-semibold text-xs md:text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl active:scale-95"
                          >
                             {type}
                          </button>
                       ))}
                    </div>
                    {/* Advisory only: starting a session is never blocked on the stock take */}
                    {stockTakeDue && (
                      <button
                         onClick={() => onNavigate && onNavigate('Stock Take')}
                         className="text-left text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 hover:bg-amber-100 transition-all"
                      >
                         Stock take recommended after last night's late close. Tap to record it.
                      </button>
                    )}
                  </div>
               ) : (
                  <button
                     onClick={() => setEndModal(true)}
                     className="w-full md:w-auto px-10 py-4 md:py-5 bg-red-600 text-white rounded-xl md:rounded-2xl font-semibold text-xs md:text-sm uppercase tracking-widest hover:bg-red-500 transition-all shadow-xl shadow-red-900/20 active:scale-95"
                  >
                     Stop Session
                  </button>
               )}
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
         {/* Start Odometer Display */}
         <div className="mill-card p-6 md:p-10 bg-white border-slate-100 shadow-xl rounded-2xl">
            <div className="flex items-center gap-3 mb-6 md:mb-8">
               <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-brand">
                  <Activity size={20} />
               </div>
               <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Opening Reading</p>
            </div>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tighter text-slate-900 font-mono">
               {activeSession ? activeSession.start_meter : (lastEndMeter || '0.00')} <span className="text-sm font-semibold text-slate-300">kWh</span>
            </h2>
            <div className="mt-6 md:mt-8 pt-6 border-t border-slate-50">
               <p className="text-[9px] font-medium text-slate-400 uppercase tracking-tight">Verified by System Registry</p>
            </div>
         </div>

         {/* Time Elapsed / Session Duration */}
         <div className="mill-card p-6 md:p-10 bg-white border-slate-100 shadow-xl rounded-2xl">
            <div className="flex items-center gap-3 mb-6 md:mb-8">
               <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                  <Clock size={20} />
               </div>
               <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Duration</p>
            </div>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tighter text-slate-900 font-mono">
               {activeSession ? (
                  new Date(activeSession.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
               ) : '--:--'}
            </h2>
            <div className="mt-6 md:mt-8 pt-6 border-t border-slate-50">
               <p className="text-[9px] font-medium text-slate-400 uppercase tracking-tight">Start Time Local</p>
            </div>
         </div>

         {/* Operator Badge */}
         <div className="mill-card p-6 md:p-10 bg-white border-slate-100 shadow-xl rounded-2xl">
            <div className="flex items-center gap-3 mb-6 md:mb-8">
               <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                  <Activity size={20} />
               </div>
               <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Access Protocol</p>
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tighter text-slate-900 uppercase">
               {role || 'Staff'}
            </h2>
            <div className="mt-6 md:mt-8 pt-6 border-t border-slate-50">
               <p className="text-[9px] font-medium text-slate-400 uppercase tracking-tight">Privileged Terminal Access</p>
            </div>
         </div>
      </div>

      {/* START MODAL */}
      {startModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-2xl md:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 md:p-10 bg-slate-900 text-white relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl" />
              <div className="relative z-10 flex justify-between items-center">
                <div>
                  <h3 className="text-xl md:text-2xl font-semibold uppercase tracking-tight">Start Session</h3>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-1">Verify Initial State</p>
                </div>
                <button onClick={() => setStartModal({open: false, type: null})} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20}/></button>
              </div>
            </div>
            <div className="p-8 md:p-10 space-y-8">
              <div className="space-y-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Initial Odometer Reading</p>
                <div className="text-3xl md:text-5xl font-semibold text-slate-900 font-mono text-center py-6 bg-slate-50 rounded-2xl border-2 border-slate-100">
                  {lastEndMeter} <span className="text-sm">kWh</span>
                </div>
              </div>
              <button 
                onClick={() => handleStart(startModal.type!)}
                disabled={isSyncing}
                className="w-full py-4 md:py-6 bg-slate-900 text-white rounded-2xl font-semibold uppercase text-sm tracking-widest shadow-xl hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {isSyncing ? <RotateCcw className="animate-spin" size={20} /> : <Play size={20} fill="currentColor" />}
                {isSyncing ? 'Starting...' : 'Authorize Start'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* END MODAL */}
      {endModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-2xl md:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 md:p-10 bg-slate-900 text-white relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl" />
              <div className="relative z-10 flex justify-between items-center">
                <div>
                  <h3 className="text-xl md:text-2xl font-semibold uppercase tracking-tight">End Session</h3>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-1">Meter Verification Required</p>
                </div>
                <button onClick={() => setEndModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20}/></button>
              </div>
            </div>
            <div className="p-8 md:p-10 space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                   <span>Final Meter Reading (kWh)</span>
                   <span className="text-brand">Min: {activeSession?.start_meter}</span>
                </div>
                <div className="relative group">
                  <input 
                    required 
                    type="number" 
                    step="0.01" 
                    min={activeSession?.start_meter}
                    value={closingMeter} 
                    onChange={e => setClosingMeter(e.target.value)} 
                    className="mill-input w-full font-semibold text-2xl md:text-4xl py-4 md:py-6 text-center border-slate-200 focus:border-red-500 transition-all text-base md:text-4xl max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" 
                    placeholder="0.00"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 font-semibold text-slate-200 text-lg uppercase">kWh</div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <button type="button" onClick={() => setEndModal(false)} className="py-4 md:py-5 rounded-2xl bg-slate-50 text-slate-400 font-semibold text-xs uppercase hover:bg-slate-100 transition-all">Cancel</button>
                <button onClick={handleEnd} disabled={isSyncing} className="py-4 md:py-5 rounded-2xl bg-red-600 text-white font-semibold text-xs uppercase hover:bg-red-700 shadow-xl shadow-red-200 transition-all flex items-center justify-center gap-2">
                  {isSyncing ? 'SYNCING...' : <><ZapOff size={14}/> STOP MILL</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. SESSION AUDIT LEDGER */}
      <div className="mill-card p-0 overflow-hidden bg-white border-slate-200 shadow-2xl mt-10">
        <div className="p-6 md:p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-white rounded-lg md:rounded-xl shadow-sm flex items-center justify-center text-slate-900 border border-slate-100">
              <Zap size={16} />
            </div>
            <div>
              <h3 className="text-sm md:text-lg font-semibold text-slate-900 uppercase tracking-tight">Session History & Audit Ledger</h3>
              <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">Correct Odometer or Session Time Mismatches</p>
            </div>
          </div>
        </div>

        <div className="w-full overflow-auto max-h-[500px] border-t border-slate-100 p-3 max-md:p-2 scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider max-md:text-[11px] max-md:font-medium max-md:tracking-tight bg-slate-50">
                <th className="px-2 py-1.5 md:px-3 md:py-2 max-md:font-medium">Session Code</th>
                <th className="px-2 py-1.5 md:px-3 md:py-2 max-md:font-medium">Type</th>
                <th className="px-2 py-1.5 md:px-3 md:py-2 max-md:font-medium">Opening Odometer</th>
                <th className="px-2 py-1.5 md:px-3 md:py-2 max-md:font-medium">Closing Odometer</th>
                <th className="px-2 py-1.5 md:px-3 md:py-2 max-md:font-medium">Consumed</th>
                <th className="px-2 py-1.5 md:px-3 md:py-2 max-md:font-medium">Duration</th>
                <th className="px-2 py-1.5 md:px-3 md:py-2 text-right max-md:font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {pastSessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-20 text-center text-slate-300 font-semibold uppercase tracking-widest italic text-xs max-md:text-[11px]">No closed sessions found</td>
                </tr>
              )}
              {pastSessions.map(s => {
                const consumed = (s.end_meter !== null ? s.end_meter - s.start_meter : 0).toFixed(2);
                return (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group text-xs text-slate-650 max-md:text-[11px]">
                    <td className="px-2 py-1.5 md:px-3 md:py-1.5 max-md:text-[11px] whitespace-nowrap">
                      <p className="font-semibold text-slate-800 uppercase tracking-tight">{s.session_code || '—'}</p>
                    </td>
                    <td className="px-2 py-1.5 md:px-3 md:py-1.5 max-md:text-[11px] whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-semibold uppercase ${
                        s.session_type === 'Internal' ? 'bg-blue-50 text-brand border border-blue-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>{s.session_type}</span>
                    </td>
                    <td className="px-2 py-1.5 md:px-3 md:py-1.5 font-mono text-slate-850 max-md:text-[11px] whitespace-nowrap">{s.start_meter?.toLocaleString()} kWh</td>
                    <td className="px-2 py-1.5 md:px-3 md:py-1.5 font-mono text-slate-850 max-md:text-[11px] whitespace-nowrap">{s.end_meter?.toLocaleString()} kWh</td>
                    <td className="px-2 py-1.5 md:px-3 md:py-1.5 font-mono font-semibold text-emerald-600 max-md:text-[11px] whitespace-nowrap">+{consumed} kWh</td>
                    <td className="px-2 py-1.5 md:px-3 md:py-1.5 max-md:text-[11px] whitespace-nowrap">
                      <p className="font-medium text-slate-800">{new Date(s.created_at).toLocaleDateString()}</p>
                      <p className="text-[9px] text-slate-400 uppercase mt-0.5 flex items-center gap-1">
                        <Clock size={10} /> 
                        {new Date(s.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        <span>→</span>
                        {s.closed_at ? new Date(s.closed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—'}
                      </p>
                    </td>
                    <td className="px-2 py-1.5 md:px-3 md:py-1.5 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => {
                          setEditSessionForm({
                            start_meter: s.start_meter,
                            end_meter: s.end_meter || s.start_meter,
                            created_at: s.created_at,
                            closed_at: s.closed_at || new Date().toISOString()
                          });
                          setEditSessionModal({ open: true, record: s });
                        }} className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-100 rounded-md transition-all"><Pencil size={10}/></button>
                        <button onClick={() => setDeleteSessionModal({ open: true, record: s })} className="p-1 bg-red-50 hover:bg-red-100 text-red-655 border border-red-100/50 rounded-md transition-all"><Trash2 size={10}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT SESSION MODAL */}
      {editSessionModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Edit Session</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Adjust Session Date or Odometer Readings</p>
              </div>
              <button onClick={() => setEditSessionModal({ open: false, record: null })} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={20}/></button>
            </div>
            <form onSubmit={handleEditSession} className="p-8 space-y-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Opening Meter (kWh)</label>
                  <input required type="number" step="0.01" value={editSessionForm.start_meter} onChange={e => setEditSessionForm({...editSessionForm, start_meter: parseFloat(e.target.value) || 0})} className="mill-input w-full font-bold max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Closing Meter (kWh)</label>
                  <input required type="number" step="0.01" value={editSessionForm.end_meter} onChange={e => setEditSessionForm({...editSessionForm, end_meter: parseFloat(e.target.value) || 0})} className="mill-input w-full font-bold max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Start Date & Time</label>
                <input required type="datetime-local" value={toDateTimeLocal(editSessionForm.created_at)} onChange={e => setEditSessionForm({...editSessionForm, created_at: new Date(e.target.value).toISOString()})} className="mill-input w-full font-bold uppercase max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 max-md:text-[11px] max-md:font-medium max-md:text-slate-500 max-md:mb-1 max-md:block">Close Date & Time</label>
                <input required type="datetime-local" value={toDateTimeLocal(editSessionForm.closed_at)} onChange={e => setEditSessionForm({...editSessionForm, closed_at: new Date(e.target.value).toISOString()})} className="mill-input w-full font-bold uppercase max-md:text-base max-md:h-8 max-md:py-1 max-md:px-2 max-md:font-normal max-md:text-slate-800 max-md:border max-md:border-slate-200 max-md:rounded max-md:focus:ring-1 max-md:focus:ring-slate-900 max-md:focus:border-slate-900" />
              </div>
              <button type="submit" disabled={isSyncing} className="mill-btn-primary w-full py-4 shadow-xl">
                {isSyncing ? 'UPDATING...' : '✓ SAVE CHANGES'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE SESSION MODAL */}
      {deleteSessionModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-red-600 text-white text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter">Delete Session?</h3>
              <p className="text-xs text-red-100 font-bold uppercase mt-1 leading-relaxed">
                This action will permanently delete session <span className="font-black text-white">{deleteSessionModal.record?.session_code}</span>.
              </p>
            </div>
            <div className="p-6 grid grid-cols-1 gap-3 md:grid-cols-2">
              <button onClick={() => setDeleteSessionModal({ open: false, record: null })} className="py-4 rounded-xl bg-slate-100 text-slate-600 font-black text-xs uppercase hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={handleDeleteSession} disabled={isSyncing} className="py-4 rounded-xl bg-red-600 text-white font-black text-xs uppercase hover:bg-red-700 transition-all shadow-lg shadow-red-200">
                {isSyncing ? 'DELETING...' : 'YES, DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Activity, ShieldCheck, Factory, 
  ShoppingCart, BookOpen, Settings as SettingsIcon, Lock,
  Wifi, WifiOff, X,
  Zap, ShoppingBag, Search, User, ChevronRight, ChevronUp
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useActiveSession } from './hooks/useActiveSession';
import { supabase } from './lib/supabase';
import { db } from './lib/db';
import Dashboard from './components/Dashboard';
import ProductionEntry from './components/ProductionEntry';
import Purchases from './components/Purchases';
import ServicePOS from './components/ServicePOS';
// import AuditHub from './components/AuditHub';
import MasterDashboard from './components/MasterDashboard';
import SessionControl from './components/SessionControl';
import DebtLedger from './components/DebtLedger';
import StockTake from './components/StockTake';
import Settings from './components/Settings';
import OperationalAlert from './components/OperationalAlert';
import UserManagement from './components/UserManagement';
import Login from './components/Login';

function App() {
  const [user, setUser] = useState<{ id: string; role: 'ADMIN' | 'EMPLOYEE' } | null>(null);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeSessionType, setActiveSessionType] = useState<'Internal' | 'External' | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setShowBackToTop(e.currentTarget.scrollTop > 400);
  };

  const scrollToTop = () => {
    document.getElementById('main-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending-tx-count'],
    queryFn: async () => await db.pendingTransactions.count(),
    refetchInterval: 5000,
  });

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);

    // RESTORE SESSION ON MOUNT
    async function restoreSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser({ 
          id: session.user.id, 
          role: session.user.user_metadata?.role || 'EMPLOYEE' 
        });
      }
    }
    restoreSession();

    return () => { 
      window.removeEventListener('online', up); 
      window.removeEventListener('offline', down);
    };
  }, []);

  const { data: activeSession } = useActiveSession();

  // BACKGROUND PROFILE SYNC (For Offline Logins)
  useEffect(() => {
    async function syncProfiles() {
      if (!isOnline || user?.role !== 'ADMIN') return;
      try {
        const { data: remoteProfiles } = await supabase.from('profiles').select('*');
        if (remoteProfiles) {
          for (const p of remoteProfiles) {
            const existing = await db.profiles.get(p.id);
            await db.profiles.put({
              ...p,
              // Keep local display_password if already cached, as remote doesn't have it
              display_password: existing?.display_password || p.display_password
            });
          }
        }
      } catch (err) {
        console.warn("Profile sync skipped:", err);
      }
    }
    syncProfiles();
  }, [isOnline, user?.role]);

  useEffect(() => {
    setActiveSessionType(activeSession?.session_type as any || null);
  }, [activeSession]);

  useQuery({
    queryKey: ['unclosed-prev-session'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0,0,0,0);
      const { data } = await supabase.from('milling_sessions')
        .select('id, created_at')
        .eq('is_closed', false)
        .lt('created_at', today.toISOString())
        .maybeSingle();
      return data;
    }
  });

  // Temporarily disable the morning recovery banner
  const showMorningRecovery = false;

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Session Control', icon: Zap },
    { name: 'Insights & Audit', icon: Activity, adminOnly: true },
    { name: 'Production Hub', icon: Factory },
    { name: 'Point of Sale', icon: ShoppingBag },
    { name: 'Stock Take', icon: ShieldCheck },
    { name: 'Debt Ledger', icon: BookOpen },
    { name: 'Purchases', icon: ShoppingCart },
    { name: 'Settings', icon: SettingsIcon },
    { name: 'User Management', icon: ShieldCheck, adminOnly: true },
  ].filter(item => !item.adminOnly || user?.role === 'ADMIN');

  if (!user) {
    return <Login onLogin={(role, id) => setUser({ role, id: id || 'offline-user' })} />;
  }

  const handleLogout = () => {
    setUser(null);
    setActiveTab('Dashboard');
  };

  const NavButton = ({ item, isMobile = false }: { item: any, isMobile?: boolean }) => {
    const active = activeTab === item.name;
    const isLocked = (activeSessionType === 'Internal' && item.name === 'Point of Sale') || 
                     (activeSessionType === 'External' && item.name === 'Production Hub');
    
    return (
      <button
        onClick={() => {
          if (isLocked) {
            showNotification(`Access Locked: Active ${activeSessionType} session prevents access to ${item.name}.`);
          } else if (!activeSessionType && (item.name === 'Production Hub' || item.name === 'Point of Sale')) {
            showNotification(`⚠️ No Active Session: Please start an Internal or External production session before recording data.`);
          } else {
            setActiveTab(item.name);
            if (isMobile) setIsDrawerOpen(false);
          }
        }}
        className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-sm font-black transition-all group ${
          active 
          ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20' 
          : isLocked 
            ? 'text-slate-200 opacity-50 cursor-not-allowed' 
            : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <div className="shrink-0">
          {isLocked ? <Lock size={20} /> : <item.icon size={22} className={active ? 'text-white' : 'group-hover:scale-110 transition-transform'} />}
        </div>
        <span className={`${isMobile ? 'block' : 'hidden lg:block'} whitespace-nowrap truncate`}>{item.name}</span>
      </button>
    );
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] font-sans overflow-hidden">
      
      {/* MOBILE DRAWER (OFF-CANVAS MENU) */}
      {isDrawerOpen && (
        <>
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[55] animate-in fade-in duration-300"
            onClick={() => setIsDrawerOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 bg-white z-[60] shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="h-20 flex items-center px-6 border-b border-slate-100 justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg">
                  <Zap className="text-white" size={20} />
                </div>
                <span className="font-black text-slate-900 uppercase">Master Menu</span>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="p-2 hover:bg-slate-50 rounded-lg">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {menuItems.map(item => <NavButton key={item.name} item={item} isMobile />)}
            </nav>
            <div className="p-6 border-t border-slate-100">
              <button onClick={handleLogout} className="w-full flex items-center gap-4 px-4 py-4 rounded-xl text-[10px] font-black text-red-500 bg-red-50 hover:bg-red-100 transition-all uppercase tracking-widest">
                <Lock size={18} />
                <span>Secure Logout</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* PERSISTENT SIDEBAR - Tablet & Desktop */}
      <aside className="hidden md:flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out lg:w-64 w-20">
        <div className="h-20 flex items-center px-6 border-b border-slate-100 gap-3 shrink-0">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-slate-900/20">
            <Zap className="text-white" size={20} />
          </div>
          <span className="hidden lg:block font-black text-slate-900 tracking-tighter uppercase text-lg">Sakhai Posho Mill ERP</span>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
          {menuItems.map(item => <NavButton key={item.name} item={item} />)}
        </nav>

        <div className="p-4 border-t border-slate-100 shrink-0">
          <button onClick={handleLogout} className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[10px] font-black text-red-500 hover:bg-red-50 transition-all uppercase tracking-widest">
            <Lock size={18} />
            <span className="hidden lg:block">Secure Logout</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-50">
        
        {/* TOP COMMAND BAR */}
        <header className="sticky top-0 z-40 h-12 md:h-20 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 md:px-10 shrink-0 shadow-sm">
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsDrawerOpen(true)}
              className="w-8 h-8 bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center justify-center shadow-md md:hidden shrink-0 active:scale-95 transition-all"
              title="Open Drawer Menu"
            >
              <Zap className="text-white" size={16} />
            </button>
            <div className="hidden md:flex lg:flex items-center gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
               <span>Mill Console</span>
               <ChevronRight size={12} />
               <span className="text-slate-900">{activeTab}</span>
            </div>
            
            <div className="md:hidden flex items-center">
               <h2 className="text-xs font-semibold text-slate-900 uppercase truncate max-w-[120px]">{activeTab}</h2>
            </div>
          </div>

          <div className="hidden md:flex flex-1 max-w-md mx-10">
             <div className="relative w-full">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
               <input 
                type="text" 
                placeholder="Global Search Command..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-12 pr-4 text-xs font-bold focus:bg-white focus:ring-4 focus:ring-slate-900/5 transition-all outline-none"
               />
             </div>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 md:gap-3 px-2 md:px-4 py-1 md:py-2 rounded-full border shadow-sm transition-all ${!isOnline ? 'bg-red-50 border-red-100 text-red-700' : 'bg-slate-50 border-slate-100 text-slate-900'}`}>
                {activeSessionType && (
                  <>
                    <div className="flex items-center gap-1.5 md:gap-2 pr-2 md:pr-3 border-r border-slate-200">
                      <div className="w-1.5 md:w-2 h-1.5 md:h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[8px] md:text-[10px] font-semibold uppercase tracking-widest text-emerald-700">{activeSessionType}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center gap-1.5 md:gap-2">
                  <div className={`w-2 md:w-2.5 h-2 md:h-2.5 rounded-full ${!isOnline ? 'bg-red-500 animate-pulse' : pendingCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <span className="text-[8px] md:text-[10px] font-semibold uppercase tracking-widest">
                    {!isOnline ? 'OFFLINE' : pendingCount > 0 ? `${pendingCount} PENDING` : 'SYNCED'}
                  </span>
                </div>
              </div>
              <div className={`p-1.5 rounded-lg ${isOnline ? 'bg-emerald-50' : 'bg-red-50'}`}>
                {isOnline ? <Wifi className="text-emerald-500" size={14}/> : <WifiOff className="text-red-500" size={14}/>}
              </div>
            </div>

            <div className="hidden lg:block h-8 w-px bg-slate-100"></div>

            <div className="hidden lg:flex items-center gap-3 pl-2">
               <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-900 uppercase leading-none">{user.role}</p>
               </div>
               <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200 hover:border-slate-900 transition-all cursor-pointer">
                  <User size={20} className="text-slate-900" />
               </div>
            </div>
          </div>
        </header>

        {/* OPERATIONAL ALERT LAYER */}
        <div className="px-4 md:px-10 pt-6">
          {showMorningRecovery && (
            <OperationalAlert 
              type="error"
              persistent
              message="🚨 Action Required: Yesterday's session is still open. Please close Meter Readings and perform Stock Take to begin today's work." 
            />
          )}

          {notification && (
            <OperationalAlert 
              type="warning"
              onClose={() => setNotification(null)}
              message={notification} 
            />
          )}
        </div>

        {/* CONTENT SCROLL AREA */}
        <div id="main-scroll-container" onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 md:p-10 pb-24 md:pb-10 custom-scrollbar">
          {activeTab === 'Dashboard'        && <Dashboard onNavigate={setActiveTab} role={user.role} isOnline={isOnline} pendingCount={pendingCount} />}
          {activeTab === 'Session Control'  && <SessionControl onNavigate={setActiveTab} role={user.role} isOnline={isOnline} pendingCount={pendingCount} />}
          {activeTab === 'Insights & Audit' && <MasterDashboard />}
          {activeTab === 'Production Hub'   && <ProductionEntry />}
          {activeTab === 'Point of Sale'     && <ServicePOS role={user.role} />}
          {activeTab === 'Debt Ledger'      && <DebtLedger role={user.role} />}
          {activeTab === 'Purchases'        && <Purchases />}
          {activeTab === 'Stock Take'       && <StockTake role={user.role} />}
          {activeTab === 'Settings'         && <Settings role={user.role} />}
          {activeTab === 'User Management'  && <UserManagement />}
        </div>

        {/* Floating Back to Top Button */}
        {showBackToTop && (
          <button
            onClick={scrollToTop}
            className="fixed bottom-20 right-6 z-[60] bg-slate-900 text-white p-3 rounded-full shadow-2xl transition-all duration-300 hover:bg-slate-800 hover:-translate-y-1 active:scale-95 animate-in fade-in zoom-in duration-300 border border-slate-700/30"
            aria-label="Back to Top"
          >
            <ChevronUp size={20} />
          </button>
        )}

        {/* MOBILE PERSISTENT BOTTOM NAVIGATION BAR */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-lg border-t border-slate-200 flex items-center justify-start gap-1.5 overflow-x-auto scrollbar-none z-50 px-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] pb-safe">
           {menuItems.map(item => {
             const active = activeTab === item.name;
             const isLocked = (activeSessionType === 'Internal' && item.name === 'Point of Sale') || 
                              (activeSessionType === 'External' && item.name === 'Production Hub');
             return (
               <button
                 key={item.name}
                 onClick={() => {
                   if (isLocked) {
                     showNotification(`Access Locked: Active ${activeSessionType} session prevents access to ${item.name}.`);
                   } else if (!activeSessionType && (item.name === 'Production Hub' || item.name === 'Point of Sale')) {
                     showNotification(`⚠️ No Active Session: Please start an Internal or External production session before recording data.`);
                   } else {
                     setActiveTab(item.name);
                   }
                 }}
                 className={`flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                   active 
                   ? 'bg-[#1E3A8A] text-white shadow-sm' 
                   : isLocked 
                     ? 'text-slate-300 opacity-50 cursor-not-allowed' 
                     : 'text-slate-500 hover:bg-slate-50'
                 }`}
               >
                 <item.icon size={14} className="shrink-0" />
                 <span>{item.name}</span>
               </button>
             );
           })}
        </nav>
      </main>
    </div>
  );
}

export default App;

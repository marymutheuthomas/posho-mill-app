import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Activity, ShieldCheck, Factory, 
  ShoppingCart, BookOpen, Settings as SettingsIcon, Lock,
  Wifi, WifiOff, Menu, AlertTriangle, X,
  Zap, ShoppingBag, Search, User, ChevronRight
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './lib/supabase';
import Dashboard from './components/Dashboard';
import ProductionEntry from './components/ProductionEntry';
import Purchases from './components/Purchases';
import ServicePOS from './components/ServicePOS';
import AuditHub from './components/AuditHub';
import SessionControl from './components/SessionControl';
import DebtLedger from './components/DebtLedger';
import StockTake from './components/StockTake';
import Settings from './components/Settings';

import Login from './components/Login';

function App() {
  const [user, setUser] = useState<{ role: 'Admin' | 'Employee' } | null>(null);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeSessionType, setActiveSessionType] = useState<'Internal' | 'External' | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { 
      window.removeEventListener('online', up); 
      window.removeEventListener('offline', down);
    };
  }, []);

  const { data: activeSession } = useQuery({
    queryKey: ['active-session'],
    queryFn: async () => {
      const { data } = await supabase.from('milling_sessions')
        .select('session_type')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    setActiveSessionType(activeSession?.session_type as any || null);
  }, [activeSession]);

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
    { name: 'Debt Ledger', icon: BookOpen, adminOnly: true },
    { name: 'Purchases', icon: ShoppingCart, adminOnly: true },
    { name: 'Settings', icon: SettingsIcon, adminOnly: true },
  ].filter(item => !item.adminOnly || user?.role === 'Admin');

  if (!user) {
    return <Login onLogin={(role) => setUser({ role })} />;
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
            showNotification(`Access Locked: Active ${activeSessionType} session.`);
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
          
          <div className="flex items-center gap-4">
            {/* Mobile Hamburger Trigger */}
            <button 
              onClick={() => setIsDrawerOpen(true)}
              className="md:hidden p-2 -ml-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Menu size={24} className="text-slate-900" />
            </button>

            <div className="hidden md:flex lg:flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
               <span>Mill Console</span>
               <ChevronRight size={12} />
               <span className="text-slate-900">{activeTab}</span>
            </div>
            
            <div className="md:flex lg:hidden items-center">
               <h2 className="text-xs md:text-sm font-black text-slate-900 uppercase truncate max-w-[120px]">{activeTab}</h2>
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
            {activeSessionType && (
              <div className="hidden md:flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full border border-emerald-100 shadow-sm">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest">{activeSessionType} ACTIVE</span>
              </div>
            )}
            
            {activeSessionType && <div className="md:hidden w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-lg shadow-emerald-500/50" />}

            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${isOnline ? 'bg-emerald-50' : 'bg-red-50'}`}>
                {isOnline ? <Wifi className="text-emerald-500" size={14}/> : <WifiOff className="text-red-500" size={14}/>}
              </div>
            </div>

            <div className="hidden lg:block h-8 w-px bg-slate-100"></div>

            <div className="hidden lg:flex items-center gap-3 pl-2">
               <div className="text-right">
                  <p className="text-[10px] font-black text-slate-900 uppercase leading-none">{user.role}</p>
               </div>
               <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200 hover:border-slate-900 transition-all cursor-pointer">
                  <User size={20} className="text-slate-900" />
               </div>
            </div>
          </div>
        </header>

        {/* NOTIFICATION LAYER */}
        {notification && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-8 py-4 rounded-[2rem] font-black flex items-center gap-4 shadow-2xl animate-bounce border-4 border-white/20 backdrop-blur-md">
            <AlertTriangle size={24} />
            <span className="uppercase text-sm tracking-tighter">{notification}</span>
          </div>
        )}

        {/* CONTENT SCROLL AREA */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:p-10 pb-32 md:pb-10 custom-scrollbar">
          {activeTab === 'Dashboard'        && <Dashboard onNavigate={setActiveTab} role={user.role} />}
          {activeTab === 'Session Control'  && <SessionControl onNavigate={setActiveTab} />}
          {activeTab === 'Insights & Audit' && <AuditHub />}
          {activeTab === 'Production Hub'   && <ProductionEntry />}
          {activeTab === 'Point of Sale'     && <ServicePOS />}
          {activeTab === 'Debt Ledger'      && <DebtLedger />}
          {activeTab === 'Purchases'        && <Purchases />}
          {activeTab === 'Stock Take'       && <StockTake role={user.role} />}
          {activeTab === 'Settings'         && <Settings />}
        </div>

        {/* MOBILE BOTTOM NAVIGATION */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-lg border-t border-slate-200 flex justify-around items-center z-50 px-6 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
           {[
             { name: 'Dashboard', icon: LayoutDashboard },
             { name: 'Point of Sale', icon: ShoppingBag, label: 'POS' },
             { name: 'Stock Take', icon: ShieldCheck, label: 'Stock' }
           ].map(item => {
             const active = activeTab === item.name;
             return (
               <button
                 key={item.name}
                 onClick={() => setActiveTab(item.name)}
                 className={`flex flex-col items-center gap-1 transition-all relative ${active ? 'text-slate-900 scale-110' : 'text-slate-400'}`}
               >
                 <item.icon size={22} className={active ? 'text-slate-900' : 'text-slate-400'} />
                 <span className="text-[8px] font-black uppercase tracking-widest">{item.label || item.name}</span>
                 {active && <div className="absolute -top-1 w-1 h-1 bg-slate-900 rounded-full" />}
               </button>
             );
           })}
           <button 
            onClick={() => setIsDrawerOpen(true)}
            className="flex flex-col items-center gap-1 text-slate-400"
           >
              <Menu size={22} />
              <span className="text-[8px] font-black uppercase tracking-widest">Menu</span>
           </button>
        </nav>
      </main>
    </div>
  );
}

export default App;

import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Activity, ClipboardCheck, UserCog, Factory,
  ShoppingCart, BookOpen, Settings as SettingsIcon, LogOut,
  Wifi, WifiOff, X, Menu,
  Zap, ShoppingBag, User, ChevronRight, ChevronUp, AlertTriangle
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useMillingSession } from './hooks/useMillingSession';
import { supabase } from './lib/supabase';
import { db } from './lib/db';
import { setActiveOperator, signOutLocally } from './lib/offlineAuth';
import Dashboard from './components/Dashboard';
import ProductionEntry from './components/ProductionEntry';
import Purchases from './components/Purchases';
import ServicePOS from './components/ServicePOS';
// import AuditHub from './components/AuditHub';
import InsightsAudit from './components/InsightsAudit';
import SessionControl from './components/SessionControl';
import Customers from './components/Customers';
import StockTake from './components/StockTake';
import Settings from './components/Settings';
import OperationalAlert from './components/OperationalAlert';
import StockTakeReminder from './components/StockTakeReminder';
import ErrorBoundary from './components/ErrorBoundary';
import UserManagement from './components/UserManagement';
import Login from './components/Login';
import { btn, navItem, SHELL_X } from './lib/ui';
import { usePendingExceptions } from './hooks/useAuditExceptions';

// Log out is the one red item in the menu: red text, red tint on hover, same size as the nav items
const LOGOUT = 'w-full flex items-center gap-3 min-h-11 px-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors';

/** Logo + name, identical in the side menu and the phone drawer. */
function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center shrink-0">
        <Zap className="text-white" size={16} aria-hidden="true" />
      </div>
      <span className={`${compact ? 'hidden lg:block' : 'block'} text-sm font-bold tracking-tight text-slate-900 truncate`}>Sakhai Posho Mill</span>
    </div>
  );
}

// Screen shown after login and after logout: the till is what staff need first.
const HOME_TAB = 'Point of Sale';

function App() {
  // offline: signed in against the local credential hash, so there is no Supabase session for this operator
  const [user, setUser] = useState<{ id: string; role: 'ADMIN' | 'EMPLOYEE'; offline: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState(HOME_TAB);
  // Full-width till: no sidebar or bottom bar on the POS; the header menu button opens the drawer.
  const posMode = activeTab === 'Point of Sale';
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

  const { data: deadLetterCount = 0 } = useQuery({
    queryKey: ['dead-letter-count'],
    queryFn: async () => await db.dead_letter_queue.count(),
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
        // Prefer the role read from profiles at login; user_metadata is editable by the user themselves
        const cached = await db.offline_credentials.where('userId').equals(session.user.id).first();
        setActiveOperator(session.user.id);
        setUser({
          id: session.user.id,
          role: cached?.role || session.user.user_metadata?.role || 'EMPLOYEE',
          offline: false
        });
      }
    }
    restoreSession();

    return () => { 
      window.removeEventListener('online', up); 
      window.removeEventListener('offline', down);
    };
  }, []);

  // GLOBAL SPEED-MILLING KEYBOARD FOCUS JUMP
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
        
        const form = target.closest('form');
        if (!form) return;
        
        e.preventDefault();
        
        const focusableElements = Array.from(
          form.querySelectorAll('input:not([disabled]):not([type="hidden"]), select:not([disabled]), button[type="submit"]:not([disabled])')
        ) as HTMLElement[];
        
        const currentIndex = focusableElements.indexOf(target);
        if (currentIndex > -1 && currentIndex < focusableElements.length - 1) {
          focusableElements[currentIndex + 1].focus();
        } else if (currentIndex === focusableElements.length - 1 || target.tagName === 'BUTTON') {
          form.requestSubmit();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);


  const { activeSession, stockTakeDueSince } = useMillingSession();
  // Dismissal is per late close: a later late close shows the reminder again.
  const [dismissedReminderFor, setDismissedReminderFor] = useState<string | null>(null);

  useEffect(() => {
    setActiveSessionType(activeSession?.session_type as any || null);
  }, [activeSession]);

  // Temporarily disable the morning recovery banner
  const showMorningRecovery = false;
  const showOfflineSignIn = !!user?.offline && isOnline;
  const showStockTakeReminder = !!stockTakeDueSince && stockTakeDueSince !== dismissedReminderFor && activeTab !== 'Stock Take';

  // Staff can't open Insights & Audit, so they hear about exceptions they triggered here.
  // Soft and dismissible; it comes back only if the number of flags changes.
  const isStaff = !!user && user.role !== 'ADMIN';
  const { data: myFlags = [] } = usePendingExceptions(false, isStaff && isOnline);
  const [dismissedFlagCount, setDismissedFlagCount] = useState(0);
  const showMyFlags = isStaff && myFlags.length > 0 && myFlags.length !== dismissedFlagCount;

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Session Control', icon: Zap },
    { name: 'Insights & Audit', icon: Activity, adminOnly: true },
    { name: 'Production Hub', icon: Factory },
    { name: 'Point of Sale', icon: ShoppingBag },
    { name: 'Stock Take', icon: ClipboardCheck },
    { name: 'Customers', icon: BookOpen },
    { name: 'Purchases', icon: ShoppingCart },
    { name: 'Settings', icon: SettingsIcon },
    { name: 'User Management', icon: UserCog, adminOnly: true },
  ].filter(item => !item.adminOnly || user?.role === 'ADMIN');

  if (!user) {
    return <Login onLogin={(role, id, offline) => { setActiveOperator(id); setUser({ role, id, offline }); }} />;
  }

  const handleLogout = async () => {
    await signOutLocally();
    setUser(null);
    setActiveTab(HOME_TAB);
  };

  const NavButton = ({ item, isMobile = false }: { item: any, isMobile?: boolean }) => {
    const active = activeTab === item.name;

    // Every screen is always reachable; POS and Production explain on-screen if no session is open.
    return (
      <button
        onClick={() => {
          setActiveTab(item.name);
          if (isMobile) setIsDrawerOpen(false);
        }}
        aria-current={active ? 'page' : undefined}
        title={isMobile ? undefined : item.name}
        className={`${navItem(active)} ${isMobile ? '' : 'justify-center lg:justify-start'}`}
      >
        <item.icon size={18} className="shrink-0" />
        <span className={`${isMobile ? 'block' : 'hidden lg:block'} whitespace-nowrap truncate`}>{item.name}</span>
      </button>
    );
  };

  return (
    <div className="flex h-screen bg-canvas font-sans overflow-hidden">
      
      {/* MOBILE DRAWER (OFF-CANVAS MENU) */}
      {isDrawerOpen && (
        <>
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[55] animate-in fade-in duration-300"
            onClick={() => setIsDrawerOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-60 bg-white z-[60] shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="h-12 flex items-center pl-4 pr-2 border-b border-slate-200 justify-between shrink-0">
              <BrandMark />
              <button onClick={() => setIsDrawerOpen(false)} className={btn.icon} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 p-2 space-y-1 overflow-y-auto" aria-label="Main">
              {menuItems.map(item => <NavButton key={item.name} item={item} isMobile />)}
            </nav>
            <div className="p-2 border-t border-slate-200">
              <button onClick={handleLogout} className={LOGOUT}>
                <LogOut size={18} className="shrink-0" />
                <span>Log out</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* PERSISTENT SIDEBAR - Tablet & Desktop */}
      <aside className={`${posMode ? 'hidden' : 'hidden md:flex'} flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out lg:w-52 w-16`}>
        <div className="h-11 flex items-center justify-center lg:justify-start px-3 lg:px-4 border-b border-slate-200 shrink-0">
          <BrandMark compact />
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto custom-scrollbar" aria-label="Main">
          {menuItems.map(item => <NavButton key={item.name} item={item} />)}
        </nav>

        <div className="p-2 border-t border-slate-200 shrink-0">
          <button onClick={handleLogout} title="Log out" className={`${LOGOUT} justify-center lg:justify-start`}>
            <LogOut size={18} className="shrink-0" />
            <span className="hidden lg:block">Log out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-canvas">

        {/* TOP BAR: same white surface and slate-200 border as the side menu and the cards below */}
        <header className={`sticky top-0 z-40 h-10 md:h-11 bg-white border-b border-slate-200 flex items-center justify-between gap-3 ${SHELL_X} shrink-0`}>

          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsDrawerOpen(true)}
              className={`relative after:absolute after:-inset-2 after:content-[''] w-8 h-8 bg-brand hover:bg-brand-hover text-white rounded-lg flex items-center justify-center shrink-0 transition-colors ${posMode ? '' : 'md:hidden'}`}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-0">
               <span>Mill Console</span>
               <ChevronRight size={14} className="shrink-0" />
               <span className="text-slate-900 truncate">{activeTab}</span>
            </div>
            <h2 className="md:hidden text-sm font-semibold text-slate-900 truncate">{activeTab}</h2>
          </div>

          <div className="flex items-center gap-3 md:gap-4 shrink-0">
            <div className="flex items-center gap-2">
              <div role="status" className={`flex items-center gap-2 md:gap-3 px-2.5 py-1 rounded-lg border text-xs font-semibold uppercase tracking-wider ${!isOnline ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                {activeSessionType && (
                  <span className="flex items-center gap-1.5 pr-2 md:pr-3 border-r border-slate-200 text-emerald-700">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full" aria-hidden="true" />
                    <span className="hidden sm:inline">{activeSessionType} shift</span>
                    <span className="sm:hidden">{activeSessionType}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${!isOnline ? 'bg-red-500' : pendingCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
                  {!isOnline ? 'Offline' : pendingCount > 0 ? <><span className="font-mono">{pendingCount}</span> pending</> : 'Synced'}
                </span>
              </div>
              {user.role === 'ADMIN' && deadLetterCount > 0 && (
                <button
                  onClick={() => setActiveTab('Dashboard')}
                  title="Records that failed to sync. Review them on the Dashboard."
                  className="relative after:absolute after:-inset-2 after:content-[''] flex items-center gap-1 px-2 py-1 rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700 transition-all"
                >
                  <AlertTriangle size={12} className="shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wide whitespace-nowrap"><span className="font-mono">{deadLetterCount}</span> failed</span>
                </button>
              )}
              <span className="sr-only">{isOnline ? 'Online' : 'Offline'}</span>
              {isOnline ? <Wifi className="text-emerald-600" size={16} aria-hidden="true" /> : <WifiOff className="text-red-600" size={16} aria-hidden="true" />}
            </div>

            {/* Signed-in role: information only, not a menu */}
            <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <User size={16} className="text-slate-500" aria-hidden="true" />
              {user.role === 'ADMIN' ? 'Admin' : 'Staff'}
            </div>
          </div>
        </header>

        {/* OPERATIONAL ALERT LAYER */}
        {/* Only takes space when something is showing; each banner is a single slim row */}
        {(showOfflineSignIn || showStockTakeReminder || showMyFlags || showMorningRecovery || notification) && (
        <div className={`${SHELL_X} pt-3 space-y-2`}>
          {showMyFlags && (
            <div role="status" className="pl-3 pr-1 py-1 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
              <p className="text-xs font-semibold flex-1 min-w-0">
                <span className="font-mono">{myFlags.length}</span> of your entries {myFlags.length === 1 ? 'is' : 'are'} flagged for admin review
                {myFlags[0]?.description && <span className="font-normal">: {myFlags[0].description}{myFlags.length > 1 ? ' and more' : ''}</span>}.
                {' '}Keep working as normal.
              </p>
              <button onClick={() => setDismissedFlagCount(myFlags.length)} className={btn.icon} aria-label="Dismiss flagged entries notice">
                <X size={16} />
              </button>
            </div>
          )}

          {showOfflineSignIn && (
            <div className="px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex items-center gap-2">
              <p className="text-xs font-semibold flex-1 min-w-0">
                Back online. Sign in again to sync{pendingCount > 0 ? ` ${pendingCount} waiting record${pendingCount === 1 ? '' : 's'}` : ' your records'}.
              </p>
              <button onClick={handleLogout} className="shrink-0 relative after:absolute after:-inset-2 after:content-[''] px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-bold uppercase tracking-wider hover:bg-brand-hover">
                Sign in
              </button>
            </div>
          )}

          {showStockTakeReminder && (
            <StockTakeReminder
              closedAt={stockTakeDueSince}
              onStockTake={() => setActiveTab('Stock Take')}
              onDismiss={() => setDismissedReminderFor(stockTakeDueSince)}
            />
          )}

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
        )}

        {/* CONTENT SCROLL AREA */}
        <div id="main-scroll-container" onScroll={handleScroll} className={`flex-1 overflow-y-auto overflow-x-hidden ${SHELL_X} pt-4 ${posMode ? 'pb-6' : 'pb-20'} md:pb-10 custom-scrollbar`}>
          {/* A crash in one screen shows its error here; the menu keeps working and switching tabs recovers */}
          <ErrorBoundary resetKey={activeTab} label={activeTab}>
          {activeTab === 'Dashboard'        && <Dashboard onNavigate={setActiveTab} role={user.role} isOnline={isOnline} pendingCount={pendingCount} />}
          {activeTab === 'Session Control'  && <SessionControl onNavigate={setActiveTab} role={user.role} isOnline={isOnline} pendingCount={pendingCount} />}
          {activeTab === 'Insights & Audit' && <InsightsAudit role={user.role} />}
          {activeTab === 'Production Hub'   && <ProductionEntry />}
          {activeTab === 'Point of Sale'     && <ServicePOS role={user.role} />}
          {activeTab === 'Customers'        && <Customers role={user.role} />}
          {activeTab === 'Purchases'        && <Purchases />}
          {activeTab === 'Stock Take'       && <StockTake />}
          {activeTab === 'Settings'         && <Settings role={user.role} />}
          {activeTab === 'User Management'  && <UserManagement />}
          </ErrorBoundary>
        </div>

        {/* Floating Back to Top Button */}
        {showBackToTop && (
          <button
            onClick={scrollToTop}
            className="fixed bottom-20 right-6 z-[60] w-12 h-12 flex items-center justify-center bg-brand hover:bg-brand-hover text-white rounded-full shadow-lg transition-colors"
            aria-label="Back to Top"
          >
            <ChevronUp size={20} />
          </button>
        )}

        {/* MOBILE PERSISTENT BOTTOM NAVIGATION BAR (hidden on the POS; the header menu button opens the drawer) */}
        {!posMode && <nav aria-label="Main" className="md:hidden fixed bottom-0 left-0 right-0 h-12 bg-white border-t border-slate-200 flex items-center justify-start gap-1.5 overflow-x-auto scrollbar-none z-50 px-4 pb-safe">
           {menuItems.map(item => {
             const active = activeTab === item.name;
             return (
               <button
                 key={item.name}
                 onClick={() => setActiveTab(item.name)}
                 aria-current={active ? 'page' : undefined}
                 className={`relative after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                   active
                   ? 'bg-brand text-white shadow-sm'
                   : 'text-slate-600 hover:bg-slate-100'
                 }`}
               >
                 <item.icon size={16} className="shrink-0" />
                 <span>{item.name}</span>
               </button>
             );
           })}
        </nav>}
      </main>
    </div>
  );
}

export default App;

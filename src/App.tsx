import { useState, useEffect } from 'react';
import { LayoutDashboard, Factory, ShoppingCart, BookOpen, Settings, Zap, LogOut, User as UserIcon, ShieldCheck, Wifi, WifiOff, Truck } from 'lucide-react';
import { supabase } from './lib/supabase';
import Dashboard from './components/Dashboard';
import ProductionEntry from './components/ProductionEntry';
import StockIn from './components/StockIn';
import ServicePOS from './components/ServicePOS';
import AuditHub from './components/AuditHub';
import StockTransfer from './components/StockTransfer';
import Login from './components/Login';

type UserRole = 'Admin' | 'Employee' | null;

function App() {
  const [role, setRole] = useState<UserRole>(null);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Sync Engine
  useEffect(() => {
    const handleStatusChange = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);

    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  // Sync Logic
  useEffect(() => {
    const processSyncQueue = async () => {
      const queueRaw = localStorage.getItem('mill_sync_queue');
      if (!queueRaw) {
        setPendingSyncCount(0);
        return;
      }

      const queue = JSON.parse(queueRaw);
      setPendingSyncCount(queue.length);

      if (!navigator.onLine || queue.length === 0) return;

      const updatedQueue = [...queue];
      const itemToSync = updatedQueue[0];

      try {
        const { error } = await supabase
          .from(itemToSync.table)
          .insert([itemToSync.data]);

        if (!error) {
          updatedQueue.shift();
          localStorage.setItem('mill_sync_queue', JSON.stringify(updatedQueue));
          setPendingSyncCount(updatedQueue.length);
        }
      } catch (err) {
        console.error("Sync Error:", err);
      }
    };

    const interval = setInterval(processSyncQueue, 3000);
    return () => clearInterval(interval);
  }, [isOnline]);

  // Load session from localStorage on mount
  useEffect(() => {
    const savedRole = localStorage.getItem('mill_user_role') as UserRole;
    if (savedRole) setRole(savedRole);
  }, []);

  const handleLogin = (userRole: UserRole) => {
    setRole(userRole);
    if (userRole) localStorage.setItem('mill_user_role', userRole);
  };

  const handleLogout = () => {
    setRole(null);
    localStorage.removeItem('mill_user_role');
  };

  const allMenuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'Employee'] },
    { name: 'Insights & Audit', icon: ShieldCheck, roles: ['Admin', 'Employee'] },
    { name: 'Production Hub', icon: Factory, roles: ['Admin', 'Employee'] },
    { name: 'Service POS', icon: Zap, roles: ['Admin', 'Employee'] },
    { name: 'Stock In (Purchases)', icon: Factory, roles: ['Admin'] },
    { name: 'Stock Transfers', icon: Truck, roles: ['Admin', 'Employee'] },
    { name: 'Product Sales', icon: ShoppingCart, roles: ['Admin'] },
    { name: 'Debt Ledger', icon: BookOpen, roles: ['Admin'] },
    { name: 'Settings', icon: Settings, roles: ['Admin'] },
  ];

  const menuItems = allMenuItems.filter(item => role && item.roles.includes(role));

  if (!role) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-[#0F172A] font-sans selection:bg-[#06B6D4] selection:text-white">
      {/* Sidebar */}
      <aside className="w-80 bg-[#4F46E5] text-white flex flex-col shadow-[10px_0_30px_rgba(79,70,229,0.1)] z-20">
        <div className="p-8 flex items-center gap-4 border-b border-white/10 bg-black/10">
          <div className="bg-[#06B6D4] p-2 rounded-lg shadow-inner">
            <Factory size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter uppercase leading-none">Posho Mill</h1>
            <p className="text-[10px] text-[#06B6D4] font-bold tracking-[0.2em] uppercase opacity-80 mt-1">Enterprise ERP</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.name}
              onClick={() => setActiveTab(item.name)}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 font-bold tracking-tight text-md ${
                activeTab === item.name
                ? 'bg-white text-[#4F46E5] shadow-[0_8px_20px_rgba(255,255,255,0.15)] transform scale-[1.02] translate-x-1'
                : 'hover:bg-white/10 text-white/70 hover:text-white hover:translate-x-1'
                }`}
            >
              <item.icon size={20} className={activeTab === item.name ? 'text-[#4F46E5]' : 'text-white/50'} />
              {item.name}
            </button>
          ))}
        </nav>

        <div className="p-6 space-y-4">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-6 py-4 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all font-bold text-sm uppercase tracking-widest border border-white/10"
          >
            <LogOut size={16} /> Logout
          </button>
          
          <div className="bg-black/10 rounded-xl py-4 px-4 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[#06B6D4] text-[10px] font-black tracking-widest uppercase">Connectivity</p>
              {isOnline ? (
                <div className="flex items-center gap-1 text-green-400">
                  <Wifi size={10} />
                  <span className="text-[10px] font-bold uppercase">Online</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-yellow-400">
                  <WifiOff size={10} />
                  <span className="text-[10px] font-bold uppercase">Offline</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-[10px] font-bold uppercase tracking-tight">Access: {role}</span>
              {pendingSyncCount > 0 && (
                <span className="bg-orange-500 text-white px-2 py-0.5 rounded text-[10px] font-black animate-pulse">
                  {pendingSyncCount} QUEUED
                </span>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative bg-[#F8FAFC]">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-[#4F46E5] opacity-[0.05] rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[5%] w-[300px] h-[300px] bg-[#06B6D4] opacity-[0.03] rounded-full blur-[100px] pointer-events-none"></div>

        <header className="bg-white/70 backdrop-blur-xl px-12 py-8 border-b border-gray-100 flex justify-between items-center z-10">
          <div>
            <h2 className="text-4xl font-black text-[#0F172A] tracking-tight">{activeTab}</h2>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Management Hub</p>
          </div>
          <div className="flex gap-4">
            <div className="h-12 w-12 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-slate-400 font-black">
              <UserIcon size={20} />
            </div>
            <div className={`h-12 px-6 rounded-2xl ${role === 'Admin' ? 'bg-[#4F46E5]' : 'bg-[#06B6D4]'} text-white flex items-center justify-center font-bold tracking-tight shadow-md`}>
              {role}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-12 relative z-0 pb-32">
          {activeTab === 'Dashboard' && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'Insights & Audit' && <AuditHub />}
          {activeTab === 'Production Hub' && <ProductionEntry onNavigateToService={() => setActiveTab('Service POS')} />}
          {activeTab === 'Service POS' && <ServicePOS />}
          {activeTab === 'Stock In (Purchases)' && <StockIn />}
          {activeTab === 'Stock Transfers' && <StockTransfer />}
          
          {['Product Sales', 'Debt Ledger', 'Settings'].includes(activeTab) && (
            <div className="flex h-full items-center justify-center">
              <div className="text-slate-200 text-2xl font-black tracking-tight uppercase border-4 border-dashed border-slate-100 rounded-3xl p-24 bg-white/50 space-y-4 text-center">
                <div className="text-6xl mb-4">⚙️</div>
                <p>{activeTab} Module</p>
                <div className="bg-primary/5 text-primary/40 px-4 py-2 rounded-full text-sm font-bold">Coming Soon</div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

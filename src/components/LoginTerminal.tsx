import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, User, Lock, ChevronRight, AlertCircle, ShieldCheck } from 'lucide-react';

export default function LoginTerminal() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    
    // Industrial Trick: Automatically append domain for simple username login
    const email = `${username.toLowerCase()}@mill.com`;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      setError('ACCESS DENIED: Invalid Terminal Credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200">
          <div className="p-10 space-y-10">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-[#0f172a] rounded-3xl flex items-center justify-center mx-auto shadow-2xl">
                <Shield className="text-white" size={36} />
              </div>
              <div>
                <h1 className="text-3xl font-black text-[#0f172a] tracking-tighter uppercase">Mill Access</h1>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Authorized Personnel Only</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Terminal Username</label>
                <div className="relative">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="text" required placeholder="ID Number / Name"
                    value={username} onChange={e => setUsername(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-6 pl-14 pr-6 font-black text-slate-900 focus:border-[#0f172a] focus:bg-white transition-all outline-none text-lg h-[64px]" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Secure Key</label>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="password" required placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-6 pl-14 pr-6 font-black text-slate-900 focus:border-[#0f172a] focus:bg-white transition-all outline-none text-lg h-[64px]" 
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-3 border border-red-100 animate-shake text-center justify-center">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <button 
                type="submit" disabled={loading}
                className="w-full py-6 bg-[#0f172a] text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-3 h-[64px]"
              >
                {loading ? 'VERIFYING...' : 'ESTABLISH LINK'}
                <ChevronRight size={20} />
              </button>
            </form>

            <div className="pt-4 text-center">
               <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center justify-center gap-2">
                 <ShieldCheck size={12} className="text-emerald-500" /> SECURE HANDSHAKE ACTIVE
               </p>
            </div>
          </div>
        </div>
        
        <p className="text-center text-[9px] font-black text-slate-500 uppercase tracking-widest mt-8">
          Industrial OS · Node ID: POS-MILL-01
        </p>
      </div>
    </div>
  );
}

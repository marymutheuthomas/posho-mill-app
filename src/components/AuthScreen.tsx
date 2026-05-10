import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, User, Lock, ChevronRight, AlertCircle, ShieldCheck } from 'lucide-react';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    
    // Supabase Auth requires an email. We simulate username by appending @poshomill.local
    const email = `${username.toLowerCase()}@poshomill.local`;

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username, role } }
        });
        if (signUpError) throw signUpError;
        
        // Manual profile insert just in case trigger is not set
        if (data.user) {
          const { error: profError } = await supabase.from('profiles').insert([{
            id: data.user.id,
            username: username,
            role: role
          }]);
          if (profError) console.warn('Profile sync:', profError.message);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decorative Element */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600 rounded-full blur-[160px]"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-emerald-600 rounded-full blur-[160px]"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-black/50 overflow-hidden border border-slate-200">
          <div className="bg-slate-900 p-10 text-center">
            <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-600/20 rotate-3 group-hover:rotate-0 transition-transform">
              <Shield className="text-white" size={36} />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">Posho Mill ERP</h1>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Industrial Access Terminal</p>
          </div>

          <div className="p-10 space-y-8">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              <button onClick={() => setIsLogin(true)} className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isLogin ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'}`}>Sign In</button>
              <button onClick={() => setIsLogin(false)} className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isLogin ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'}`}>Create Account</button>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Terminal Username</label>
                <div className="relative">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="text" required placeholder="Enter Username"
                    value={username} onChange={e => setUsername(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 pl-14 pr-6 font-black text-slate-900 focus:border-blue-600 focus:bg-white transition-all outline-none" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Access Password</label>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="password" required placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 pl-14 pr-6 font-black text-slate-900 focus:border-blue-600 focus:bg-white transition-all outline-none" 
                  />
                </div>
              </div>

              {!isLogin && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Clearance Level</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      type="button" onClick={() => setRole('EMPLOYEE')}
                      className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all border-2 ${role === 'EMPLOYEE' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}
                    >
                      Employee
                    </button>
                    <button 
                      type="button" onClick={() => setRole('ADMIN')}
                      className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all border-2 ${role === 'ADMIN' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}
                    >
                      Manager
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-3 border border-red-100 animate-shake">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <button 
                type="submit" disabled={loading}
                className="w-full py-6 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-3 group"
              >
                {loading ? 'VERIFYING...' : isLogin ? 'ESTABLISH LINK' : 'PROVISION ACCOUNT'}
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            <div className="pt-4 text-center">
               <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center justify-center gap-2">
                 <ShieldCheck size={12} className="text-emerald-500" /> AES-256 Encrypted Session
               </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

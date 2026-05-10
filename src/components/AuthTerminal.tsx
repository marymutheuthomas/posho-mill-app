import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, User, Lock, ChevronRight, UserPlus } from 'lucide-react';

export default function AuthTerminal() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Admin' | 'Employee'>('Admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    
    // Industrial Protocol: Use standard @mill.com domain for secure handshake
    const email = `${username.toLowerCase()}@mill.com`;

    try {
      if (isLogin) {
        // OFFICIAL AUTH: Using Supabase Identity Service
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // PROVISIONING: Using Supabase Auth and linking to profiles
        const { data, error: signUpError } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { username, role } }
        });
        if (signUpError) throw signUpError;
        
        if (data.user) {
          const { error: profError } = await supabase.from('profiles').insert([{
            id: data.user.id,
            username: username,
            role: role
          }]);
          if (profError) console.warn('Profile sync:', profError.message);
          setSuccess('Terminal Link Established. You may now sign in.');
          setIsLogin(true);
        }
      }
    } catch (err: any) {
      setError(err.message === 'Invalid login credentials' ? 'ACCESS DENIED: Invalid Terminal Credentials' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#020617] flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-sm relative z-10 my-auto">
        <div className="bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden border border-white/20">
          <div className="bg-[#0f172a]/90 p-8 text-center border-b border-white/10">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-500/20">
              {isLogin ? <Shield className="text-white" size={32} /> : <UserPlus className="text-white" size={32} />}
            </div>
            <h1 className="text-2xl font-black text-white tracking-tighter uppercase">Mill Terminal</h1>
            <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em] mt-1">Industrial OS · v4.3</p>
          </div>

          <div className="p-8 space-y-6">
            <div className="flex bg-slate-100/50 p-1 rounded-2xl border border-slate-200">
              <button onClick={() => setIsLogin(true)} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isLogin ? 'bg-white text-[#0f172a] shadow-md' : 'text-slate-400'}`}>Sign In</button>
              <button onClick={() => setIsLogin(false)} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${!isLogin ? 'bg-white text-[#0f172a] shadow-md' : 'text-slate-400'}`}>Sign Up</button>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Staff ID / Name</label>
                <div className="relative">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text" required placeholder="Enter ID"
                    value={username} onChange={e => setUsername(e.target.value)}
                    className="w-full bg-white/50 border border-slate-200 rounded-2xl py-4 pl-12 pr-6 font-black text-slate-900 focus:border-[#0f172a] focus:bg-white transition-all outline-none h-[56px] text-sm shadow-inner" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Secure Key</label>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="password" required placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full bg-white/50 border border-slate-200 rounded-2xl py-4 pl-12 pr-6 font-black text-slate-900 focus:border-[#0f172a] focus:bg-white transition-all outline-none h-[56px] text-sm shadow-inner" 
                  />
                </div>
              </div>

              {!isLogin && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Clearance Level</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setRole('Employee')} className={`py-3 rounded-xl text-[9px] font-black uppercase transition-all border-2 ${role === 'Employee' ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white text-slate-400 border-slate-100'}`}>Operator</button>
                    <button type="button" onClick={() => setRole('Admin')} className={`py-3 rounded-xl text-[9px] font-black uppercase transition-all border-2 ${role === 'Admin' ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'bg-white text-slate-400 border-slate-100'}`}>Manager</button>
                  </div>
                </div>
              )}

              {error && <div className="bg-red-500/10 text-red-600 p-3 rounded-xl font-black text-[9px] uppercase flex items-center justify-center gap-2 border border-red-500/20 animate-shake text-center">{error}</div>}
              {success && <div className="bg-emerald-500/10 text-emerald-600 p-3 rounded-xl font-black text-[9px] uppercase flex items-center justify-center gap-2 border border-emerald-500/20 animate-in fade-in">{success}</div>}

              <button 
                type="submit" disabled={loading}
                className="w-full py-5 bg-[#0f172a] text-white rounded-[1.2rem] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 h-[56px] text-xs"
              >
                {loading ? 'VERIFYING...' : isLogin ? 'ESTABLISH LINK' : 'PROVISION ACCOUNT'}
                <ChevronRight size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

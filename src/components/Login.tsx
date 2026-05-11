import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Mail, Shield, User, ChevronRight, AlertCircle, Factory } from 'lucide-react';

interface LoginProps {
  onLogin: (role: 'ADMIN' | 'EMPLOYEE') => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.error("SUPABASE_AUTH_DEBUG:", authError.message);
        throw authError;
      }

      if (authData.user) {
        // Use metadata directly to bypass schema errors
        const role = authData.user.user_metadata?.role || 'EMPLOYEE';
        
        console.log("Logged in as:", role);
        onLogin(role);
      }
    } catch (err: any) {
      setError(`[LOGIN-ERROR]: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#F59E0B]/5 rounded-full blur-[120px]" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-500 border border-slate-800">
            <Factory className="text-slate-900" size={40} />
          </div>
          <h1 className="text-4xl text-white font-light tracking-tighter uppercase mb-2">Sakhai Posho Mill ERP</h1>
          <p className="text-[#F59E0B] font-black uppercase tracking-[0.2em] text-[10px]">Secure Enterprise Access Hub</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 md:p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
          {/* Progress bar for loading state */}
          {loading && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 overflow-hidden">
              <div className="h-full bg-[#F59E0B] animate-pulse w-full" />
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Corporate Email</label>
              <div className="relative group/input">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/input:text-[#F59E0B] transition-colors">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#F59E0B]/50 focus:ring-4 focus:ring-[#F59E0B]/10 transition-all text-base"
                  placeholder="admin@mill.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Secure Key</label>
              <div className="relative group/input">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/input:text-[#F59E0B] transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#F59E0B]/50 focus:ring-4 focus:ring-[#F59E0B]/10 transition-all text-base"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in-95">
                <AlertCircle size={20} className="shrink-0" />
                <p className="text-xs font-black uppercase tracking-tight">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all duration-300 ${loading
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-[#1E3A8A] hover:bg-blue-900 text-white shadow-xl hover:shadow-[#1E3A8A]/20'
                }`}
            >
              {loading ? (
                'Syncing Terminal...'
              ) : (
                <>
                  Establish Connection <ChevronRight size={20} />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-white/5 grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1 text-[#F59E0B]">
                <Shield size={12} />
                <span className="text-[10px] font-black uppercase tracking-widest">Master Admin</span>
              </div>
              <p className="text-[9px] font-bold text-slate-600 uppercase">Registry Control</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1 text-slate-400">
                <User size={12} className="lucide lucide-user" />
                <span className="text-[10px] font-black uppercase tracking-widest">Employee</span>
              </div>
              <p className="text-[9px] font-bold text-slate-600 uppercase">Standard Ops</p>
            </div>
          </div>
        </div>

        <p className="text-center mt-8 text-slate-600 font-bold text-[10px] uppercase tracking-widest">
           v4.3 Industrial ERP · Nairobi Node
        </p>
      </div>
    </div>
  );
}

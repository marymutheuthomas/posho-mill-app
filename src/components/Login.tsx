import { useState } from 'react';
import { Lock, User, ShieldCheck, Loader2, Factory } from 'lucide-react';

interface LoginProps {
  onLogin: (role: 'Admin' | 'Employee') => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    setTimeout(() => {
      if (username.toLowerCase() === 'admin' && password === 'admin123') {
        onLogin('Admin');
      } else if (username.toLowerCase() === 'employee' && password === 'staff123') {
        onLogin('Employee');
      } else {
        setError('Invalid credentials. Use admin/admin123 or employee/staff123');
      }
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#4F46E5] opacity-[0.05] rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[5%] w-[400px] h-[400px] bg-[#06B6D4] opacity-[0.03] rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-700">
        <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#4F46E5]/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
          
          <div className="text-center mb-10">
            <div className="bg-[#4F46E5] w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-[#4F46E5]/20">
              <Factory className="text-white" size={40} />
            </div>
            <h1 className="text-3xl font-black text-[#0F172A] uppercase tracking-tighter mb-2">Mill Access</h1>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">Authorized Personnel Only</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">User Identity</label>
              <div className="relative">
                <User className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input
                  type="text"
                  placeholder="Username"
                  className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-2xl pl-16 pr-6 py-5 font-bold focus:border-[#4F46E5] outline-none transition-all"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Security Key</label>
              <div className="relative">
                <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-2xl pl-16 pr-6 py-5 font-bold focus:border-[#4F46E5] outline-none transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-bold border-l-4 border-red-500 animate-shake">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#4F46E5] hover:bg-[#3730A3] text-white font-black py-6 rounded-2xl flex items-center justify-center gap-4 transition-all hover:scale-[1.02] shadow-xl text-xl uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : (
                <>
                  <ShieldCheck size={24} className="text-[#06B6D4]" />
                  Verify Access
                </>
              )}
            </button>
          </form>

          <p className="text-center mt-8 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            Encryption: 256-Bit SSL Secured
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Shield, User as UserIcon, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react';

interface Profile {
  id: string;
  username: string;
  role: 'Admin' | 'Employee';
  created_at: string;
}

export default function UserManagement() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Admin' | 'Employee'>('Employee');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function fetchProfiles() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setProfiles(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setIsProcessing(true);

    // Industrial Protocol: Append internal domain for staff IDs
    const email = `${username.toLowerCase()}@mill.com`;

    try {
      // 1. Create Auth User
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
            role: role
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: profError } = await supabase.from('profiles').insert([{
          id: authData.user.id,
          username: username,
          role: role
        }]);
        if (profError) console.warn('Profile sync:', profError.message);
      }

      setSuccess(`Staff '${username}' provisioned successfully.`);
      setUsername(''); setPassword('');
      fetchProfiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteProfile = async (id: string, name: string) => {
    if (!confirm(`REVOKE ACCESS: Are you sure you want to remove ${name}?`)) return;
    
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      setSuccess(`Access revoked for ${name}.`);
      fetchProfiles();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Access Management</h1>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">User Registry · Role Assignment · Security Hub</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-xl">
           <ShieldCheck size={20} className="text-emerald-400" />
           <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Admin Clearance Verified</span>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 p-6 rounded-2xl font-black flex items-center gap-4 animate-in fade-in"><AlertTriangle size={24}/>{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-6 rounded-2xl font-black flex items-center gap-4 animate-in fade-in"><ShieldCheck size={24}/>{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Create User Form */}
        <div className="lg:col-span-1">
          <div className="mill-card p-8 bg-white border-slate-100 shadow-2xl space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                <UserPlus className="text-white" size={20} />
              </div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Provision Account</h2>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-6">

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Staff Username / ID</label>
                <input 
                  type="text" required value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. OPERATOR_01" 
                  className="mill-input w-full bg-slate-50 border-slate-100 font-black h-[56px]" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Temporary Password</label>
                <input 
                  type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="mill-input w-full bg-slate-50 border-slate-100 font-black h-[56px]" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Security Role</label>
                <div className="grid grid-cols-2 gap-4">
                   <button 
                    type="button" 
                    onClick={() => setRole('Employee')}
                    className={`py-4 rounded-xl text-[10px] font-black uppercase transition-all border-2 ${role === 'Employee' ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-400 border-slate-100'}`}
                   >
                     Employee
                   </button>
                   <button 
                    type="button" 
                    onClick={() => setRole('Admin')}
                    className={`py-4 rounded-xl text-[10px] font-black uppercase transition-all border-2 ${role === 'Admin' ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-400 border-slate-100'}`}
                   >
                     Manager
                   </button>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isProcessing}
                className="w-full h-[60px] bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-black transition-all disabled:opacity-50"
              >
                {isProcessing ? 'PROVISIONING...' : 'CREATE USER'}
              </button>
            </form>
          </div>
        </div>

        {/* User List */}
        <div className="lg:col-span-2">
          <div className="mill-card bg-white border-slate-100 shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <Shield className="text-slate-400" size={20} />
                 <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Active Personnel</h2>
               </div>
               <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-4 py-2 rounded-full uppercase">{profiles.length} Total Users</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">User Details</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Security Level</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                    <th className="px-8 py-5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {profiles.map(profile => (
                    <tr key={profile.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                            <UserIcon className="text-slate-400" size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 uppercase">{profile.username}</p>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                               <Shield size={10} /> Access Level: {profile.role}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${profile.role === 'Admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                          {profile.role === 'Admin' ? 'MANAGER' : 'OPERATOR'}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase">
                        {new Date(profile.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-8 py-6 text-right">
                         <button 
                          onClick={() => handleDeleteProfile(profile.id, profile.username)}
                          className="text-slate-300 hover:text-red-600 transition-colors p-2"
                         >
                           <Trash2 size={20} />
                         </button>
                      </td>
                    </tr>
                  ))}
                  {profiles.length === 0 && !loading && (
                    <tr>
                      <td colSpan={4} className="p-20 text-center font-black text-slate-300 uppercase tracking-widest italic opacity-50">No users found in registry</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

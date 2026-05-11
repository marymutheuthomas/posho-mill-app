import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseKey } from '../lib/supabase';
import { 
  UserPlus, Shield, User as UserIcon, Trash2, 
  ShieldCheck, AlertTriangle, Key, Mail, ChevronRight,
  Pencil, Save, X, Eye, EyeOff
} from 'lucide-react';

const authClient = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

interface Profile {
  id: string;
  username: string;
  role: 'ADMIN' | 'EMPLOYEE';
  display_password?: string;
  created_at: string;
}

export default function UserManagement() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // New User Form State
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  const [isProcessing, setIsProcessing] = useState(false);

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Profile>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    checkAdmin();
    fetchProfiles();
  }, []);

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setIsAdmin(false);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    setIsAdmin(profile?.role === 'ADMIN');
  }

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

    try {
      const { data: authData, error: authError } = await authClient.auth.signUp({
        email,
        password,
        options: { data: { username, role } }
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: profError } = await supabase.from('profiles').insert([{
          id: authData.user.id,
          username: username,
          role: role,
          display_password: password // Store for admin visibility
        }]);
        
        if (profError) throw profError;

        setSuccess(`Account created for ${username}. Password saved to registry.`);
        setUsername(''); setPassword(''); setEmail('');
        fetchProfiles();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const startEdit = (profile: Profile) => {
    setEditingId(profile.id);
    setEditForm(profile);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: editForm.username,
          role: editForm.role,
          display_password: editForm.display_password
        })
        .eq('id', editingId);

      if (error) throw error;
      
      setSuccess("Profile updated successfully.");
      setEditingId(null);
      fetchProfiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
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

  const togglePasswordVisibility = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (isAdmin === false) return <div className="p-20 text-center font-black text-red-500 uppercase">Access Denied</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 pb-10">
        <div>
          <h1 className="text-4xl font-light text-[#1E3A8A] uppercase tracking-tighter">User Registry</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">Manage Access, Roles & Credentials</p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-slate-200 px-6 py-3 rounded-2xl shadow-sm">
           <ShieldCheck size={18} className="text-[#F59E0B]" />
           <span className="text-[11px] font-black uppercase tracking-widest text-[#1E3A8A]">Master Control Enabled</span>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-6 rounded-2xl font-black flex items-center gap-4 animate-in fade-in"><AlertTriangle size={20}/>{error}</div>}
      {success && <div className="bg-emerald-50 text-emerald-700 p-6 rounded-2xl font-black flex items-center gap-4 animate-in fade-in"><ShieldCheck size={20}/>{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Create Form */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#1E3A8A] rounded-xl flex items-center justify-center text-white shadow-lg">
                <UserPlus size={20} />
              </div>
              <h2 className="text-lg font-black text-[#1E3A8A] uppercase tracking-tight">Provision Staff</h2>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1">Email</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mill-input w-full bg-[#F8FAFC] border-slate-100 h-12 text-sm" placeholder="staff@mill.com" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1">Username</label>
                <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="mill-input w-full bg-[#F8FAFC] border-slate-100 h-12 text-sm" placeholder="e.g. faith_01" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1">Password</label>
                <input type="text" required value={password} onChange={e => setPassword(e.target.value)} className="mill-input w-full bg-[#F8FAFC] border-slate-100 h-12 text-sm" placeholder="Temporary password" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1">Role</label>
                <select value={role} onChange={e => setRole(e.target.value as any)} className="mill-input w-full bg-[#F8FAFC] border-slate-100 h-12 text-sm">
                  <option value="EMPLOYEE">EMPLOYEE</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              <button type="submit" disabled={isProcessing} className="w-full h-14 bg-[#1E3A8A] text-white rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-blue-900 transition-all flex items-center justify-center gap-2">
                {isProcessing ? 'CREATING...' : 'PROVISION ACCOUNT'}
                <ChevronRight size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* User Table */}
        <div className="lg:col-span-8">
          <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-xl overflow-hidden">
            <div className="p-8 border-b border-slate-50 bg-[#F8FAFC]/50 flex items-center justify-between">
               <h2 className="text-xl font-black text-[#1E3A8A] uppercase tracking-tight flex items-center gap-3">
                 <UserIcon size={20} /> Staff Registry
               </h2>
               <div className="text-[10px] font-black text-slate-400 uppercase bg-white px-4 py-2 rounded-full border border-slate-100">{profiles.length} Active Users</div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#F8FAFC]/30">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">Identity</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">Role</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">Password</th>
                    <th className="px-8 py-5 border-b border-slate-50"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {profiles.map(p => (
                    <tr key={p.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-8 py-6">
                        {editingId === p.id ? (
                          <input 
                            type="text" 
                            value={editForm.username} 
                            onChange={e => setEditForm({...editForm, username: e.target.value})}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-sm font-bold w-full"
                          />
                        ) : (
                          <div>
                            <p className="text-sm font-black text-[#1E3A8A] uppercase">{p.username}</p>
                            <p className="text-[9px] font-bold text-slate-400">ID: {p.id.substring(0,8)}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        {editingId === p.id ? (
                          <select 
                            value={editForm.role} 
                            onChange={e => setEditForm({...editForm, role: e.target.value as any})}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-xs font-bold w-full"
                          >
                            <option value="EMPLOYEE">EMPLOYEE</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        ) : (
                          <span className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${p.role === 'ADMIN' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                            {p.role}
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          {editingId === p.id ? (
                            <input 
                              type="text" 
                              value={editForm.display_password} 
                              onChange={e => setEditForm({...editForm, display_password: e.target.value})}
                              className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-sm font-mono w-full"
                            />
                          ) : (
                            <>
                              <span className="text-xs font-mono font-bold text-slate-600 bg-slate-50 px-3 py-1 rounded-md border border-slate-100">
                                {showPasswords[p.id] ? p.display_password || '********' : '••••••••'}
                              </span>
                              <button onClick={() => togglePasswordVisibility(p.id)} className="text-slate-300 hover:text-slate-900 transition-colors">
                                {showPasswords[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingId === p.id ? (
                            <>
                              <button onClick={handleUpdate} className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"><Save size={18}/></button>
                              <button onClick={() => setEditingId(null)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg transition-all"><X size={18}/></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(p)} className="p-2 text-slate-300 hover:text-[#F59E0B] rounded-lg transition-all"><Pencil size={18}/></button>
                              <button onClick={() => handleDelete(p.id, p.username)} className="p-2 text-slate-200 hover:text-red-500 rounded-lg transition-all"><Trash2 size={18}/></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase, signupClient } from '../lib/supabase';
import {
  UserPlus, Trash2,
  ShieldCheck, AlertTriangle,
  Pencil, Save, X, RotateCcw, CheckCircle
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useDataMutation } from '../hooks/useDataMutation';
import { btn } from '../lib/ui';



interface Profile {
  id: string;
  username: string;
  email?: string;
  role: 'ADMIN' | 'EMPLOYEE';
  created_at: string;
}

export default function UserManagement() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // New User Form State
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Profile>>({});

  useEffect(() => {
    checkAdmin();
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

  // 1. Data Fetching
  const { data: profiles = [], isLoading: loading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      // Explicit columns: never pull credential fields into the browser
      const { data, error } = await supabase.from('profiles').select('id, username, role, created_at').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Profile[];
    },
    staleTime: 1000 * 60 * 30,
  });

  // 2. Mutations
  const createUserMutation = useDataMutation({
    type: 'user_creation',
    queryKey: ['profiles'],
    requiresOnline: true,
    mutationFn: async (payload: any) => {
      // Isolated client: signing up on the main client would log the admin out
      const { data: authData, error: authError } = await signupClient.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: { data: { username: payload.username, role: payload.role } }
      });
      if (authError) throw authError;

      if (authData.user) {
        const { error: profileError } = await supabase.from('profiles').update({
          username: payload.username,
          role: payload.role
        }).eq('id', authData.user.id);
        if (profileError) throw profileError;
      }
      return authData;
    },
    onSuccess: (res) => {
      if (res.offline) {
        setSuccess('OFFLINE MODE: User creation queued.');
      } else {
        setSuccess('User registered and synced.');
      }
      setEmail(''); setUsername(''); setPassword(''); setRole('EMPLOYEE');
    },
    onError: (err: any) => setError(err.message || 'User registration failed.')
  });

  const updateProfileMutation = useDataMutation({
    type: 'user_update',
    queryKey: ['profiles'],
    mutationFn: async (payload) => {
      const { id, ...updates } = payload;
      const { error } = await supabase.from('profiles').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (res) => {
      if (res.offline) setSuccess('OFFLINE MODE: Update queued.');
      else setSuccess('Profile updated successfully.');
      setEditingId(null);
    }
  });

  const deleteProfileMutation = useDataMutation({
    type: 'user_delete',
    queryKey: ['profiles'],
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (res) => {
      if (res.offline) setSuccess('OFFLINE MODE: Deletion queued.');
      else setSuccess('User deleted.');
    }
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    createUserMutation.mutate({ email, username, password, role });
  };

  const startEdit = (p: Profile) => {
    setEditingId(p.id);
    setEditForm({ username: p.username, role: p.role });
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    updateProfileMutation.mutate({ id: editingId, ...editForm });
  };

  if (isAdmin === false) return <div className="p-20 text-center font-black text-red-500 uppercase tracking-widest">Access Denied: Admin Privileges Required</div>;
  if (loading || isAdmin === null) return <div className="p-20 text-center font-black text-slate-300 uppercase tracking-widest animate-pulse">Synchronizing Auth Registry...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl">
            <ShieldCheck className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">User Management</h1>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Admin Registry & Access Control</p>
          </div>
        </div>
      </div>

      {(error || createUserMutation.error) && (
        <div className="bg-red-600 text-white p-6 rounded-2xl font-black flex items-center gap-4 shadow-xl">
          <AlertTriangle size={24} />
          {error || (createUserMutation.error as any)?.message}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-900 p-6 rounded-2xl font-black flex items-center gap-4 shadow-xl">
          <CheckCircle size={24} />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-1">
          <div className="mill-card p-8 bg-white border-slate-100 shadow-xl sticky top-8">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-2">
              <UserPlus size={16} /> Provision New Account
            </h2>
            <form onSubmit={handleCreateUser} className="space-y-6">
              <div className="space-y-4">
                <input type="text" required placeholder="Full Name / Username" className="mill-input w-full" value={username} onChange={e => setUsername(e.target.value)} />
                <input type="email" required placeholder="Corporate Email" className="mill-input w-full" value={email} onChange={e => setEmail(e.target.value)} />
                <input type="password" required placeholder="Temporary Password" className="mill-input w-full" value={password} onChange={e => setPassword(e.target.value)} />
                <select className="mill-input w-full" value={role} onChange={e => setRole(e.target.value as any)}>
                  <option value="EMPLOYEE">Mill Employee</option>
                  <option value="ADMIN">System Administrator</option>
                </select>
              </div>
              <button disabled={createUserMutation.isPending} className={`${btn.primary} w-full`}>
                {createUserMutation.isPending ? <RotateCcw className="animate-spin" size={16} /> : <UserPlus size={16} />}
                {createUserMutation.isPending ? 'PROVISIONING...' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="mill-card bg-white border-slate-100 shadow-xl overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Active Staff Registry</h2>
              <span className="bg-slate-100 px-3 py-1 rounded-full text-[11px] font-black text-slate-500 uppercase">{profiles.length} Accounts</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Staff Identity</th>
                    <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Access Role</th>
                    <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                    <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {profiles.map(p => (
                    <tr key={p.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6">
                        {editingId === p.id ? (
                          <input type="text" className="mill-input py-2" value={editForm.username} onChange={e => setEditForm({ ...editForm, username: e.target.value })} />
                        ) : (
                          <div>
                            <p className="text-sm font-black text-slate-900">{p.username}</p>
                            <p className="text-[11px] font-bold text-slate-400 uppercase">{p.email || 'No email set'}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        {editingId === p.id ? (
                          <select className="mill-input py-2" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value as any })}>
                            <option value="EMPLOYEE">EMPLOYEE</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-widest ${p.role === 'ADMIN' ? 'bg-brand-soft text-brand' : 'bg-slate-100 text-slate-600'}`}>
                            {p.role}
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-xs font-bold text-slate-400">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingId === p.id ? (
                            <>
                              <button onClick={handleUpdate} className={btn.icon} aria-label="Save user"><Save size={16} /></button>
                              <button onClick={() => setEditingId(null)} className={btn.icon} aria-label="Cancel edit"><X size={16} /></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(p)} className={btn.icon} aria-label="Edit user"><Pencil size={16} /></button>
                              <button onClick={() => deleteProfileMutation.mutate({ id: p.id })} className={btn.iconDanger} aria-label="Delete user"><Trash2 size={16} /></button>
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

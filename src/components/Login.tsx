import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Zap, Eye, EyeOff, AlertCircle, WifiOff } from 'lucide-react';
import { rememberOfflineCredential, verifyOfflineCredential } from '../lib/offlineAuth';
import { isNetworkError } from '../lib/network';
import { FIELD, FIELD_LABEL, btn } from '../lib/ui';

interface LoginProps {
  onLogin: (role: 'ADMIN' | 'EMPLOYEE', id: string, offline: boolean) => void;
}

// A server that cannot be reached must not leave the cashier staring at a spinner:
// after this long we fall back to offline sign-in, the same as with no internet at all.
const SIGN_IN_TIMEOUT_MS = 8000;
const PROFILE_TIMEOUT_MS = 5000;

class TimeoutError extends Error {}
const withTimeout = <T,>(p: PromiseLike<T>, ms: number) =>
  Promise.race([Promise.resolve(p), new Promise<never>((_, reject) => setTimeout(() => reject(new TimeoutError('timeout')), ms))]);

// Supabase's messages, said the way a cashier would understand them
function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('email not confirmed')) return "This account's email has not been confirmed yet. Ask an admin.";
  if (m.includes('too many') || m.includes('rate limit')) return 'Too many attempts. Wait a minute, then try again.';
  return message;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const offlineNow = !navigator.onLine;

  const signInOffline = async (why: string) => {
    const result = await verifyOfflineCredential(email, password);
    if (!result.ok) throw new Error(`${why} ${result.reason}`);
    onLogin(result.credential.role, result.credential.userId, true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // No internet: check against the protected copy saved at this person's last online sign-in
      if (!navigator.onLine) {
        await signInOffline('No internet.');
        return;
      }

      let authData, authError;
      try {
        ({ data: authData, error: authError } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }), SIGN_IN_TIMEOUT_MS));
      } catch (err) {
        if (err instanceof TimeoutError) { await signInOffline("Can't reach the server."); return; }
        throw err;
      }

      if (authError) {
        // Online on paper but the server cannot be reached: same fallback as offline
        if (authError.name === 'AuthRetryableFetchError' || isNetworkError(authError)) {
          await signInOffline("Can't reach the server.");
          return;
        }
        throw new Error(friendly(authError.message));
      }

      if (authData?.user) {
        // Role comes from profiles; if that lookup is slow, fall back so sign-in still completes
        let profile: { role?: string; username?: string } | null = null;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
          const { data } = await supabase.from('profiles').select('role, username')
            .eq('id', authData.user.id).abortSignal(controller.signal).single();
          clearTimeout(timer);
          profile = data;
        } catch { /* keep the fallback role below */ }

        const role = (profile?.role || authData.user.user_metadata?.role || 'EMPLOYEE') as 'ADMIN' | 'EMPLOYEE';

        // Save a salted hash (never the password) so this person can sign in here offline later
        try {
          await rememberOfflineCredential({
            userId: authData.user.id,
            username: profile?.username || email.split('@')[0],
            email,
            role,
          }, password);
        } catch (cacheErr) {
          console.warn('Offline sign-in could not be enabled on this device:', cacheErr);
        }

        onLogin(role, authData.user.id, false);
      }
    } catch (err) {
      setError((err as Error).message || 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center mb-3 shadow-sm">
            <Zap className="text-white" size={28} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sakhai Posho Mill</h1>
          <p className="text-sm text-slate-600 mt-1">Sign in to start your shift</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-6">
          {offlineNow && (
            <p role="status" className="mb-4 flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900">
              <WifiOff size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              No internet. You can still sign in if you have signed in on this device before.
            </p>
          )}

          <form onSubmit={handleLogin} className="space-y-4" noValidate={false}>
            <div>
              <label htmlFor="login-email" className={FIELD_LABEL}>Email</label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="login-password" className={FIELD_LABEL}>Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${FIELD} !pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className={`${btn.icon} absolute right-0.5 top-1/2 -translate-y-1/2`}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
                <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className={`${btn.primary} w-full`}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center mt-4 text-xs text-slate-500">Forgot your password? Ask an admin to reset it.</p>
      </div>
    </main>
  );
}

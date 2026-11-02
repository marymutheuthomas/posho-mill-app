import { db, type OfflineCredential } from './db';
import { supabase } from './supabase';

// Offline login checks a salted PBKDF2 hash cached at the operator's last online login.
// The password itself is never stored, locally or in the database.
const ITERATIONS = 310_000; // OWASP recommendation for PBKDF2-HMAC-SHA256
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // re-authenticate online at least monthly

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

// WebCrypto only exists in secure contexts (https or localhost).
export const canUseOfflineLogin = () => typeof crypto !== 'undefined' && !!crypto.subtle;

async function deriveHash(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function rememberOfflineCredential(
  identity: Pick<OfflineCredential, 'userId' | 'username' | 'role'> & { email: string },
  password: string
) {
  if (!canUseOfflineLogin()) return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(password, salt, ITERATIONS);
  await db.offline_credentials.put({
    email: normalizeEmail(identity.email),
    userId: identity.userId,
    username: identity.username,
    role: identity.role,
    salt: toBase64(salt),
    hash: toBase64(hash),
    iterations: ITERATIONS,
    verifiedAt: Date.now(),
  });
}

export type OfflineLoginResult =
  | { ok: true; credential: OfflineCredential }
  | { ok: false; reason: string };

export async function verifyOfflineCredential(email: string, password: string): Promise<OfflineLoginResult> {
  if (!canUseOfflineLogin()) {
    return { ok: false, reason: 'Offline login needs a secure (https) connection to this terminal.' };
  }
  const credential = await db.offline_credentials.get(normalizeEmail(email));
  if (!credential) {
    return { ok: false, reason: 'This account has not signed in online on this terminal yet.' };
  }
  if (Date.now() - credential.verifiedAt > MAX_AGE_MS) {
    return { ok: false, reason: 'Offline access expired. Sign in once while online to renew it.' };
  }
  const hash = await deriveHash(password, fromBase64(credential.salt), credential.iterations);
  if (!constantTimeEqual(hash, fromBase64(credential.hash))) {
    return { ok: false, reason: 'Incorrect email or password.' };
  }
  return { ok: true, credential };
}

// —— Who is operating this terminal (stamped as recorded_by) ———————————————————————
// After an offline login the stored Supabase token may belong to someone else, or be absent,
// so attribution follows the operator who actually signed in.
let activeOperatorId: string | null = null;
export const setActiveOperator = (userId: string | null) => { activeOperatorId = userId; };
export const getActiveOperatorId = () => activeOperatorId;

// supabase.auth.signOut() keeps the session when the revoke request cannot reach the server,
// so clear the persisted token ourselves to make logout work offline too.
export async function signOutLocally() {
  setActiveOperator(null);
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    const storageKey = (supabase.auth as unknown as { storageKey: string }).storageKey;
    localStorage.removeItem(storageKey);
  }
}

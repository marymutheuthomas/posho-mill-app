import Dexie, { type Table } from 'dexie';

export type TransactionType =
  | 'sale'
  | 'sale_update'
  | 'sale_delete'
  | 'repayment'
  | 'customer_creation'
  | 'purchase'
  | 'stock_take'
  | 'user_creation'
  | 'user_update'
  | 'user_delete'
  | 'production_log'
  | 'milling_session'
  | 'milling_session_update'
  | 'expense'
  | 'daily_audit';

export interface PendingTransaction {
  id?: number;
  type: TransactionType;
  payload: any;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

export interface SyncFailure {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

// Records that failed to sync MAX_RETRIES times. Kept for admin review instead of being dropped.
export interface DeadLetter {
  id?: number;
  type: TransactionType;
  payload: any;
  timestamp: number;   // when the operator originally recorded it
  failedAt: number;    // when it was moved here
  attempts: number;
  error: SyncFailure;
}

// Offline login verifier: a salted PBKDF2 hash, never the password itself.
export interface OfflineCredential {
  email: string;        // normalized, primary key
  userId: string;
  username: string;
  role: 'ADMIN' | 'EMPLOYEE';
  salt: string;         // base64
  hash: string;         // base64 PBKDF2-SHA256
  iterations: number;
  verifiedAt: number;   // last successful online login
}

export class OfflineDB extends Dexie {
  pendingTransactions!: Table<PendingTransaction>;
  dead_letter_queue!: Table<DeadLetter>;
  offline_credentials!: Table<OfflineCredential>;

  constructor() {
    super('PoshoMillOfflineDB');
    this.version(2).stores({
      pendingTransactions: '++id, type, timestamp',
      profiles: 'id, username, email, role'
    });
    this.version(3).stores({
      pendingTransactions: '++id, type, timestamp',
      profiles: 'id, username, email, role',
      dead_letter_queue: '++id, type, failedAt'
    });
    // v4: drop the profiles cache, which held plain-text passwords for offline login.
    this.version(4).stores({
      pendingTransactions: '++id, type, timestamp',
      profiles: null,
      dead_letter_queue: '++id, type, failedAt',
      offline_credentials: 'email, userId'
    });
  }
}

export const db = new OfflineDB();

// RFC 4122 v4. crypto.randomUUID only exists in secure contexts (https/localhost),
// so terminals opened over plain-http LAN IPs fall back to getRandomValues.
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

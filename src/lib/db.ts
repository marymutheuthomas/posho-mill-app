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

export interface CachedProfile {
  id: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
  display_password?: string;
  created_at: string;
}

export class OfflineDB extends Dexie {
  pendingTransactions!: Table<PendingTransaction>;
  profiles!: Table<CachedProfile>;
  dead_letter_queue!: Table<DeadLetter>;

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

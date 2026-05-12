import Dexie, { type Table } from 'dexie';

export interface PendingTransaction {
  id?: number;
  type: 'sale' | 'repayment' | 'purchase' | 'stock_take' | 'user_creation' | 'user_update' | 'user_delete';
  payload: any;
  timestamp: number;
  retryCount: number;
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

  constructor() {
    super('PoshoMillOfflineDB');
    this.version(2).stores({
      pendingTransactions: '++id, type, timestamp',
      profiles: 'id, username, email, role'
    });
  }
}

export const db = new OfflineDB();

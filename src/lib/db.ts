import Dexie, { type Table } from 'dexie';

export interface PendingTransaction {
  id?: number;
  type: 'sale' | 'repayment' | 'purchase' | 'stock_take';
  payload: any;
  timestamp: number;
  retryCount: number;
}

export class OfflineDB extends Dexie {
  pendingTransactions!: Table<PendingTransaction>;

  constructor() {
    super('PoshoMillOfflineDB');
    this.version(1).stores({
      pendingTransactions: '++id, type, timestamp'
    });
  }
}

export const db = new OfflineDB();

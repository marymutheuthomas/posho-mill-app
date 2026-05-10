import { supabase } from './supabase';

interface SyncItem {
  id: string;
  table: string;
  method: 'insert' | 'update' | 'rpc';
  payload: any;
  timestamp: number;
}

const QUEUE_KEY = 'posho_sync_queue';

export const syncQueue = {
  get: (): SyncItem[] => JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'),
  
  add: (table: string, method: 'insert' | 'update' | 'rpc', payload: any) => {
    const queue = syncQueue.get();
    const newItem: SyncItem = {
      id: crypto.randomUUID(),
      table,
      method,
      payload,
      timestamp: Date.now(),
    };
    localStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, newItem]));
    return newItem;
  },

  process: async () => {
    if (!navigator.onLine) return;
    
    const queue = syncQueue.get();
    if (queue.length === 0) return;

    console.log(`[SyncEngine] Processing ${queue.length} offline items...`);
    
    const remaining: SyncItem[] = [];

    for (const item of queue) {
      try {
        let error;
        if (item.method === 'rpc') {
          const { error: err } = await supabase.rpc(item.table, item.payload);
          error = err;
        } else if (item.method === 'insert') {
          const { error: err } = await supabase.from(item.table).insert([item.payload]);
          error = err;
        } else if (item.method === 'update') {
          const { error: err } = await supabase.from(item.table).update(item.payload).eq('id', item.payload.id);
          error = err;
        }

        if (error) {
          console.error(`[SyncEngine] Failed item ${item.id}:`, error);
          remaining.push(item);
        }
      } catch (e) {
        remaining.push(item);
      }
    }

    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    window.dispatchEvent(new CustomEvent('sync_complete', { detail: { remaining: remaining.length } }));
  }
};

// Periodically check queue
setInterval(() => syncQueue.process(), 30000);
window.addEventListener('online', () => syncQueue.process());

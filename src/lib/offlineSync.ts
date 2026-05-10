import { db } from './db';
import { supabase } from './supabase';

export async function syncOfflineData() {
  if (!navigator.onLine) return;

  const pending = await db.pendingTransactions.toArray();
  if (pending.length === 0) return;

  console.log(`[Offline Sync] Attempting to sync ${pending.length} records...`);

  for (const record of pending) {
    try {
      let error;
      
      switch (record.type) {
        case 'sale':
          ({ error } = await supabase.from('sales_transactions').insert([record.payload]));
          break;
        case 'repayment':
          ({ error } = await supabase.from('repayments').insert([record.payload]));
          break;
        case 'purchase':
          ({ error } = await supabase.from('purchases').insert([record.payload]));
          break;
        case 'stock_take':
          ({ error } = await supabase.from('stock_take_history').insert([record.payload]));
          break;
      }

      if (!error) {
        await db.pendingTransactions.delete(record.id!);
        console.log(`[Offline Sync] Successfully synced ${record.type} ID: ${record.id}`);
      } else {
        console.error(`[Offline Sync] Failed to sync ${record.type} ID: ${record.id}`, error);
        // Increment retry count or handle persistent failure
      }
    } catch (err) {
      console.error('[Offline Sync] Critical Error:', err);
    }
  }
}

// Global listener for online event
window.addEventListener('online', syncOfflineData);

// Periodically check if online and have pending data
setInterval(syncOfflineData, 60000); // Every 1 minute

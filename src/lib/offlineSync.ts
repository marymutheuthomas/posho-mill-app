import { db } from './db';
import { supabase } from './supabase';

const SYNC_CONCURRENCY = 5;
const MAX_RETRIES = 3;

export async function syncOfflineData() {
  if (!navigator.onLine) return;

  const pending = await db.pendingTransactions.limit(20).toArray();
  if (pending.length === 0) return;

  console.time('Sync-Batch');
  console.log(`🚀 [Offline Sync] Starting batch sync for ${pending.length} records...`);

  // Process in batches of SYNC_CONCURRENCY
  for (let i = 0; i < pending.length; i += SYNC_CONCURRENCY) {
    const batch = pending.slice(i, i + SYNC_CONCURRENCY);
    
    await Promise.allSettled(batch.map(async (record) => {
      const recordId = record.id!;
      console.time(`Sync-Record-${recordId}`);
      
      try {
        let table = '';
        switch (record.type) {
          case 'sale': table = 'sales_transactions'; break;
          case 'repayment': table = 'repayments'; break;
          case 'purchase': table = 'purchases'; break;
          case 'stock_take': table = 'stock_take_history'; break;
          case 'production_log': table = 'production_logs'; break;
          case 'milling_session': 
          case 'milling_session_update': table = 'milling_sessions'; break;
          case 'daily_audit': table = 'daily_audits'; break;
          case 'expense': table = 'expenses'; break;
          case 'user_creation': 
          case 'user_update': 
          case 'user_delete': table = 'profiles'; break;
        }

        if (!table) {
          console.warn(`⚠️ [Offline Sync] Unknown record type: ${record.type}. Skipping.`);
          return;
        }

        console.log(`📡 [Offline Sync] Pushing ${record.type} to Table: [${table}]...`);

        let error;
        // Handle Updates vs Inserts vs Deletes
        if (record.type === 'milling_session' || record.type === 'milling_session_update') {
          console.log(`💎 [Offline Sync] Atomic Upsert for Session ID: ${record.payload.id || recordId}`);
          ({ error } = await supabase.from(table).upsert(record.payload, { onConflict: 'id' }));
        } else if (record.type.includes('update')) {
          const { id, ...updateData } = record.payload;
          ({ error } = await supabase.from(table).update(updateData).eq('id', id));
        } else if (record.type.includes('delete')) {
          ({ error } = await supabase.from(table).delete().eq('id', record.payload.id));
        } else {
          ({ error } = await supabase.from(table).insert([record.payload]));
        }

        if (!error) {
          await db.pendingTransactions.delete(recordId);
          console.log(`✅ [Offline Sync] Synced ${record.type} (ID: ${recordId})`);
        } else {
          console.error(`❌ [Offline Sync] Database Error [${record.type} ID: ${recordId}]:`, error.message);
          
          // ZOMBIE PREVENTION: Increment retry count and bury if too many failures
          const currentRetries = (record.retryCount || 0) + 1;
          if (currentRetries >= MAX_RETRIES) {
            console.warn(`💀 [Offline Sync] Record ${recordId} failed ${MAX_RETRIES} times. Burying zombie record.`);
            await db.pendingTransactions.delete(recordId); // Or move to a dead-letter table
          } else {
            await db.pendingTransactions.update(recordId, { retryCount: currentRetries });
          }
        }
      } catch (err: any) {
        console.error(`🔥 [Offline Sync] Critical Failure [ID: ${recordId}]:`, err.message || err);
      } finally {
        console.timeEnd(`Sync-Record-${recordId}`);
      }
    }));
  }

  console.timeEnd('Sync-Batch');
}

// Listeners
window.addEventListener('online', () => {
  console.log('🌐 System Online. Triggering Sync...');
  syncOfflineData();
});

setInterval(syncOfflineData, 30000); // Check every 30s

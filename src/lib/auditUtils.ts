import { supabase } from './supabase';
import { db } from './db';

/**
 * Checks if a stock take was performed on the previous calendar day or today.
 * Returns true if a stock take exists, OR if the system is brand new (no history).
 * Now supports offline-first validation by checking Dexie.
 */
export async function checkPreviousStockTake(): Promise<{ isDone: boolean; lastDate: string | null }> {
  try {
    // 1. Check Offline Dexie first (Immediate Unlock for local work)
    const pendingStockTake = await db.pendingTransactions
      .where('type')
      .equals('stock_take')
      .reverse()
      .first();
    
    if (pendingStockTake) {
      console.log("🔓 [Audit] Unlocked via local pending stock take.");
      return { isDone: true, lastDate: new Date(pendingStockTake.timestamp).toISOString() };
    }

    // 2. Check if ANY stock take has EVER been done.
    // If the system is brand new, we don't want to block the first day.
    const { count, error: countError } = await supabase
      .from('stock_take_history')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;
    if (count === 0) return { isDone: true, lastDate: null }; // Bypass for brand new systems

    // 3. Check for stock take from yesterday 00:00:00 onwards
    // This allows unlocking if a stock take was done yesterday OR earlier today.
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from('stock_take_history')
      .select('created_at')
      .gte('created_at', yesterdayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return { isDone: data.length > 0, lastDate: data[0]?.created_at || null };

  } catch (err) {
    console.error("Audit Check Failure:", err);
    return { isDone: true, lastDate: null }; // Fail open for safety
  }
}

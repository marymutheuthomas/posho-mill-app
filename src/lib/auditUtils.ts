import { supabase } from './supabase';

/**
 * Checks if a stock take was performed on the previous calendar day.
 * Returns true if a stock take exists, OR if the system is brand new (no history).
 */
export async function checkPreviousStockTake(): Promise<{ isDone: boolean; lastDate: string | null }> {
  try {
    // 1. Check if ANY stock take has EVER been done.
    // If the system is brand new, we don't want to block the first day.
    const { count, error: countError } = await supabase
      .from('stock_logs')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;
    if (count === 0) return { isDone: true, lastDate: null }; // Bypass for brand new systems

    // 2. Check for yesterday's stock take
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    
    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('stock_logs')
      .select('created_at')
      .gte('created_at', yesterdayStart.toISOString())
      .lte('created_at', yesterdayEnd.toISOString())
      .limit(1);

    if (error) throw error;
    return { isDone: data.length > 0, lastDate: data[0]?.created_at || null };

  } catch (err) {
    console.error("Audit Check Failure:", err);
    return { isDone: true, lastDate: null }; // Fail open for safety
  }
}

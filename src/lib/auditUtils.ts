import { supabase } from './supabase';

/**
 * Checks if a stock take was performed on the previous calendar day.
 * Returns true if a stock take exists, false otherwise.
 */
export async function checkPreviousStockTake(): Promise<{ isDone: boolean; lastDate: string | null }> {
  try {
    const now = new Date();
    
    // Get the start and end of "Yesterday" in local time
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    
    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Check for any stock take logs in that window
    const { data, error } = await supabase
      .from('stock_logs')
      .select('created_at')
      .gte('created_at', yesterdayStart.toISOString())
      .lte('created_at', yesterdayEnd.toISOString())
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      return { isDone: true, lastDate: data[0].created_at };
    }

    // Fallback: If no stock take yesterday, check if there was any activity at all yesterday.
    // If there was no production/sales yesterday, we might want to skip the block.
    // But per user request: "if stock take has not yet been done for the previous day"
    
    return { isDone: false, lastDate: null };
  } catch (err) {
    console.error("Audit Check Failure:", err);
    return { isDone: true, lastDate: null }; // Fail open to prevent complete lockout on network error
  }
}

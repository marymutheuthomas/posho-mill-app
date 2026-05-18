import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

export interface MillingSession {
  id: string;
  session_code?: string;
  session_type: string;
  status: string;
  start_meter: number;
  end_meter: number | null;
  is_closed: boolean;
  recorded_by?: string;
  created_at: string;
}

export function useActiveSession() {
  return useQuery({
    queryKey: ['active-session'],
    queryFn: async () => {
      console.log('🔍 [useActiveSession] Fetching active session...');
      
      // 1. Check for Pending Offline Sessions first
      const pending = await db.pendingTransactions
        .where('type')
        .equals('milling_session')
        .reverse()
        .first();

      if (pending) {
        console.log(`📦 [useActiveSession] Found pending session action in Dexie:`, pending.payload);
        // If the most recent pending action was to CLOSE the session, we treat it as closed.
        if (pending.payload.is_closed) {
          console.log('🚫 [useActiveSession] Most recent local action was CLOSURE. Returning null.');
          return null;
        }
        return pending.payload as MillingSession;
      }

      console.log('📡 [useActiveSession] No pending local actions. Fetching from Supabase...');
      
      // 2. Fallback to Supabase - filter by is_closed only for reliability
      const { data, error } = await supabase
        .from('milling_sessions')
        .select('*')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('📡 [useActiveSession] Supabase Response:', { data, error });

      if (error && error.code !== 'PGRST116') {
        console.error('❌ [useActiveSession] Supabase fetch error:', error);
        throw error;
      }

      return data as MillingSession | null;
    },
    refetchInterval: 5000, // Frequent polling to ensure UI consistency
    staleTime: 0,          // Always consider stale to ensure fresh data on focus
  });
}

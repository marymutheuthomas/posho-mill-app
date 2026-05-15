import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

type TransactionType = 
  | 'sale' | 'repayment' | 'purchase' | 'stock_take' 
  | 'user_creation' | 'user_update' | 'user_delete'
  | 'production_log' | 'milling_session' | 'milling_session_update' | 'expense' | 'daily_audit';

interface MutationConfig {
  type: TransactionType;
  queryKey: string[];
  mutationFn: (payload: any) => Promise<any>;
  onSuccess?: (result: { offline: boolean; data?: any; payload?: any }) => void;
  onError?: (error: any) => void;
  onMutate?: (payload: any) => Promise<any>;
}

export function useDataMutation({ type, queryKey, mutationFn, onSuccess, onError, onMutate }: MutationConfig) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: any) => {
      const timestamp = Date.now();
      
      // FAST AUTH RETRIEVAL
      const userId = (await supabase.auth.getSession()).data.session?.user?.id;
      
      const hydrateRecord = (item: any) => {
        const hydrated = { 
          ...item,
          id: item.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2))
        };
        if (!hydrated.recorded_by && userId) hydrated.recorded_by = userId;
        return hydrated;
      };

      const hydratedPayload = Array.isArray(payload) 
        ? payload.map(hydrateRecord) 
        : hydrateRecord(payload);
      
      // 1. Check Connectivity
      if (!navigator.onLine) {
        await db.pendingTransactions.add({
          type,
          payload: hydratedPayload,
          timestamp,
          retryCount: 0
        });
        return { offline: true, payload: hydratedPayload };
      }

      // 2. Online: Try the provided mutation function
      try {
        console.log(`📡 [${type}] SENDING PAYLOAD:`, hydratedPayload);
        const result = await mutationFn(hydratedPayload);
        console.log(`✅ [${type}] DATABASE RESPONSE:`, result);
        return { offline: false, data: result };
      } catch (err: any) {
        // AGGRESSIVE NETWORK CATCHING:
        // Detect "Failed to fetch" (browser network error) or sudden disconnects
        const isNetworkError = 
          !navigator.onLine || 
          err.message?.toLowerCase().includes('failed to fetch') || 
          err.message?.toLowerCase().includes('load failed') ||
          err.name === 'TypeError' ||
          err.code === 'PGRST301'; // Supabase unreachable code

        if (isNetworkError) {
          console.warn(`🌐 NETWORK FAILURE DETECTED in [${type}]. Rerouting to Dexie Buffer.`);
          await db.pendingTransactions.add({
            type,
            payload,
            timestamp,
            retryCount: 0
          });
          // Return offline state to trigger toast notifications in components
          return { offline: true, payload };
        }

        // DATABASE ERRORS (RLS 403, Validations, etc.) -> Throw to UI
        console.error(`❌ DATABASE ERROR IN [${type}]:`, err.message, err.details || '', err.hint || '');
        throw err;
      }
    },
    onMutate: async (payload) => {
      // 0. Instant Sync (Non-blocking)
      const hydrateRecord = (item: any) => ({
          ...item,
          id: item.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2))
      });

      const hydratedPayload = Array.isArray(payload) 
        ? payload.map(hydrateRecord) 
        : hydrateRecord(payload);

      // Execute custom onMutate if provided (e.g. for multi-table updates)
      let customContext = {};
      if (onMutate) {
        customContext = await onMutate(hydratedPayload);
      }

      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: any) => {
        // Bulk inserts (like Stock Take) usually return an array to prepend
        const itemsToProcess = Array.isArray(hydratedPayload) ? hydratedPayload : [hydratedPayload];
        
        if (!old) return itemsToProcess;
        const oldData = Array.isArray(old) ? old : [old];
        
        if (type.includes('update')) {
          // Note: Bulk updates would need more complex logic, but we currently use this for single updates
          const singleUpdate = itemsToProcess[0];
          return oldData.map((item: any) => item.id === singleUpdate.id ? { ...item, ...singleUpdate } : item);
        }
        if (type.includes('delete')) {
          const idsToDelete = itemsToProcess.map(p => p.id);
          return oldData.filter((item: any) => !idsToDelete.includes(item.id));
        }
        
        return [...itemsToProcess, ...oldData];
      });

      return { ...customContext, previousData };
    },
    onSuccess: (result) => {
      if (onSuccess) onSuccess(result);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err, _variables, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      if (onError) onError(err);
    }
  });
}

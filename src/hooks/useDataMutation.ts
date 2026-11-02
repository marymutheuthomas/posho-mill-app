import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { db, generateUUID, type TransactionType } from '../lib/db';
import { isNetworkError } from '../lib/network';

interface MutationConfig {
  type: TransactionType;
  queryKey: string[];
  mutationFn: (payload: any) => Promise<any>;
  onSuccess?: (result: { offline: boolean; data?: any; payload?: any }) => void;
  onError?: (error: any) => void;
  onMutate?: (payload: any) => Promise<any>;
  // Fail instead of queueing when offline (e.g. auth sign-ups that cannot be replayed later).
  requiresOnline?: boolean;
}

const isWrite = (type: TransactionType) => !type.includes('update') && !type.includes('delete');

// Pins the primary key on the client so the optimistic cache row, the Dexie queue entry and
// the Supabase row all share one UUID. Runs once per mutate() call, before onMutate and mutationFn.
const assignId = (item: any) =>
  item && typeof item === 'object' && !item.id ? { ...item, id: generateUUID() } : item;

const withIds = (payload: any) => (Array.isArray(payload) ? payload.map(assignId) : assignId(payload));

export function useDataMutation({ type, queryKey, mutationFn, onSuccess, onError, onMutate, requiresOnline }: MutationConfig) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    // React Query would otherwise pause mutations while offline, so the Dexie queue below would
    // never be reached and the pending write would only live in memory until reconnect.
    networkMode: 'always',
    mutationFn: async (payload: any) => {
      // Stamp the author on new records only; edits and voids keep the original recorder.
      let record = payload;
      if (isWrite(type)) {
        const userId = (await supabase.auth.getSession()).data.session?.user?.id;
        const stamp = (item: any) => (item.recorded_by || !userId ? item : { ...item, recorded_by: userId });
        record = Array.isArray(payload) ? payload.map(stamp) : stamp(payload);
      }

      const enqueue = async () => {
        if (requiresOnline) throw new Error('This action requires an internet connection.');
        await db.pendingTransactions.add({ type, payload: record, timestamp: Date.now(), retryCount: 0 });
        return { offline: true, payload: record };
      };

      if (!navigator.onLine) return enqueue();

      try {
        console.log(`📡 [${type}] SENDING PAYLOAD:`, record);
        const result = await mutationFn(record);
        console.log(`✅ [${type}] DATABASE RESPONSE:`, result);
        return { offline: false, data: result };
      } catch (err: any) {
        if (isNetworkError(err)) {
          console.warn(`🌐 NETWORK FAILURE DETECTED in [${type}]. Rerouting to Dexie Buffer.`);
          return enqueue();
        }
        // DATABASE ERRORS (RLS 403, Validations, etc.) -> Throw to UI
        console.error(`❌ DATABASE ERROR IN [${type}]:`, err.message, err.details || '', err.hint || '');
        throw err;
      }
    },
    onMutate: async (payload) => {
      // Execute custom onMutate if provided (e.g. for multi-table updates)
      let customContext = {};
      if (onMutate) {
        customContext = await onMutate(payload);
      }

      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: any) => {
        // Bulk inserts (like Stock Take) usually return an array to prepend
        const itemsToProcess = Array.isArray(payload) ? payload : [payload];

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
      queryClient.invalidateQueries({ queryKey: ['pending-tx-count'] });
    },
    onError: (err, _variables, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      if (onError) onError(err);
    }
  });

  return {
    ...mutation,
    mutate: (payload: any, options?: Parameters<typeof mutation.mutate>[1]) => mutation.mutate(withIds(payload), options),
    mutateAsync: (payload: any, options?: Parameters<typeof mutation.mutateAsync>[1]) => mutation.mutateAsync(withIds(payload), options),
  };
}

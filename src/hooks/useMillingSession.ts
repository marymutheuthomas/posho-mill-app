import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase } from '../lib/supabase';
import { db, generateUUID, type PendingTransaction } from '../lib/db';
import { isNetworkError } from '../lib/network';
import { getActiveOperatorId } from '../lib/offlineAuth';

export interface MillingSession {
  id: string;
  session_code?: string;
  session_type: string;
  status: string;
  start_meter: number;
  end_meter: number | null;
  is_closed: boolean;
  power_cost?: number;
  recorded_by?: string;
  created_at: string;
  closed_at?: string | null;
}

export type SessionType = 'Internal' | 'External';

// Every session query lives under one prefix, so a single invalidate refreshes all of them.
export const sessionKeys = {
  all: ['milling-sessions'] as const,
  active: ['milling-sessions', 'active'] as const,
  lastClosed: ['milling-sessions', 'last-closed'] as const,
  history: ['milling-sessions', 'history'] as const,
  latestStockTake: ['milling-sessions', 'latest-stock-take'] as const,
};

// Run mutationFns even when offline (React Query pauses them by default); they queue or fail themselves.
const OFFLINE_FIRST = 'always' as const;

const SESSION_OPS = ['milling_session', 'milling_session_update'] as const;
const NO_OPS: PendingTransaction[] = []; // stable default so memos don't recompute while Dexie loads

// After this hour (Nairobi), closing a session means the day is over and a stock take is due.
const END_OF_DAY_HOUR = 19;

const closedAfterEndOfDay = (closedAt?: string | null) => {
  if (!closedAt) return false;
  const hour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Nairobi', hour: 'numeric', hour12: false }).format(new Date(closedAt)), 10);
  return hour >= END_OF_DAY_HOUR;
};

// Session writes are queued in Dexie whenever Supabase is unreachable; the live query
// below picks the queued write up instantly, so the UI never waits on the network.
async function writeOrQueue(type: PendingTransaction['type'], payload: any, send: () => PromiseLike<{ error: any }>) {
  const enqueue = async () => {
    await db.pendingTransactions.add({ type, payload, timestamp: Date.now(), retryCount: 0 });
    return { offline: true };
  };
  if (!navigator.onLine) return enqueue();
  const { error } = await send();
  if (error) {
    if (isNetworkError(error)) return enqueue();
    throw error;
  }
  return { offline: false };
}

// ——— Single source of truth for the active milling session ———————————————————————
export function useMillingSession() {
  const queryClient = useQueryClient();

  const serverActive = useQuery({
    queryKey: sessionKeys.active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milling_sessions').select('*')
        .eq('is_closed', false)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      if (error) throw error;
      return data as MillingSession | null;
    },
    refetchInterval: 5000, // other terminals may open/close sessions
  });

  const serverLastClosed = useQuery({
    queryKey: sessionKeys.lastClosed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milling_sessions').select('id, start_meter, end_meter, closed_at')
        .eq('is_closed', true)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      if (error) throw error;
      return data as Pick<MillingSession, 'id' | 'start_meter' | 'end_meter' | 'closed_at'> | null;
    },
    refetchInterval: 5000,
  });

  const serverStockTake = useQuery({
    queryKey: sessionKeys.latestStockTake,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_take_history').select('created_at')
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      if (error) throw error;
      return (data?.created_at as string | undefined) ?? null;
    },
    refetchInterval: 30000,
  });

  // Local, not-yet-synced session writes and stock takes (reactive: re-run on every Dexie change).
  const pendingOps = useLiveQuery(
    () => db.pendingTransactions.where('type').anyOf([...SESSION_OPS]).sortBy('id'),
    [], NO_OPS
  );
  const pendingStockTakeAt = useLiveQuery(
    async () => (await db.pendingTransactions.where('type').equals('stock_take').last())?.timestamp ?? null,
    [], null
  );

  // Writes that just synced leave the queue before the cached server state has caught up.
  // Keep replaying them until both session queries have refetched since, or the pre-sync
  // server state briefly resurfaces (e.g. a session closed offline flashing back open).
  const [drained, setDrained] = useState<{ op: PendingTransaction; at: number }[]>([]);
  const prevOps = useRef(pendingOps);
  useLayoutEffect(() => {
    const stillQueued = new Set(pendingOps.map(o => o.id));
    const synced = prevOps.current.filter(o => !stillQueued.has(o.id));
    prevOps.current = pendingOps;
    if (synced.length === 0) return;
    const at = Date.now();
    setDrained(d => [...d, ...synced.map(op => ({ op, at }))]);
    queryClient.invalidateQueries({ queryKey: sessionKeys.all }); // also cancels in-flight stale fetches
  }, [pendingOps, queryClient]);

  const serverFreshAt = Math.min(serverActive.dataUpdatedAt, serverLastClosed.dataUpdatedAt);
  useEffect(() => {
    setDrained(d => (d.some(x => x.at <= serverFreshAt) ? d.filter(x => x.at > serverFreshAt) : d));
  }, [serverFreshAt]);

  // Server state with the local queue replayed on top, in the order it was recorded.
  const { activeSession, lastClosed, hasPendingChanges } = useMemo(() => {
    let active: MillingSession | null = serverActive.data ?? null;
    let closed = serverLastClosed.data ?? null;
    const replay = [...drained.filter(x => x.at > serverFreshAt).map(x => x.op), ...pendingOps];

    for (const op of replay) {
      const p = op.payload;
      if (op.type === 'milling_session') {
        active = p.is_closed ? null : (p as MillingSession);
      } else if (active && active.id === p.id) {
        const merged = { ...active, ...p } as MillingSession;
        if (merged.is_closed) {
          closed = merged;
          active = null;
        } else {
          active = merged;
        }
      } else if (p.is_closed && p.end_meter != null) {
        closed = { ...closed, ...p };
      }
    }
    return { activeSession: active, lastClosed: closed, hasPendingChanges: pendingOps.length > 0 };
  }, [serverActive.data, serverLastClosed.data, pendingOps, drained, serverFreshAt]);

  const lastEndMeter = lastClosed ? Number(lastClosed.end_meter ?? lastClosed.start_meter ?? 0) : 0;

  // Start-of-day gate: a session closed after hours needs a stock take before the next one opens.
  const latestStockTakeAt = Math.max(
    serverStockTake.data ? new Date(serverStockTake.data).getTime() : 0,
    pendingStockTakeAt ?? 0
  );
  const requiresStockTake = !activeSession
    && !!lastClosed?.closed_at
    && closedAfterEndOfDay(lastClosed.closed_at)
    && latestStockTakeAt < new Date(lastClosed.closed_at).getTime();

  const startSession = useMutation({
    networkMode: OFFLINE_FIRST,
    mutationFn: async (type: SessionType) => {
      if (activeSession) throw new Error(`A ${activeSession.session_type} session is already running.`);
      if (requiresStockTake) throw new Error('A stock take is required before opening the next session.');
      const userId = getActiveOperatorId() ?? (await supabase.auth.getSession()).data.session?.user?.id;
      const row = {
        id: generateUUID(),
        session_type: type,
        status: 'Started',
        is_closed: false,
        start_meter: lastEndMeter,
        created_at: new Date().toISOString(),
        ...(userId ? { recorded_by: userId } : {}),
      };
      const result = await writeOrQueue('milling_session', row, () => supabase.from('milling_sessions').insert([row]));
      return { ...result, row };
    },
    onSuccess: ({ offline, row }) => {
      if (!offline) queryClient.setQueryData(sessionKeys.active, row);
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: ['pending-tx-count'] });
    },
  });

  const closeSession = useMutation({
    networkMode: OFFLINE_FIRST,
    mutationFn: async (endMeter: number) => {
      if (!activeSession) throw new Error('There is no active session to close.');
      if (isNaN(endMeter)) throw new Error('End meter reading is required.');
      if (endMeter < Number(activeSession.start_meter)) {
        throw new Error(`Invalid meter: must be ≥ ${activeSession.start_meter} kWh.`);
      }
      const changes = { end_meter: endMeter, is_closed: true, status: 'Completed', closed_at: new Date().toISOString() };
      return writeOrQueue(
        'milling_session_update',
        { id: activeSession.id, ...changes },
        () => supabase.from('milling_sessions').update(changes).eq('id', activeSession.id)
      );
    },
    onSuccess: ({ offline }) => {
      if (!offline) queryClient.setQueryData(sessionKeys.active, null);
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: ['pending-tx-count'] });
    },
  });

  return {
    activeSession,
    isLoading: serverActive.isLoading || serverLastClosed.isLoading,
    hasPendingChanges,
    lastEndMeter,
    requiresStockTake,
    startSession,
    closeSession,
  };
}

// ——— Past sessions (admin corrections are online-only: they rewrite audited meter history) ———
export function useSessionHistory() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: sessionKeys.all });

  const history = useQuery({
    queryKey: sessionKeys.history,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milling_sessions').select('*')
        .eq('is_closed', true)
        .order('closed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as MillingSession[];
    },
    refetchInterval: 30000,
  });

  const requireOnline = () => {
    if (!navigator.onLine) throw new Error('Editing session history requires an internet connection.');
  };

  const editSession = useMutation({
    networkMode: OFFLINE_FIRST,
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<MillingSession> }) => {
      requireOnline();
      const { error } = await supabase.from('milling_sessions').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteSession = useMutation({
    networkMode: OFFLINE_FIRST,
    mutationFn: async (id: string) => {
      requireOnline();
      const { error } = await supabase.from('milling_sessions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { pastSessions: history.data ?? [], isLoading: history.isLoading, editSession, deleteSession };
}

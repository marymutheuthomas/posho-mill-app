import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { PendingTransaction } from '../lib/db';

// Queued writes leave Dexie the moment they sync, before cached server data has been
// refetched. Without this, a just-synced repayment would vanish from the balance for a
// while. Synced ops keep being replayed until the server data is newer than the sync.
export function useQueuedOverlay(pending: PendingTransaction[], serverFreshAt: number, refreshKey: QueryKey) {
  const queryClient = useQueryClient();
  const [drained, setDrained] = useState<{ op: PendingTransaction; at: number }[]>([]);
  const prev = useRef(pending);

  useLayoutEffect(() => {
    const stillQueued = new Set(pending.map(o => o.id));
    const synced = prev.current.filter(o => !stillQueued.has(o.id));
    prev.current = pending;
    if (synced.length === 0) return;
    const at = Date.now();
    setDrained(d => [...d, ...synced.map(op => ({ op, at }))]);
    queryClient.invalidateQueries({ queryKey: refreshKey }); // also cancels in-flight stale fetches
    // refreshKey is a constant per caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, queryClient]);

  useEffect(() => {
    setDrained(d => (d.some(x => x.at <= serverFreshAt) ? d.filter(x => x.at > serverFreshAt) : d));
  }, [serverFreshAt]);

  return useMemo(() => ({
    ops: [...drained.filter(x => x.at > serverFreshAt).map(x => x.op), ...pending],
    stillPending: new Set(pending.map(o => o.id)),
  }), [drained, pending, serverFreshAt]);
}

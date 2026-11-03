import { db, type PendingTransaction, type SyncFailure, type TransactionType } from './db';
import { supabase } from './supabase';
import { isNetworkError } from './network';

const MAX_RETRIES = 3;
const MAX_PER_RUN = 200;

type SyncOp = 'insert' | 'upsert' | 'update' | 'delete';

interface SyncPlan {
  table: string;
  op: SyncOp;
  // Shapes the queued payload exactly like the online mutationFn does, so a replay
  // sends the same row the operator would have sent with a connection.
  prepare?: (payload: any) => any;
}

// Only send columns the table has: queued payloads can carry UI-only or legacy fields.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pick = (o: any, keys: string[]) =>
  Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

export const CUSTOMER_EDITABLE = ['name', 'phone', 'location', 'kra_pin', 'credit_limit', 'notes', 'is_active'];
const REPAYMENT_COLUMNS = ['id', 'customer_id', 'amount', 'notes', 'method', 'session_id', 'recorded_by', 'effective_time'];

// Shared by the online path and replay. Also upgrades customers queued by older builds,
// which used debt_book's customer_name / customer_phone shape.
export const toCustomerRow = (p: any) => pick({
  ...p,
  name: p.name ?? p.customer_name,
  phone: p.phone ?? p.customer_phone ?? null,
  created_by: p.created_by ?? p.recorded_by,
}, ['id', 'created_by', ...CUSTOMER_EDITABLE]);

const SYNC_PLAN: Partial<Record<TransactionType, SyncPlan>> = {
  sale:                   { table: 'sales_transactions', op: 'insert' },
  sale_update:            { table: 'sales_transactions', op: 'update' },
  sale_delete:            { table: 'sales_transactions', op: 'delete' },
  repayment: {
    table: 'repayments', op: 'insert',
    prepare: (p) => pick({ ...p, amount: Number(p.amount), notes: p.notes || '' }, REPAYMENT_COLUMNS)
  },
  customer_creation: {
    table: 'customers', op: 'insert',
    prepare: toCustomerRow
  },
  customer_update: {
    table: 'customers', op: 'update',
    prepare: (p) => pick(p, ['id', ...CUSTOMER_EDITABLE])
  },
  purchase:               { table: 'purchases', op: 'insert' },
  stock_take: {
    table: 'stock_take_history', op: 'insert',
    // Builds before the operator-id fix queued a role label ("ADMIN") here; the column is a
    // profile id now, so send null for those rather than failing the whole count.
    prepare: (p) => (Array.isArray(p) ? p : [p]).map((r: Record<string, unknown>) =>
      typeof r.recorded_by === 'string' && !UUID.test(r.recorded_by) ? { ...r, recorded_by: null } : r)
  },
  production_log:         { table: 'production_logs', op: 'insert' },
  milling_session:        { table: 'milling_sessions', op: 'upsert' },
  milling_session_update: { table: 'milling_sessions', op: 'update' },
  daily_audit:            { table: 'daily_audits', op: 'insert' },
  expense:                { table: 'expenses', op: 'insert' },
  user_update:            { table: 'profiles', op: 'update' },
  user_delete:            { table: 'profiles', op: 'delete' },
  // user_creation is deliberately absent: it needs supabase.auth.signUp with a password,
  // which must never sit in the queue. Any legacy queued ones go straight to the DLQ.
};

async function pushRecord(record: PendingTransaction): Promise<SyncFailure | null> {
  const plan = SYNC_PLAN[record.type];
  if (!plan) {
    return { message: `No sync handler for "${record.type}". Re-enter this record while online.` };
  }

  const body = plan.prepare ? plan.prepare(record.payload) : record.payload;
  const table = supabase.from(plan.table);
  let error;

  switch (plan.op) {
    case 'insert':
      ({ error } = await table.insert(Array.isArray(body) ? body : [body]));
      break;
    case 'upsert':
      ({ error } = await table.upsert(body, { onConflict: 'id' }));
      break;
    case 'update': {
      const { id, ...changes } = body;
      ({ error } = await table.update(changes).eq('id', id));
      break;
    }
    case 'delete':
      ({ error } = await table.delete().eq('id', body.id));
      break;
  }

  if (!error) return null;

  // Client-generated UUIDs make inserts idempotent: a primary-key clash means an earlier
  // attempt already landed (e.g. the response was lost when the connection dropped).
  const isOwnPkClash = error.code === '23505' && /_pkey/.test(`${error.message} ${error.details}`);
  if ((plan.op === 'insert' || plan.op === 'upsert') && isOwnPkClash) return null;

  return { message: error.message, code: error.code, details: error.details, hint: error.hint };
}

async function moveToDeadLetter(record: PendingTransaction, failure: SyncFailure, attempts: number) {
  await db.transaction('rw', db.pendingTransactions, db.dead_letter_queue, async () => {
    await db.dead_letter_queue.add({
      type: record.type,
      payload: record.payload,
      timestamp: record.timestamp,
      failedAt: Date.now(),
      attempts,
      error: failure,
    });
    await db.pendingTransactions.delete(record.id!);
  });
}

let isSyncing = false;

// Replays the queue one record at a time in the order it was recorded, so an update or
// delete never reaches Supabase before the insert it depends on.
export async function syncOfflineData() {
  if (!navigator.onLine || isSyncing) return;
  isSyncing = true;

  try {
    // Without a signed-in session RLS rejects every row, which would burn retries and push
    // valid records into the dead-letter queue. Wait until someone signs in online.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const pending = await db.pendingTransactions.orderBy(':id').limit(MAX_PER_RUN).toArray();
    if (pending.length === 0) return;
    console.log(`🚀 [Offline Sync] Replaying ${pending.length} queued records...`);

    for (const record of pending) {
      const recordId = record.id!;

      if (record.type === 'user_creation') {
        await moveToDeadLetter(record, {
          message: 'User accounts cannot be created offline. Create this user again while online, then discard this entry.'
        }, 0);
        continue;
      }

      let failure: SyncFailure | null;
      try {
        failure = await pushRecord(record);
      } catch (err: any) {
        failure = { message: err?.message || String(err) };
      }

      if (!failure) {
        await db.pendingTransactions.delete(recordId);
        console.log(`✅ [Offline Sync] Synced ${record.type} (#${recordId})`);
        continue;
      }

      // Connection dropped mid-run: not the record's fault. Stop and resume next time.
      if (isNetworkError(failure)) {
        console.warn('🌐 [Offline Sync] Connection lost. Pausing until next attempt.');
        break;
      }

      const attempts = (record.retryCount || 0) + 1;
      console.error(`❌ [Offline Sync] ${record.type} #${recordId} rejected (attempt ${attempts}/${MAX_RETRIES}):`, failure.message);

      if (attempts >= MAX_RETRIES) {
        console.warn(`☠️ [Offline Sync] #${recordId} moved to dead-letter queue.`);
        await moveToDeadLetter(record, failure, attempts);
      } else {
        await db.pendingTransactions.update(recordId, { retryCount: attempts, lastError: failure.message });
      }
    }
  } finally {
    isSyncing = false;
  }
}

// Puts a dead letter back at the end of the sync queue, optionally with an admin-corrected payload.
export async function requeueDeadLetter(deadLetterId: number, payload?: any) {
  await db.transaction('rw', db.pendingTransactions, db.dead_letter_queue, async () => {
    const letter = await db.dead_letter_queue.get(deadLetterId);
    if (!letter) return;
    await db.pendingTransactions.add({
      type: letter.type,
      payload: payload ?? letter.payload,
      timestamp: letter.timestamp,
      retryCount: 0,
    });
    await db.dead_letter_queue.delete(deadLetterId);
  });
  syncOfflineData();
}

export async function discardDeadLetter(deadLetterId: number) {
  await db.dead_letter_queue.delete(deadLetterId);
}

window.addEventListener('online', () => {
  console.log('🌐 System Online. Triggering Sync...');
  syncOfflineData();
});

setInterval(syncOfflineData, 30000);

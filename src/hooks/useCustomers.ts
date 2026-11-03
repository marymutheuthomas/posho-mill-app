import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase } from '../lib/supabase';
import { db, type PendingTransaction } from '../lib/db';
import { fetchAllRows } from '../lib/fetchAll';
import { toCustomerRow, CUSTOMER_EDITABLE } from '../lib/offlineSync';
import { useDataMutation } from './useDataMutation';
import { useMillingSession } from './useMillingSession';
import { useQueuedOverlay } from './useQueuedOverlay';
import {
  toEntries, balanceOf, ageDebt, riskOf,
  type OpeningRow, type CreditSaleRow, type RepaymentRow, type LedgerEntry, type Aging, type Risk,
} from '../lib/customerLedger';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  location: string | null;
  kra_pin: string | null;
  credit_limit: number;
  notes: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface CustomerWithLedger extends Customer {
  entries: LedgerEntry[];
  balance: number;
  aging: Aging;
  risk: Risk;
  pending: boolean;      // created or edited offline, not yet synced
}

export const customerKeys = {
  all: ['customers'] as const,
  directory: ['customers', 'directory'] as const,
  openings: ['customers', 'openings'] as const,
  creditSales: ['customers', 'credit-sales'] as const,
  repayments: ['customers', 'repayments'] as const,
};

const CUSTOMER_OPS = ['customer_creation', 'customer_update', 'repayment', 'sale', 'sale_update', 'sale_delete'] as const;
const NO_OPS: PendingTransaction[] = [];

// Everything the CRM, POS and dashboard need, from one cache.
export function useCustomers() {
  const directory = useQuery({
    queryKey: customerKeys.directory,
    queryFn: () => fetchAllRows<Customer>((f, t) => supabase.from('customers')
      .select('id, name, phone, location, kra_pin, credit_limit, notes, is_active, created_at').order('name').range(f, t)),
    staleTime: 1000 * 60 * 5,
  });
  const openings = useQuery({
    queryKey: customerKeys.openings,
    queryFn: () => fetchAllRows<OpeningRow>((f, t) => supabase.from('customer_opening_balances')
      .select('id, customer_id, amount, effective_time, note').order('id').range(f, t)),
    staleTime: 1000 * 60 * 30,
  });
  const creditSales = useQuery({
    queryKey: customerKeys.creditSales,
    queryFn: () => fetchAllRows<CreditSaleRow>((f, t) => supabase.from('sales_transactions')
      .select('id, customer_id, amount_debt, effective_time, created_at, receipt_code, transaction_type, weight_kg')
      .not('customer_id', 'is', null).neq('amount_debt', 0).order('id').range(f, t)),
    staleTime: 1000 * 60 * 2,
  });
  const repayments = useQuery({
    queryKey: customerKeys.repayments,
    queryFn: () => fetchAllRows<RepaymentRow>((f, t) => supabase.from('repayments')
      .select('id, customer_id, amount, effective_time, created_at, method, notes').order('id').range(f, t)),
    staleTime: 1000 * 60 * 2,
  });

  // Offline-queued customer work, applied on top so balances update before sync.
  const pending = useLiveQuery(
    () => db.pendingTransactions.where('type').anyOf([...CUSTOMER_OPS]).sortBy('id'),
    [], NO_OPS
  );
  const serverFreshAt = Math.min(directory.dataUpdatedAt, openings.dataUpdatedAt, creditSales.dataUpdatedAt, repayments.dataUpdatedAt);
  const overlay = useQueuedOverlay(pending, serverFreshAt, customerKeys.all);

  const customers = useMemo(() => {
    const byId = new Map<string, Customer & { pending?: boolean }>();
    for (const c of directory.data ?? []) byId.set(c.id, { ...c, credit_limit: Number(c.credit_limit) || 0 });

    const sales = new Map((creditSales.data ?? []).map(s => [s.id, s]));
    const reps = new Map((repayments.data ?? []).map(r => [r.id, r]));
    const pendingIds = new Set<string>();

    for (const op of overlay.ops) {
      const p = op.payload;
      const queued = overlay.stillPending.has(op.id);
      if (op.type === 'customer_creation') {
        const row = toCustomerRow(p) as Partial<Customer> & { id: string; name: string };
        byId.set(row.id, { location: null, kra_pin: null, notes: null, is_active: true, credit_limit: 0, phone: null, ...byId.get(row.id), ...row, pending: queued });
      } else if (op.type === 'customer_update' && byId.has(p.id)) {
        const edits = Object.fromEntries(CUSTOMER_EDITABLE.filter(k => p[k] !== undefined).map(k => [k, p[k]]));
        byId.set(p.id, { ...byId.get(p.id)!, ...edits, pending: queued || byId.get(p.id)!.pending });
      } else if (op.type === 'repayment' && p.id) {
        reps.set(p.id, { ...p, effective_time: p.effective_time || new Date(op.timestamp).toISOString() });
        if (queued) pendingIds.add(p.id);
      } else if (op.type === 'sale' && p.id && p.customer_id && Number(p.amount_debt)) {
        sales.set(p.id, { ...p, effective_time: p.effective_time || p.created_at });
        if (queued) pendingIds.add(p.id);
      } else if (op.type === 'sale_update' && sales.has(p.id)) {
        sales.set(p.id, { ...sales.get(p.id)!, ...p });
      } else if (op.type === 'sale_delete') {
        sales.delete(p.id);
      }
    }

    const entries = toEntries({ openings: openings.data ?? [], sales: [...sales.values()], repayments: [...reps.values()] }, pendingIds);
    const byCustomer = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      const list = byCustomer.get(e.customerId);
      if (list) list.push(e); else byCustomer.set(e.customerId, [e]);
    }

    const now = new Date();
    return [...byId.values()].map((c): CustomerWithLedger => {
      const list = byCustomer.get(c.id) ?? [];
      const aging = ageDebt(list, now);
      return { ...c, entries: list, balance: balanceOf(list), aging, risk: riskOf(aging), pending: !!c.pending };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [directory.data, openings.data, creditSales.data, repayments.data, overlay]);

  return {
    customers,
    byId: useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]),
    isLoading: directory.isLoading,
    error: directory.error || openings.error || creditSales.error || repayments.error,
  };
}

export function useCustomerMutations() {
  const queryClient = useQueryClient();
  const { activeSession } = useMillingSession();
  const refresh = () => queryClient.invalidateQueries({ queryKey: customerKeys.all });

  const createCustomer = useDataMutation({
    type: 'customer_creation',
    queryKey: [...customerKeys.directory],
    mutationFn: async (payload) => {
      const { error } = await supabase.from('customers').insert([toCustomerRow(payload)]);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const updateCustomer = useDataMutation({
    type: 'customer_update',
    queryKey: [...customerKeys.directory],
    mutationFn: async ({ id, ...changes }) => {
      const edits = Object.fromEntries(CUSTOMER_EDITABLE.filter(k => changes[k] !== undefined).map(k => [k, changes[k]]));
      const { error } = await supabase.from('customers').update(edits).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const repayMutation = useDataMutation({
    type: 'repayment',
    queryKey: [...customerKeys.repayments],
    mutationFn: async (payload) => {
      const row = {
        id: payload.id, customer_id: payload.customer_id, amount: Number(payload.amount), notes: payload.notes || '',
        method: payload.method, session_id: payload.session_id, recorded_by: payload.recorded_by, effective_time: payload.effective_time,
      };
      const { error } = await supabase.from('repayments').insert([row]);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['session-drawer'] });
    },
  });

  // Repayments taken at the till belong to the open shift's cash drawer.
  const recordRepayment = (
    input: { customer_id: string; amount: number; method: 'Cash' | 'M-Pesa' | 'Bank'; notes?: string },
    options?: Parameters<typeof repayMutation.mutate>[1]
  ) => repayMutation.mutate({
    ...input,
    session_id: activeSession?.id ?? null,
    effective_time: new Date().toISOString(),
  }, options);

  return { createCustomer, updateCustomer, recordRepayment, repaying: repayMutation.isPending };
}

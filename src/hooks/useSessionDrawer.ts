import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase } from '../lib/supabase';
import { db, type PendingTransaction } from '../lib/db';
import { fetchAllRows } from '../lib/fetchAll';
import { round2 } from '../lib/customerLedger';
import { useQueuedOverlay } from './useQueuedOverlay';

interface SaleMoney { id: string; amount_cash: number | string | null; amount_mpesa: number | string | null; amount_debt: number | string | null }
interface RepaymentMoney { id: string; amount: number | string; method: string | null }

export interface DrawerTotals {
  cashSales: number; mpesaSales: number; creditGiven: number;
  cashRepayments: number; mpesaRepayments: number; bankRepayments: number;
  expectedCash: number; expectedMpesa: number;
  pendingCount: number;
}

const NO_OPS: PendingTransaction[] = [];
const n = (v: unknown) => Number(v) || 0;

// What the open shift's drawer should hold: cash sales + cash debt repayments (M-Pesa likewise).
export function useSessionDrawer(sessionId: string | null | undefined) {
  const server = useQuery({
    queryKey: ['session-drawer', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const [sales, repayments] = await Promise.all([
        fetchAllRows<SaleMoney>((f, t) => supabase.from('sales_transactions').select('id, amount_cash, amount_mpesa, amount_debt').eq('session_id', sessionId!).order('id').range(f, t)),
        fetchAllRows<RepaymentMoney>((f, t) => supabase.from('repayments').select('id, amount, method').eq('session_id', sessionId!).order('id').range(f, t)),
      ]);
      return { sales, repayments };
    },
    refetchInterval: 30000,
  });

  const pending = useLiveQuery(
    () => db.pendingTransactions.where('type').anyOf(['sale', 'sale_update', 'sale_delete', 'repayment']).sortBy('id'),
    [], NO_OPS
  );
  const overlay = useQueuedOverlay(pending, server.dataUpdatedAt, ['session-drawer']);

  return useMemo((): DrawerTotals | null => {
    if (!sessionId) return null;
    const sales = new Map((server.data?.sales ?? []).map(s => [s.id, s]));
    const reps = new Map((server.data?.repayments ?? []).map(r => [r.id, r]));
    let pendingCount = 0;
    for (const op of overlay.ops) {
      const p = op.payload;
      const queued = overlay.stillPending.has(op.id);
      if (op.type === 'sale' && p.session_id === sessionId) { sales.set(p.id, p); if (queued) pendingCount++; }
      else if (op.type === 'sale_update' && sales.has(p.id)) sales.set(p.id, { ...sales.get(p.id)!, ...p });
      else if (op.type === 'sale_delete') sales.delete(p.id);
      else if (op.type === 'repayment' && p.session_id === sessionId) { reps.set(p.id, p); if (queued) pendingCount++; }
    }
    const t = { cashSales: 0, mpesaSales: 0, creditGiven: 0, cashRepayments: 0, mpesaRepayments: 0, bankRepayments: 0 };
    for (const s of sales.values()) { t.cashSales += n(s.amount_cash); t.mpesaSales += n(s.amount_mpesa); t.creditGiven += n(s.amount_debt); }
    for (const r of reps.values()) {
      if (r.method === 'M-Pesa') t.mpesaRepayments += n(r.amount);
      else if (r.method === 'Bank') t.bankRepayments += n(r.amount);
      else t.cashRepayments += n(r.amount);
    }
    const out = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, round2(v)])) as typeof t;
    return { ...out, expectedCash: round2(out.cashSales + out.cashRepayments), expectedMpesa: round2(out.mpesaSales + out.mpesaRepayments), pendingCount };
  }, [sessionId, server.data, overlay]);
}

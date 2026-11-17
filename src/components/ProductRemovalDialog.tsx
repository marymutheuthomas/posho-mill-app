import { useEffect, useState } from 'react';
import { Trash2, EyeOff, X, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SECTION_TITLE, btn } from '../lib/ui';

export interface RemovableProduct { id: string; name: string; product_code: string }

// Everywhere a product can be referenced by history. Any record here means "hide, don't delete".
const REFERENCES: [table: string, column: string][] = [
  ['sales_transactions', 'product_id'],
  ['production_logs', 'input_product_id'],
  ['production_logs', 'output_product_id'],
  ['production_logs', 'byproduct_id'],
  ['purchases', 'product_id'],
  ['stock_take_history', 'product_id'],
  ['inventory_ledger', 'product_id'],
];

async function historyCount(productId: string): Promise<number> {
  const counts = await Promise.all(REFERENCES.map(async ([table, column]) => {
    const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq(column, productId);
    return error ? Number.POSITIVE_INFINITY : (count ?? 0); // can't check = treat as used, never delete blind
  }));
  return counts.reduce((a, b) => a + b, 0);
}

type Plan = { product: RemovableProduct; history: number }[];

const missingColumn = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST204' || e.code === '42703' || /is_active/.test(e.message ?? '');

export default function ProductRemovalDialog({ products, onClose, onDone }: {
  products: RemovableProduct[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all(products.map(async product => ({ product, history: await historyCount(product.id) })))
      .then(p => { if (!cancelled) setPlan(p); })
      .catch(err => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [products]);

  const toDelete = plan?.filter(p => p.history === 0) ?? [];
  const toHide = plan?.filter(p => p.history > 0) ?? [];

  const run = async () => {
    if (!plan) return;
    setRunning(true);
    setError('');
    try {
      let deleted = 0;
      const hideIds = toHide.map(p => p.product.id);
      if (toDelete.length) {
        const { data, error } = await supabase.from('products').delete().in('id', toDelete.map(p => p.product.id)).select('id');
        if (error?.code === '23503') hideIds.push(...toDelete.map(p => p.product.id)); // still referenced somewhere: hide instead
        else if (error) throw error;
        else deleted = data?.length ?? 0;
      }
      let hidden = 0;
      if (hideIds.length) {
        const { data, error } = await supabase.from('products').update({ is_active: false }).in('id', hideIds).select('id');
        if (error) throw missingColumn(error) ? new Error('Hiding products needs database migration 20261110. Ask an admin to run it.') : error;
        hidden = data?.length ?? 0;
      }
      const asked = toDelete.length + toHide.length;
      if (deleted + hidden < asked) {
        throw new Error(`Only ${deleted + hidden} of ${asked} products could be changed. Your account may not be allowed to remove products.`);
      }
      onDone([deleted && `${deleted} deleted`, hidden && `${hidden} hidden`].filter(Boolean).join(', ') + '.');
    } catch (err) {
      setError((err as Error).message || 'Could not remove the products.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="modal-overlay z-50 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="remove-products-title">
      <div className="modal-panel bg-white w-full max-w-md shadow-2xl">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <h3 id="remove-products-title" className={`${SECTION_TITLE} text-slate-900`}>Remove {products.length} product{products.length === 1 ? '' : 's'}</h3>
          <button type="button" onClick={onClose} className={btn.icon} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          {!plan && !error && <p className="text-sm text-slate-600" aria-live="polite">Checking each product's history…</p>}

          {plan && (
            <>
              <p className="text-sm text-slate-700">
                Products with sales, production, purchases or stock counts are <strong>hidden</strong>: they leave the
                POS and stock lists, and past records stay correct. Products never used are <strong>deleted</strong>.
              </p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {plan.map(({ product, history }) => (
                  <li key={product.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900 truncate">{product.name}</span>
                      <span className="block font-mono text-xs text-slate-500">{product.product_code}</span>
                    </span>
                    {history === 0 ? (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-xs font-semibold"><Trash2 size={14} /> Delete</span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-800 text-xs font-semibold"><EyeOff size={14} /> Hide · has history</span>
                    )}
                  </li>
                ))}
              </ul>
              {toDelete.length > 0 && <p className="text-xs text-slate-500">Deleting cannot be undone. Hidden products can be restored from Settings.</p>}
            </>
          )}

          {error && (
            <p role="alert" className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className={btn.secondary}>Cancel</button>
          <button type="button" onClick={run} disabled={!plan || running} className={btn.danger}>
            {running ? 'Removing…' : `Remove ${products.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

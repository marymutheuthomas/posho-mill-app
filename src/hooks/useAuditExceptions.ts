import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type ExceptionType = 'INVENTORY_DRIFT' | 'POWER_YIELD_MISMATCH' | 'UNMETERED_TRANSACTION';
export type Severity = 'WARNING' | 'CRITICAL';

export interface AuditException {
  id: string;
  exception_type: ExceptionType;
  description: string;
  severity: Severity;
  effective_time: string | null;
  created_at: string;
  recorder: { username: string | null } | { username: string | null }[] | null;
}

// Admins get the whole queue; staff only the exceptions they recorded. The database (RLS)
// enforces the same rule, so the staff filter here is a second line, not the only one.
// Shared by the queue and the page's warning banner (same key, one request).
export function usePendingExceptions(isAdmin: boolean) {
  return useQuery({
    queryKey: ['audit-exceptions', 'pending', isAdmin ? 'all' : 'mine'],
    queryFn: async () => {
      let q = supabase.from('audit_exceptions')
        .select('id, exception_type, description, severity, effective_time, created_at, recorder:profiles!audit_exceptions_recorded_by_fkey(username)')
        .eq('status', 'PENDING_ADMIN_APPROVAL');
      if (!isAdmin) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return [];
        q = q.eq('recorded_by', session.user.id);
      }
      const { data, error } = await q.order('effective_time', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AuditException[];
    },
  });
}

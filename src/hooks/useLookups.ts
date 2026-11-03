import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/** product id -> name, for tables that store only product_id. */
export function useProductNames() {
  const { data } = useQuery({
    queryKey: ['lookup', 'product-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name');
      if (error) throw error;
      return new Map((data ?? []).map(p => [p.id as string, p.name as string]));
    },
    staleTime: 5 * 60_000,
  });
  return data ?? new Map<string, string>();
}

/** profile id -> username. Empty if the signed-in user may not read profiles. */
export function useProfileNames() {
  const { data } = useQuery({
    queryKey: ['lookup', 'profile-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, username');
      if (error) throw error;
      return new Map((data ?? []).map(p => [p.id as string, (p.username as string) || 'Unnamed user']));
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data ?? new Map<string, string>();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** recorded_by may hold a profile id or (older stock takes) a role label such as "ADMIN". */
export function describeRecorder(value: string | null | undefined, names: Map<string, string>) {
  if (!value) return '—';
  if (UUID.test(value)) return names.get(value) ?? 'Unknown user';
  return `${value} (role only)`;
}

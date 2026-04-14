import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type TableName = 'funds' | 'transactions' | 'contacts' | 'containers' | 'shipments' | 'projects' | 'debts';

/**
 * يستمع لتغييرات الجداول عبر Realtime ويستدعي callback عند أي تغيير.
 * يُستخدم لإبطال الكاش وإعادة جلب البيانات تلقائياً مع debounce لمنع الجلب المتكرر.
 */
export function useRealtimeSync(tables: TableName[], onChangeCallback: () => void, debounceMs = 1500) {
  const { user } = useAuth();
  const callbackRef = useRef(onChangeCallback);
  callbackRef.current = onChangeCallback;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressUntilRef = useRef(0);

  useEffect(() => {
    if (!user) return;

    const channelName = `realtime-sync-${tables.join('-')}-${user.id.slice(0, 8)}`;
    const channel = supabase.channel(channelName);

    tables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          // Skip if we're in a suppression window (mutation just happened)
          if (Date.now() < suppressUntilRef.current) return;
          // Debounce: batch multiple events into one callback
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            callbackRef.current();
            timerRef.current = null;
          }, debounceMs);
        }
      );
    });

    channel.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, tables.join(','), debounceMs]);

  /** Call after a mutation to suppress the next realtime-triggered refetch */
  const suppressNext = useCallback((durationMs = 3000) => {
    suppressUntilRef.current = Date.now() + durationMs;
  }, []);

  return { suppressNext };
}

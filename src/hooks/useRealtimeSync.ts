import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type TableName = 'funds' | 'transactions' | 'contacts' | 'containers' | 'shipments' | 'projects' | 'debts';

/**
 * يستمع لتغييرات الجداول عبر Realtime ويستدعي callback عند أي تغيير.
 * يُستخدم لإبطال الكاش وإعادة جلب البيانات تلقائياً مع debounce لمنع الجلب المتكرر.
 */
// Global state to track active channels and prevent duplicates
const activeChannels = new Map<string, { channel: any; refCount: number }>();

export function useRealtimeSync(tables: TableName[], onChangeCallback: () => void, debounceMs = 800) {
  const { user } = useAuth();
  const callbackRef = useRef(onChangeCallback);
  callbackRef.current = onChangeCallback;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressUntilRef = useRef(0);

  useEffect(() => {
    if (!user || tables.length === 0) return;

    const sortedTables = [...tables].sort();
    const channelName = `rt-${sortedTables.join('-')}`;

    let channel: any;
    const existing = activeChannels.get(channelName);

    if (existing) {
      channel = existing.channel;
      existing.refCount++;
    } else {
      channel = supabase.channel(channelName);
      sortedTables.forEach((table) => {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => {
            if (Date.now() < suppressUntilRef.current) return;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
              callbackRef.current();
              timerRef.current = null;
            }, debounceMs);
          }
        );
      });
      channel.subscribe();
      activeChannels.set(channelName, { channel, refCount: 1 });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);

      const current = activeChannels.get(channelName);
      if (current) {
        current.refCount--;
        if (current.refCount <= 0) {
          supabase.removeChannel(current.channel);
          activeChannels.delete(channelName);
        }
      }
    };
  }, [user, tables.join(','), debounceMs]);

  /** Call after a mutation to suppress the next realtime-triggered refetch */
  const suppressNext = useCallback((durationMs = 3000) => {
    suppressUntilRef.current = Date.now() + durationMs;
  }, []);

  return { suppressNext };
}

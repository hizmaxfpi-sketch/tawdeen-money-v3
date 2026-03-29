import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type TableName = 'funds' | 'transactions' | 'contacts' | 'containers' | 'shipments' | 'projects' | 'debts';

/**
 * يستمع لتغييرات الجداول عبر Realtime ويستدعي callback عند أي تغيير.
 * يُستخدم لإبطال الكاش وإعادة جلب البيانات تلقائياً.
 */
export function useRealtimeSync(tables: TableName[], onChangeCallback: () => void) {
  const { user } = useAuth();
  const callbackRef = useRef(onChangeCallback);
  callbackRef.current = onChangeCallback;

  useEffect(() => {
    if (!user) return;

    const channelName = `realtime-sync-${tables.join('-')}-${user.id.slice(0, 8)}`;
    const channel = supabase.channel(channelName);

    tables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          callbackRef.current();
        }
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, tables.join(',')]);
}

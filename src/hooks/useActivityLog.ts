import { useCallback, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ActivityEvent {
  id: string;
  userId: string;
  userName: string;
  eventType: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  details: Record<string, any>;
  status: string;
  createdAt: string;
}

export function useActivityLog() {
  const { user } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (!error && data) {
      // Fetch profile names for all unique user_ids
      const userIds = [...new Set(data.map((e: any) => e.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      const nameMap = new Map<string, string>();
      profiles?.forEach(p => nameMap.set(p.user_id, p.full_name || 'مستخدم'));

      setEvents(data.map((e: any) => ({
        id: e.id,
        userId: e.user_id,
        userName: nameMap.get(e.user_id) || 'مستخدم',
        eventType: e.event_type,
        entityType: e.entity_type,
        entityId: e.entity_id,
        entityName: e.entity_name,
        details: e.details || {},
        status: e.status,
        createdAt: e.created_at,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchEvents();
  }, [user, fetchEvents]);

  const logEvent = useCallback(async (
    eventType: string,
    entityType: string,
    entityId: string | null,
    entityName: string | null,
    details: Record<string, any> = {},
    status: string = 'active'
  ) => {
    if (!user) return;
    await supabase.from('activity_log').insert({
      user_id: user.id,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      details,
      status,
    } as any);
  }, [user]);

  return { events, loading, fetchEvents, logEvent };
}

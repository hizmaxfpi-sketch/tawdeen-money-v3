import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Fund, FundType, FundOption } from '@/types/finance';
import { useRealtimeSync } from './useRealtimeSync';
import { cacheSet, cacheGet } from '@/lib/offlineCache';
import { guardOffline } from '@/lib/offlineGuard';

// Activity log helper (fire-and-forget)
const logToActivity = async (userId: string, eventType: string, entityType: string, entityId: string | null, entityName: string | null, details: Record<string, any> = {}, status = 'active') => {
  try { await supabase.from('activity_log').insert({ user_id: userId, event_type: eventType, entity_type: entityType, entity_id: entityId, entity_name: entityName, details, status } as any); } catch {}
};

let _cachedFunds: Fund[] | null = null;
let _fundsCacheUserId: string | null = null;
let _fundsCacheTime = 0;
const FUNDS_CACHE_TTL = 30_000;

export function useFunds() {
  const { user } = useAuth();
  const [funds, setFunds] = useState<Fund[]>(() => cacheGet<Fund[]>('funds') || []);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const realtimeRef = useRef<{ suppressNext: (ms?: number) => void }>({ suppressNext: () => {} });

  const fetchFunds = useCallback(async () => {
    if (!user) return;
    // كاش بسيط
    if (_cachedFunds && _fundsCacheUserId === user.id && (Date.now() - _fundsCacheTime) < FUNDS_CACHE_TTL) {
      setFunds(_cachedFunds);
      if (loading) setLoading(false);
      setInitialLoaded(true);
      return;
    }
    if (!initialLoaded) setLoading(true);
    // Don't set loading=true on subsequent fetches to prevent data flash
    const { data, error } = await supabase
      .from('funds')
      .select('id, name, type, balance, description, created_at')
      .order('created_at', { ascending: true });
    if (error) { console.error('Error fetching funds:', error); }
    else {
      const mapped = (data || []).map(f => ({
        id: f.id,
        name: f.name,
        type: f.type as FundType,
        balance: Number(f.balance),
        description: f.description || undefined,
        isDefault: false,
        createdAt: new Date(f.created_at),
      }));
      setFunds(mapped);
      cacheSet('funds', mapped);
      _cachedFunds = mapped;
      _fundsCacheUserId = user.id;
      _fundsCacheTime = Date.now();
    }
    setLoading(false);
    setInitialLoaded(true);
  }, [user, initialLoaded]);

  const invalidateCache = useCallback(() => {
    _cachedFunds = null;
    _fundsCacheTime = 0;
  }, []);

  useEffect(() => {
    if (user) fetchFunds();
  }, [user, fetchFunds]);

  // Realtime: auto-refresh when funds change from another session/user
  const rt = useRealtimeSync(['funds'], () => {
    invalidateCache();
    fetchFunds();
  });
  realtimeRef.current = rt;

  const addFund = useCallback(async (fund: { name: string; type: FundType; description?: string }) => {
    if (!user) return;
    if (guardOffline()) return;
    const { data, error } = await supabase
      .from('funds')
      .insert({ user_id: user.id, name: fund.name, type: fund.type, description: fund.description, balance: 0 })
      .select()
      .single();
    if (error) { toast.error('خطأ في إضافة الصندوق'); console.error(error); return; }
    toast.success('تم إضافة الصندوق بنجاح');
    if (user && data) logToActivity(user.id, 'fund_created', 'fund', (data as any).id, fund.name, { type: fund.type });
    invalidateCache();
    realtimeRef.current.suppressNext(500);
    return data;
  }, [user, invalidateCache]);

  const updateFund = useCallback(async (id: string, updates: Partial<Fund>) => {
    if (guardOffline()) return;
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.balance !== undefined) updateData.balance = updates.balance;

    // تحديث متفائل
    setFunds(prev => prev.map(f => f.id === id ? { ...f, ...updates } as Fund : f));

    const { error } = await supabase.from('funds').update(updateData).eq('id', id);
    if (error) { toast.error('خطأ في تحديث الصندوق'); return; }
    if (user) logToActivity(user.id, 'fund_updated', 'fund', id, updates.name || '', { updates: Object.keys(updateData) });
    invalidateCache();
    realtimeRef.current.suppressNext(500);
  }, [user, invalidateCache]);

  const deleteFund = useCallback(async (id: string) => {
    if (guardOffline()) return;
    const fund = funds.find(f => f.id === id);
    // تحديث متفائل
    setFunds(prev => prev.filter(f => f.id !== id));
    const { error } = await supabase.from('funds').delete().eq('id', id);
    if (error) { toast.error('خطأ في حذف الصندوق'); return; }
    toast.success('تم حذف الصندوق');
    if (user && fund) logToActivity(user.id, 'fund_deleted', 'fund', id, fund.name, { type: fund.type, balance: fund.balance }, 'deleted');
    invalidateCache();
    realtimeRef.current.suppressNext(500);
  }, [user, funds, invalidateCache]);

  const transferFunds = useCallback(async (fromFundId: string, toFundId: string, amount: number, note?: string) => {
    if (!user) return;
    if (guardOffline()) return;
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const { error } = await supabase.rpc('process_transaction', {
      p_type: 'out',
      p_category: 'fund_transfer',
      p_amount: amount,
      p_description: note || 'تحويل بين الصناديق',
      p_date: dateStr,
      p_fund_id: fromFundId,
      p_to_fund_id: toFundId,
    });
    if (error) { toast.error('خطأ في التحويل'); console.error(error); return; }
    toast.success('تم التحويل بنجاح');
    invalidateCache();
    realtimeRef.current.suppressNext(500);
  }, [user, invalidateCache]);

  const getFundOptions = useCallback((): FundOption[] =>
    funds.map(f => ({ id: f.id, name: f.name, type: f.type, balance: f.balance })),
  [funds]);

  return {
    funds, loading, initialLoaded,
    addFund, updateFund, deleteFund, transferFunds,
    getFundOptions, fetchFunds,
  };
}

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Fund, FundType, FundOption } from '@/types/finance';
import { useRealtimeSync } from './useRealtimeSync';

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
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const fetchFunds = useCallback(async () => {
    if (!user) return;
    // كاش بسيط
    if (_cachedFunds && _fundsCacheUserId === user.id && (Date.now() - _fundsCacheTime) < FUNDS_CACHE_TTL) {
      setFunds(_cachedFunds);
      setLoading(false);
      setInitialLoaded(true);
      return;
    }
    if (!initialLoaded) setLoading(true);
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
  useRealtimeSync(['funds'], () => {
    invalidateCache();
    fetchFunds();
  });

  const addFund = useCallback(async (fund: { name: string; type: FundType; description?: string }) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('funds')
      .insert({ user_id: user.id, name: fund.name, type: fund.type, description: fund.description, balance: 0 })
      .select()
      .single();
    if (error) { toast.error('خطأ في إضافة الصندوق'); console.error(error); return; }
    toast.success('تم إضافة الصندوق بنجاح');
    if (user && data) await logToActivity(user.id, 'fund_created', 'fund', (data as any).id, fund.name, { type: fund.type });
    invalidateCache();
    await fetchFunds();
    return data;
  }, [user, fetchFunds]);

  const updateFund = useCallback(async (id: string, updates: Partial<Fund>) => {
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.balance !== undefined) updateData.balance = updates.balance;
    
    const { error } = await supabase.from('funds').update(updateData).eq('id', id);
    if (error) { toast.error('خطأ في تحديث الصندوق'); return; }
    if (user) await logToActivity(user.id, 'fund_updated', 'fund', id, updates.name || '', { updates: Object.keys(updateData) });
    invalidateCache(); await fetchFunds();
  }, [fetchFunds]);

  const deleteFund = useCallback(async (id: string) => {
    const fund = funds.find(f => f.id === id);
    const { error } = await supabase.from('funds').delete().eq('id', id);
    if (error) { toast.error('خطأ في حذف الصندوق'); return; }
    toast.success('تم حذف الصندوق');
    if (user && fund) await logToActivity(user.id, 'fund_deleted', 'fund', id, fund.name, { type: fund.type, balance: fund.balance }, 'deleted');
    invalidateCache(); await fetchFunds();
  }, [user, funds, fetchFunds, invalidateCache]);

  const transferFunds = useCallback(async (fromFundId: string, toFundId: string, amount: number, note?: string) => {
    if (!user) return;
    const { error } = await supabase.rpc('process_transaction', {
      p_user_id: user.id,
      p_type: 'out',
      p_category: 'fund_transfer',
      p_amount: amount,
      p_description: note || 'تحويل بين الصناديق',
      p_date: (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })(),
      p_fund_id: fromFundId,
      p_to_fund_id: toFundId,
    });
    if (error) { toast.error('خطأ في التحويل'); console.error(error); return; }
    toast.success('تم التحويل بنجاح');
    invalidateCache(); await fetchFunds();
  }, [user, fetchFunds, invalidateCache]);

  const getFundOptions = useCallback((): FundOption[] =>
    funds.map(f => ({ id: f.id, name: f.name, type: f.type, balance: f.balance })),
  [funds]);

  return {
    funds, loading, initialLoaded,
    addFund, updateFund, deleteFund, transferFunds,
    getFundOptions, fetchFunds,
  };
}

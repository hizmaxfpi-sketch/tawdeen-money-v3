import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Fund, FundType, FundOption } from '@/types/finance';
import { useRealtimeSync } from './useRealtimeSync';
import { cacheSet, cacheGet } from '@/lib/offlineCache';
import { guardOffline } from '@/lib/offlineGuard';

// ============================================================
// SINGLETON STORE for funds — one fetch / one realtime channel
// ============================================================

const FUNDS_CACHE_TTL = 30_000;

type Listener = () => void;
const listeners = new Set<Listener>();
let _state: { funds: Fund[]; loading: boolean } = {
  funds: cacheGet<Fund[]>('funds') || [],
  loading: true,
};
let _userId: string | null = null;
let _cacheTime = 0;
let _inflight: Promise<void> | null = null;
let _bootstrappedUserId: string | null = null;
let _suppressNext: (ms?: number) => void = () => {};

const setState = (next: Partial<typeof _state>) => {
  _state = { ..._state, ...next };
  listeners.forEach(l => l());
};
const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => _state;

async function _fetchFunds(userId: string, force = false): Promise<void> {
  if (!force && _userId === userId && (Date.now() - _cacheTime) < FUNDS_CACHE_TTL && _state.funds.length > 0) {
    setState({ loading: false });
    return;
  }
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('funds')
        .select('id, name, type, balance, description, created_at')
        .order('created_at', { ascending: true });
      if (error) { console.error('Error fetching funds:', error); setState({ loading: false }); return; }
      const mapped: Fund[] = (data || []).map(f => ({
        id: f.id, name: f.name, type: f.type as FundType, balance: Number(f.balance),
        description: f.description || undefined, isDefault: false, createdAt: new Date(f.created_at),
      }));
      _userId = userId; _cacheTime = Date.now();
      cacheSet('funds', mapped);
      setState({ funds: mapped, loading: false });
    } finally { _inflight = null; }
  })();
  return _inflight;
}

const logToActivity = async (userId: string, eventType: string, entityType: string, entityId: string | null, entityName: string | null, details: Record<string, any> = {}, status = 'active') => {
  try { await supabase.from('activity_log').insert({ user_id: userId, event_type: eventType, entity_type: entityType, entity_id: entityId, entity_name: entityName, details, status } as any); } catch {}
};

export function useFunds() {
  const { user } = useAuth();
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const realtimeRef = useRef<{ suppressNext: (ms?: number) => void }>({ suppressNext: () => {} });

  useEffect(() => {
    if (!user) return;
    if (_bootstrappedUserId !== user.id) {
      _bootstrappedUserId = user.id;
      _userId = null;
      _fetchFunds(user.id, true);
    } else if (_state.funds.length === 0) {
      _fetchFunds(user.id);
    }
  }, [user]);

  const rt = useRealtimeSync(['funds'], () => {
    if (!user) return;
    _cacheTime = 0;
    _fetchFunds(user.id, true);
  });
  realtimeRef.current = rt;
  _suppressNext = rt.suppressNext;

  const fetchFunds = useCallback(async () => {
    if (user) await _fetchFunds(user.id, true);
  }, [user]);

  const addFund = useCallback(async (fund: { name: string; type: FundType; description?: string }) => {
    if (!user) return;
    if (guardOffline()) return;
    const { data, error } = await supabase
      .from('funds')
      .insert({ user_id: user.id, name: fund.name, type: fund.type, description: fund.description, balance: 0 })
      .select().single();
    if (error) { toast.error('خطأ في إضافة الصندوق'); console.error(error); return; }
    toast.success('تم إضافة الصندوق بنجاح');
    if (user && data) logToActivity(user.id, 'fund_created', 'fund', (data as any).id, fund.name, { type: fund.type });
    _cacheTime = 0;
    _suppressNext(500);
    return data;
  }, [user]);

  const updateFund = useCallback(async (id: string, updates: Partial<Fund>) => {
    if (guardOffline()) return;
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.balance !== undefined) updateData.balance = updates.balance;
    // optimistic
    setState({ funds: _state.funds.map(f => f.id === id ? { ...f, ...updates } as Fund : f) });
    const { error } = await supabase.from('funds').update(updateData).eq('id', id);
    if (error) { toast.error('خطأ في تحديث الصندوق'); return; }
    if (user) logToActivity(user.id, 'fund_updated', 'fund', id, updates.name || '', { updates: Object.keys(updateData) });
    _cacheTime = 0;
    _suppressNext(500);
  }, [user]);

  const deleteFund = useCallback(async (id: string) => {
    if (guardOffline()) return;
    const fund = _state.funds.find(f => f.id === id);
    setState({ funds: _state.funds.filter(f => f.id !== id) });
    const { error } = await supabase.from('funds').delete().eq('id', id);
    if (error) { toast.error('خطأ في حذف الصندوق'); return; }
    toast.success('تم حذف الصندوق');
    if (user && fund) logToActivity(user.id, 'fund_deleted', 'fund', id, fund.name, { type: fund.type, balance: fund.balance }, 'deleted');
    _cacheTime = 0;
    _suppressNext(500);
  }, [user]);

  const transferFunds = useCallback(async (fromFundId: string, toFundId: string, amount: number, note?: string) => {
    if (!user) return;
    if (guardOffline()) return;
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const { error } = await supabase.rpc('process_transaction', {
      p_type: 'out', p_category: 'fund_transfer', p_amount: amount,
      p_description: note || 'تحويل بين الصناديق', p_date: dateStr,
      p_fund_id: fromFundId, p_to_fund_id: toFundId,
    });
    if (error) { toast.error('خطأ في التحويل'); console.error(error); return; }
    toast.success('تم التحويل بنجاح');
    _cacheTime = 0;
    _suppressNext(500);
  }, [user]);

  const getFundOptions = useCallback((): FundOption[] =>
    state.funds.map(f => ({ id: f.id, name: f.name, type: f.type, balance: f.balance })),
  [state.funds]);

  return {
    funds: state.funds,
    loading: state.loading,
    initialLoaded: !state.loading,
    addFund, updateFund, deleteFund, transferFunds,
    getFundOptions, fetchFunds,
  };
}

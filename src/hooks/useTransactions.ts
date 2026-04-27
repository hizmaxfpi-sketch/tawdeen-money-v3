import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Transaction, TransactionType, TransactionCategory, TrendData, ChartData } from '@/types/finance';
import { calculateMonthlyTrend, calculateExpenseBreakdown } from '@/utils/calculationEngine';
import { useRealtimeSync } from './useRealtimeSync';
import { cacheSet, cacheGet } from '@/lib/offlineCache';
import { guardOffline } from '@/lib/offlineGuard';

// ============================================================
// SINGLETON STORE — one fetch / one realtime subscription / one snapshot
// shared across every component that calls useTransactions().
// Before: every page mounted its own copy → N fetches, N channels, lag.
// After: a single module-level store; components subscribe to changes.
// ============================================================

const PAGE_SIZE = 50;
const CACHE_TTL = 30_000;

type Listener = () => void;
const listeners = new Set<Listener>();

let _state: { transactions: Transaction[]; loading: boolean; hasMore: boolean; offset: number; loadingMore: boolean } = {
  transactions: cacheGet<Transaction[]>('transactions') || [],
  loading: true,
  hasMore: true,
  offset: 0,
  loadingMore: false,
};
let _userId: string | null = null;
let _cacheTime = 0;
let _inflight: Promise<void> | null = null;

const setState = (next: Partial<typeof _state>) => {
  _state = { ..._state, ...next };
  listeners.forEach(l => l());
};

const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => _state;

const mapTransaction = (t: any): Transaction => ({
  id: t.id,
  type: t.type as TransactionType,
  category: t.category as TransactionCategory,
  amount: Number(t.amount),
  description: t.description || '',
  date: t.date,
  fundId: t.fund_id || '',
  accountId: t.account_id || undefined,
  contactId: t.contact_id || undefined,
  projectId: t.project_id || undefined,
  notes: t.notes || undefined,
  attachment: t.attachments?.[0] || undefined,
  currencyCode: t.currency_code || 'USD',
  exchangeRate: Number(t.exchange_rate || 1),
  toFundId: undefined,
  sourceType: t.source_type || 'manual',
  createdByName: t.created_by_name || undefined,
  createdAt: new Date(t.created_at),
});

async function _fetchTransactions(userId: string, force = false, append = false): Promise<void> {
  const currentOffset = append ? _state.offset : 0;

  if (!force && !append && _userId === userId && (Date.now() - _cacheTime) < CACHE_TTL && _state.transactions.length > 0) {
    setState({ loading: false });
    return;
  }
  if (_inflight) return _inflight;

  if (append) {
    setState({ loadingMore: true });
  }

  _inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, type, category, amount, description, date, fund_id, account_id, contact_id, project_id, notes, attachments, created_at, currency_code, exchange_rate, source_type, created_by_name')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(currentOffset, currentOffset + PAGE_SIZE - 1);

      if (error) {
        console.error('Error fetching transactions:', error);
        toast.error('خطأ في جلب البيانات');
        setState({ loading: false, loadingMore: false });
        return;
      }

      const mapped = (data || []).map(mapTransaction);
      const newTransactions = append ? [..._state.transactions, ...mapped] : mapped;
      const hasMore = (data || []).length === PAGE_SIZE;

      if (!append) {
        _userId = userId;
        _cacheTime = Date.now();
        cacheSet('transactions', mapped);
      }

      setState({
        transactions: newTransactions,
        loading: false,
        loadingMore: false,
        hasMore,
        offset: append ? _state.offset + (data || []).length : (data || []).length
      });
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

// Activity log helper (fire-and-forget)
const logToActivity = async (userId: string, eventType: string, entityType: string, entityId: string | null, entityName: string | null, details: Record<string, any> = {}, status = 'active') => {
  try { await supabase.from('activity_log').insert({ user_id: userId, event_type: eventType, entity_type: entityType, entity_id: entityId, entity_name: entityName, details, status } as any); } catch {}
};

// Frontend guard against rapid double-submit
const _pendingSubmissions = new Set<string>();

// Track which auth user has already triggered initial fetch + realtime
let _bootstrappedUserId: string | null = null;
let _suppressNext: (ms?: number) => void = () => {};

export function useTransactions() {
  const { user } = useAuth();
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const realtimeRef = useRef<{ suppressNext: (ms?: number) => void }>({ suppressNext: () => {} });

  // Bootstrap once per user (across all components)
  useEffect(() => {
    if (!user) return;
    if (_bootstrappedUserId !== user.id) {
      _bootstrappedUserId = user.id;
      _userId = null; // force refetch on user change
      _fetchTransactions(user.id, true);
    } else if (_state.transactions.length === 0) {
      _fetchTransactions(user.id);
    }
  }, [user]);

  // ONE realtime subscription for the whole app
  const rt = useRealtimeSync(['transactions'], () => {
    if (!user) return;
    _cacheTime = 0;
    _fetchTransactions(user.id, true);
  });
  realtimeRef.current = rt;
  _suppressNext = rt.suppressNext;

  const fetchTransactions = useCallback(async (_reset = false, _full = false) => {
    if (user) await _fetchTransactions(user.id, true);
  }, [user]);

  const addTransaction = useCallback(async (transaction: Omit<Transaction, 'id' | 'createdAt'> & { contactId?: string; currencyCode?: string; exchangeRate?: number }) => {
    if (!user) return;
    if (guardOffline()) return;

    const idempotencyKey = `${user.id}|${transaction.date}|${transaction.amount}|${transaction.description}|${transaction.fundId}|${transaction.type}|${transaction.category}`;
    if (_pendingSubmissions.has(idempotencyKey)) {
      console.warn('[useTransactions] Duplicate submission blocked (frontend):', idempotencyKey);
      return;
    }
    _pendingSubmissions.add(idempotencyKey);

    try {
      const { data, error } = await supabase.rpc('process_transaction', {
        p_type: transaction.type,
        p_category: transaction.category,
        p_amount: transaction.amount,
        p_description: transaction.description,
        p_date: transaction.date,
        p_fund_id: transaction.fundId || null,
        p_contact_id: transaction.contactId || null,
        p_project_id: transaction.projectId || null,
        p_notes: transaction.notes || null,
        p_currency_code: transaction.currencyCode || 'USD',
        p_exchange_rate: transaction.exchangeRate || 1,
        p_to_fund_id: transaction.toFundId || null,
      });

      if (error) {
        // Backend dedup index caught a duplicate (DB-level guarantee)
        const msg = (error as any)?.message || '';
        if (msg.includes('transactions_manual_dedup_idx') || (error as any)?.code === '23505') {
          console.warn('[useTransactions] Duplicate blocked at DB level');
          toast.info('تم تجاهل عملية مكررة');
          return;
        }
        toast.error('خطأ في إضافة العملية');
        console.error(error);
        return;
      }
      if (data && transaction.attachment) {
        await supabase.from('transactions').update({ attachments: [transaction.attachment] }).eq('id', data as string);
      }
      toast.success('تم إضافة العملية بنجاح');
      if (user) {
        logToActivity(user.id, 'transaction_created', 'transaction', data as string, transaction.description, { amount: transaction.amount, type: transaction.type, category: transaction.category });
      }
      _cacheTime = 0;
      _suppressNext(500);
      return data;
    } finally {
      setTimeout(() => _pendingSubmissions.delete(idempotencyKey), 2000);
    }
  }, [user]);

  const updateTransaction = useCallback(async (transactionId: string, updates: Omit<Transaction, 'id' | 'createdAt'> & { contactId?: string; currencyCode?: string; exchangeRate?: number }) => {
    if (!user) return;
    if (guardOffline()) return;

    const { error } = await supabase.rpc('update_transaction', {
      p_transaction_id: transactionId,
      p_type: updates.type,
      p_category: updates.category,
      p_amount: updates.amount,
      p_description: updates.description,
      p_date: updates.date,
      p_fund_id: updates.fundId || null,
      p_contact_id: updates.contactId || null,
      p_notes: updates.notes || null,
      p_currency_code: updates.currencyCode || 'USD',
      p_exchange_rate: updates.exchangeRate || 1,
    });

    if (error) { toast.error('خطأ في تعديل العملية'); console.error(error); return; }
    toast.success('تم تعديل العملية بنجاح');
    if (user) {
      logToActivity(user.id, 'transaction_modified', 'transaction', transactionId, updates.description, { amount: updates.amount, type: updates.type, category: updates.category });
    }
    _cacheTime = 0;
    _suppressNext(500);
  }, [user]);

  const deleteTransaction = useCallback(async (transactionId: string) => {
    if (guardOffline()) return;
    const txToDelete = _state.transactions.find(t => t.id === transactionId);
    const { error } = await supabase.rpc('reverse_transaction', { p_transaction_id: transactionId });
    if (error) { toast.error('خطأ في حذف العملية'); console.error(error); return; }
    toast.success('تم حذف العملية');
    if (user && txToDelete) {
      logToActivity(user.id, 'transaction_deleted', 'transaction', transactionId, txToDelete.description, { amount: txToDelete.amount, type: txToDelete.type, category: txToDelete.category }, 'deleted');
    }
    // Optimistic removal
    setState({ transactions: _state.transactions.filter(t => t.id !== transactionId) });
    _cacheTime = 0;
    _suppressNext(500);
  }, [user]);

  const getMonthlyTrend = useCallback((): TrendData[] => calculateMonthlyTrend(state.transactions), [state.transactions]);
  const getExpenseBreakdown = useCallback((): ChartData[] => calculateExpenseBreakdown(state.transactions), [state.transactions]);

  const loadMore = useCallback(async () => {
    if (user && state.hasMore && !state.loadingMore) {
      await _fetchTransactions(user.id, true, true);
    }
  }, [user, state.hasMore, state.loadingMore]);

  return {
    transactions: state.transactions,
    loading: state.loading,
    loadingMore: state.loadingMore,
    initialLoaded: !state.loading,
    hasMore: state.hasMore,
    addTransaction, updateTransaction, deleteTransaction,
    loadMore,
    getMonthlyTrend, getExpenseBreakdown,
    fetchTransactions,
  };
}

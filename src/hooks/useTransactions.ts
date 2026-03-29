import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Transaction, TransactionType, TransactionCategory, TrendData, ChartData } from '@/types/finance';
import { calculateMonthlyTrend, calculateExpenseBreakdown } from '@/utils/calculationEngine';
import { compareTransactionsByBusinessDateDesc } from '@/utils/transactionSort';
import { useRealtimeSync } from './useRealtimeSync';

// Activity log helper (fire-and-forget)
const logToActivity = async (userId: string, eventType: string, entityType: string, entityId: string | null, entityName: string | null, details: Record<string, any> = {}, status = 'active') => {
  try { await supabase.from('activity_log').insert({ user_id: userId, event_type: eventType, entity_type: entityType, entity_id: entityId, entity_name: entityName, details, status } as any); } catch {}
};

const FETCH_BATCH_SIZE = 500;
const MAX_FETCH_ROWS = 1000; // حد أقصى للجلب الأولي

// كاش بسيط لمنع إعادة الجلب عند التنقل بين الصفحات
let _cachedTransactions: any[] | null = null;
let _cacheUserId: string | null = null;
let _cacheTime = 0;
const CACHE_TTL = 30_000; // 30 ثانية

export function useTransactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const fetchTransactions = useCallback(async (_reset = false) => {
    if (!user) return;

    // استخدام الكاش إذا كان حديثاً
    if (!_reset && _cachedTransactions && _cacheUserId === user.id && (Date.now() - _cacheTime) < CACHE_TTL) {
      setTransactions(_cachedTransactions as any);
      setLoading(false);
      setInitialLoaded(true);
      return;
    }

    setLoading(true);

    const allRows: any[] = [];
    let from = 0;
    let keepFetching = true;

    while (keepFetching && from < MAX_FETCH_ROWS) {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, type, category, amount, description, date, fund_id, account_id, contact_id, project_id, notes, attachments, created_at, currency_code, exchange_rate, source_type, created_by_name')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + FETCH_BATCH_SIZE - 1);

      if (error) {
        console.error('Error fetching transactions:', error);
        keepFetching = false;
        break;
      }

      const batch = data || [];
      allRows.push(...batch);
      keepFetching = batch.length === FETCH_BATCH_SIZE;
      from += FETCH_BATCH_SIZE;
    }

    const mapped = allRows
      .map(t => ({
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
      }))
      .sort(compareTransactionsByBusinessDateDesc);

    setTransactions(mapped);
    _cachedTransactions = mapped;
    _cacheUserId = user.id;
    _cacheTime = Date.now();
    setHasMore(false);
    setLoading(false);
    setInitialLoaded(true);
  }, [user]);

  useEffect(() => {
    if (user) fetchTransactions(true);
  }, [user, fetchTransactions]);

  // Realtime: auto-refresh when transactions change
  useRealtimeSync(['transactions'], () => {
    _cachedTransactions = null;
    _cacheTime = 0;
    fetchTransactions(true);
  });

  const loadMore = useCallback(() => {
    return;
  }, []);

  // استخدام RPC للذرية
  const addTransaction = useCallback(async (transaction: Omit<Transaction, 'id' | 'createdAt'> & { contactId?: string; currencyCode?: string; exchangeRate?: number }) => {
    if (!user) return;
    
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
    
    if (error) { toast.error('خطأ في إضافة العملية'); console.error(error); return; }
    // Save attachments separately if provided
    if (data && transaction.attachment) {
      await supabase.from('transactions').update({ attachments: [transaction.attachment] }).eq('id', data as string);
    }
    toast.success('تم إضافة العملية بنجاح');
    // Log to activity
    if (user) {
      await logToActivity(user.id, 'transaction_created', 'transaction', data as string, transaction.description, { amount: transaction.amount, type: transaction.type, category: transaction.category });
    }
    // مزامنة أرصدة الحسابات من الدفتر الموحد
    if (user) {
      await (supabase.rpc as any)('sync_contact_balances');
    }
    await fetchTransactions(true);
    return data;
  }, [user, fetchTransactions]);

  // تحديث عملية موجودة (UPDATE وليس INSERT)
  const updateTransaction = useCallback(async (transactionId: string, updates: Omit<Transaction, 'id' | 'createdAt'> & { contactId?: string; currencyCode?: string; exchangeRate?: number }) => {
    if (!user) return;
    
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
    // Log to activity
    if (user) {
      await logToActivity(user.id, 'transaction_modified', 'transaction', transactionId, updates.description, { amount: updates.amount, type: updates.type, category: updates.category });
    }
    if (user) {
      await (supabase.rpc as any)('sync_contact_balances');
    }
    await fetchTransactions(true);
  }, [user, fetchTransactions]);

  // استخدام RPC للحذف الذري
  const deleteTransaction = useCallback(async (transactionId: string) => {
    // Capture transaction details before deleting for audit trail
    const txToDelete = transactions.find(t => t.id === transactionId);
    const { error } = await supabase.rpc('reverse_transaction', {
      p_transaction_id: transactionId,
    });
    if (error) { toast.error('خطأ في حذف العملية'); console.error(error); return; }
    toast.success('تم حذف العملية');
    // Log deletion to activity
    if (user && txToDelete) {
      await logToActivity(user.id, 'transaction_deleted', 'transaction', transactionId, txToDelete.description, { amount: txToDelete.amount, type: txToDelete.type, category: txToDelete.category }, 'deleted');
    }
    // مزامنة أرصدة الحسابات من الدفتر الموحد
    if (user) {
      await (supabase.rpc as any)('sync_contact_balances');
    }
    await fetchTransactions(true);
  }, [user, transactions, fetchTransactions]);

  const getMonthlyTrend = useCallback((): TrendData[] => calculateMonthlyTrend(transactions), [transactions]);

  const getExpenseBreakdown = useCallback((): ChartData[] => calculateExpenseBreakdown(transactions), [transactions]);

  return {
    transactions, loading, initialLoaded, hasMore,
    addTransaction, updateTransaction, deleteTransaction, loadMore,
    getMonthlyTrend, getExpenseBreakdown,
    fetchTransactions,
  };
}

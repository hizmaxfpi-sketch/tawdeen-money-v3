import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Debt, DebtType, DebtStatus } from '@/types/finance';
import { useRealtimeSync } from './useRealtimeSync';

export function useDebts() {
  const { user } = useAuth();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const realtimeRef = useRef<{ suppressNext: (ms?: number) => void }>({ suppressNext: () => {} });

  const fetchDebts = useCallback(async () => {
    if (!user) return;
    if (!initialLoaded) setLoading(true);
    const { data, error } = await supabase
      .from('debts')
      .select('id, type, account_id, contact_id, description, original_amount, remaining_amount, due_date, status, created_at, debt_payments(id, amount, date, fund_id, note), contact:contacts!debts_contact_id_fkey(name)')
      .order('created_at', { ascending: false });
    if (error) { console.error('Error fetching debts:', error); }
    else {
      setDebts((data || []).map(d => ({
        id: d.id,
        type: d.type as DebtType,
        accountId: d.account_id || d.contact_id || '',
        accountName: (d.contact as any)?.name || d.description || '',
        amount: Number(d.original_amount),
        remainingAmount: Number(d.remaining_amount),
        description: d.description || '',
        dueDate: d.due_date || undefined,
        status: d.status as DebtStatus,
        payments: (d.debt_payments || []).map((p: any) => ({
          id: p.id,
          amount: Number(p.amount),
          date: new Date(p.date),
          fundId: p.fund_id || '',
          note: p.note || undefined,
        })),
        createdAt: new Date(d.created_at),
      })));
    }
    setLoading(false);
    setInitialLoaded(true);
  }, [user, initialLoaded]);

  useEffect(() => {
    if (user) fetchDebts();
  }, [user, fetchDebts]);

  // Realtime: auto-refresh when debts change
  const rt = useRealtimeSync(['debts'], () => {
    fetchDebts();
  });
  realtimeRef.current = rt;

  const addDebt = useCallback(async (debt: Omit<Debt, 'id' | 'createdAt' | 'payments' | 'status'>) => {
    if (!user) return;
    const { error } = await supabase.from('debts').insert({
      user_id: user.id,
      type: debt.type,
      account_id: debt.accountId || null,
      contact_id: debt.accountId || null,
      description: debt.description,
      original_amount: debt.amount,
      remaining_amount: debt.remainingAmount,
      due_date: debt.dueDate || null,
      status: 'pending',
    });
    if (error) { toast.error('خطأ في إضافة المديونية'); console.error(error); return; }
    toast.success('تم إضافة المديونية بنجاح');
    realtimeRef.current.suppressNext();
    await fetchDebts();
  }, [user, fetchDebts]);

  const addDebtPayment = useCallback(async ({ debtId, amount, fundId, note }: { debtId: string; amount: number; fundId: string; note?: string }) => {
    if (!user) return;
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;

    await supabase.from('debt_payments').insert({
      user_id: user.id,
      debt_id: debtId,
      amount,
      fund_id: fundId || null,
      note: note || null,
    });

    const newRemaining = Math.max(0, debt.remainingAmount - amount);
    const newStatus = newRemaining <= 0 ? 'paid' : 'partial';
    await supabase.from('debts').update({ remaining_amount: newRemaining, status: newStatus }).eq('id', debtId);

    // تحديث رصيد الصندوق ذرياً
    if (fundId) {
      const { data: fundData } = await supabase.from('funds').select('balance').eq('id', fundId).single();
      if (fundData) {
        const balanceChange = debt.type === 'receivable' ? amount : -amount;
        await supabase.from('funds').update({ balance: Number(fundData.balance) + balanceChange }).eq('id', fundId);
      }
    }

    toast.success('تم تسجيل السداد بنجاح');
    realtimeRef.current.suppressNext();
    await fetchDebts();
  }, [user, debts, fetchDebts]);

  const deleteDebt = useCallback(async (id: string) => {
    const { error } = await supabase.from('debts').delete().eq('id', id);
    if (error) { toast.error('خطأ في حذف المديونية'); return; }
    toast.success('تم حذف المديونية');
    realtimeRef.current.suppressNext();
    await fetchDebts();
  }, [fetchDebts]);

  return {
    debts, loading, initialLoaded,
    addDebt, addDebtPayment, deleteDebt,
    fetchDebts,
  };
}

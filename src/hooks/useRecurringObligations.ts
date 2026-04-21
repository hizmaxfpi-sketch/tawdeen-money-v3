import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type ObligationType = 'salary' | 'rent' | 'subscription' | 'installment' | 'other';
export type DraftStatus = 'draft' | 'posted' | 'skipped';

export interface RecurringObligation {
  id: string;
  user_id: string;
  name: string;
  obligation_type: ObligationType;
  category: string;
  default_fund_id: string | null;
  due_day: number;
  start_date: string;
  total_months: number | null;
  posted_count: number;
  is_active: boolean;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface ObligationItem {
  id: string;
  obligation_id: string;
  user_id: string;
  name: string;
  base_amount: number;
  working_days: number;
  account_id: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface ObligationDraft {
  id: string;
  obligation_id: string;
  user_id: string;
  period_year: number;
  period_month: number;
  due_date: string;
  total_amount: number;
  status: DraftStatus;
  fund_id: string | null;
  transaction_id: string | null;
  posted_at: string | null;
  notes: string | null;
}

export interface ObligationDraftItem {
  id: string;
  draft_id: string;
  item_id: string | null;
  user_id: string;
  name: string;
  base_amount: number;
  absence_days: number;
  absence_deduction: number;
  advance_deduction: number;
  bonus: number;
  net_amount: number;
  account_id: string | null;
  notes: string | null;
}

export function useRecurringObligations() {
  const { user } = useAuth();
  const profile = (user?.user_metadata?.full_name ? { full_name: user.user_metadata.full_name as string } : null);
  const [obligations, setObligations] = useState<RecurringObligation[]>([]);
  const [items, setItems] = useState<ObligationItem[]>([]);
  const [drafts, setDrafts] = useState<ObligationDraft[]>([]);
  const [draftItems, setDraftItems] = useState<ObligationDraftItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [o, i, d, di] = await Promise.all([
        supabase.from('recurring_obligations').select('*').order('created_at', { ascending: false }),
        supabase.from('obligation_items').select('*').order('created_at', { ascending: true }),
        supabase.from('obligation_drafts').select('*').order('due_date', { ascending: false }),
        supabase.from('obligation_draft_items').select('*'),
      ]);
      if (o.data) setObligations(o.data as RecurringObligation[]);
      if (i.data) setItems(i.data as ObligationItem[]);
      if (d.data) setDrafts(d.data as ObligationDraft[]);
      if (di.data) setDraftItems(di.data as ObligationDraftItem[]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const generateDrafts = useCallback(async (silent = false) => {
    if (!user) return 0;
    const { data, error } = await supabase.rpc('generate_obligation_drafts', { p_user_id: user.id });
    if (error) {
      if (!silent) toast.error('تعذر تحديث المستحقات');
      return 0;
    }

    const created = Number(data ?? 0);
    if (created > 0) {
      await loadAll();
      if (!silent) {
        toast.info(`تم إنشاء ${created} مسودة التزام جديدة للمراجعة`);
      }
    }

    return created;
  }, [user, loadAll]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-generate drafts on mount (today >= due_day)
  useEffect(() => {
    if (!user) return;
    generateDrafts();
  }, [user, generateDrafts]);

  // ==== Obligation CRUD (optimistic — no full reload) ====
  const addObligation = useCallback(async (
    payload: Omit<RecurringObligation, 'id' | 'user_id' | 'created_at' | 'posted_count' | 'created_by_name'>,
    initialItems: Array<Omit<ObligationItem, 'id' | 'obligation_id' | 'user_id'>> = []
  ) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('recurring_obligations')
      .insert({ ...payload, user_id: user.id, created_by_name: profile?.full_name || null })
      .select().single();
    if (error) { toast.error('فشل إنشاء الالتزام'); return null; }
    // Optimistic insert
    setObligations(prev => [data as RecurringObligation, ...prev]);
    if (initialItems.length > 0) {
      const { data: itemsData } = await supabase.from('obligation_items').insert(
        initialItems.map(it => ({ ...it, obligation_id: data.id, user_id: user.id }))
      ).select();
      if (itemsData) setItems(prev => [...prev, ...(itemsData as ObligationItem[])]);
    }
    await generateDrafts(true);
    toast.success('تم إنشاء الالتزام');
    return data as RecurringObligation;
  }, [user, profile, generateDrafts]);

  const updateObligation = useCallback(async (id: string, patch: Partial<RecurringObligation>) => {
    // Optimistic update
    setObligations(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
    const { error } = await supabase.from('recurring_obligations').update(patch).eq('id', id);
    if (error) { toast.error('فشل التحديث'); await loadAll(); return; }
    await generateDrafts(true);
  }, [loadAll, generateDrafts]);

  const deleteObligation = useCallback(async (id: string) => {
    // Snapshot draft IDs belonging to this obligation so we can also clear their items locally
    const draftIdsToRemove = drafts.filter(d => d.obligation_id === id).map(d => d.id);
    setObligations(prev => prev.filter(o => o.id !== id));
    setItems(prev => prev.filter(i => i.obligation_id !== id));
    setDrafts(prev => prev.filter(d => d.obligation_id !== id));
    setDraftItems(prev => prev.filter(di => !draftIdsToRemove.includes(di.draft_id)));
    const { error } = await supabase.from('recurring_obligations').delete().eq('id', id);
    if (error) { toast.error('فشل الحذف'); await loadAll(); return; }
    toast.success('تم الحذف');
  }, [drafts, loadAll]);

  // ==== Item CRUD ====
  const addItem = useCallback(async (obligationId: string, payload: Omit<ObligationItem, 'id' | 'obligation_id' | 'user_id'>) => {
    if (!user) return;
    const { data, error } = await supabase.from('obligation_items').insert({
      ...payload, obligation_id: obligationId, user_id: user.id,
    }).select().single();
    if (error) { toast.error('فشل الإضافة'); return; }
    if (data) setItems(prev => [...prev, data as ObligationItem]);
  }, [user]);

  const updateItem = useCallback(async (id: string, patch: Partial<ObligationItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    const { error } = await supabase.from('obligation_items').update(patch).eq('id', id);
    if (error) { toast.error('فشل التحديث'); await loadAll(); return; }
  }, [loadAll]);

  const deleteItem = useCallback(async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    const { error } = await supabase.from('obligation_items').delete().eq('id', id);
    if (error) { toast.error('فشل الحذف'); await loadAll(); return; }
  }, [loadAll]);

  // ==== Draft Item adjustments ====
  const updateDraftItem = useCallback(async (id: string, patch: Partial<ObligationDraftItem>) => {
    // Recompute net if any of the components changed
    const current = draftItems.find(d => d.id === id);
    if (current) {
      const merged = { ...current, ...patch };
      const dailyRate = merged.base_amount / 30;
      const absenceDeduction = patch.absence_days !== undefined ? dailyRate * (patch.absence_days || 0) : merged.absence_deduction;
      const net = (merged.base_amount || 0) - (absenceDeduction || 0) - (merged.advance_deduction || 0) + (merged.bonus || 0);
      patch = { ...patch, absence_deduction: absenceDeduction, net_amount: net };
    }
    const { error } = await supabase.from('obligation_draft_items').update(patch).eq('id', id);
    if (error) { toast.error('فشل التحديث'); return; }
    // Recompute draft total
    const item = draftItems.find(d => d.id === id);
    if (item) {
      const all = draftItems.filter(d => d.draft_id === item.draft_id).map(d => d.id === id ? { ...d, ...patch } as ObligationDraftItem : d);
      const total = all.reduce((s, d) => s + (d.net_amount || 0), 0);
      await supabase.from('obligation_drafts').update({ total_amount: total }).eq('id', item.draft_id);
    }
    await loadAll();
  }, [draftItems, loadAll]);

  const addDraftItem = useCallback(async (draftId: string, payload: Omit<ObligationDraftItem, 'id' | 'draft_id' | 'user_id'>) => {
    if (!user) return;
    const { error } = await supabase.from('obligation_draft_items').insert({
      ...payload, draft_id: draftId, user_id: user.id,
    });
    if (error) { toast.error('فشل الإضافة'); return; }
    const all = [...draftItems.filter(d => d.draft_id === draftId), payload as any];
    const total = all.reduce((s, d) => s + (d.net_amount || 0), 0);
    await supabase.from('obligation_drafts').update({ total_amount: total }).eq('id', draftId);
    await loadAll();
  }, [user, draftItems, loadAll]);

  const removeDraftItem = useCallback(async (id: string) => {
    const item = draftItems.find(d => d.id === id);
    const { error } = await supabase.from('obligation_draft_items').delete().eq('id', id);
    if (error) { toast.error('فشل الحذف'); return; }
    if (item) {
      const remaining = draftItems.filter(d => d.draft_id === item.draft_id && d.id !== id);
      const total = remaining.reduce((s, d) => s + (d.net_amount || 0), 0);
      await supabase.from('obligation_drafts').update({ total_amount: total }).eq('id', item.draft_id);
    }
    await loadAll();
  }, [draftItems, loadAll]);

  // ==== Post draft ====
  const postDraft = useCallback(async (draftId: string, fundId: string, date: string) => {
    if (!user) return false;
    const { error } = await supabase.rpc('post_obligation_draft', {
      p_draft_id: draftId,
      p_fund_id: fundId,
      p_date: date,
      p_user_id: user.id,
      p_created_by_name: profile?.full_name || null,
    });
    if (error) { toast.error('فشل الترحيل: ' + error.message); return false; }
    // Optimistic: mark draft as posted locally
    setDrafts(prev => prev.map(d => d.id === draftId
      ? { ...d, status: 'posted' as DraftStatus, fund_id: fundId, posted_at: new Date().toISOString() }
      : d));
    toast.success('تم ترحيل الالتزام إلى المصاريف');
    // Background refresh to pick up new transaction & posted_count
    loadAll();
    return true;
  }, [user, profile, loadAll]);

  const skipDraft = useCallback(async (draftId: string) => {
    setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'skipped' as DraftStatus } : d));
    const { error } = await supabase.from('obligation_drafts').update({ status: 'skipped' }).eq('id', draftId);
    if (error) { toast.error('فشل'); await loadAll(); return; }
    toast.success('تم تخطي المسودة');
  }, [loadAll]);

  const deleteDraft = useCallback(async (draftId: string) => {
    setDrafts(prev => prev.filter(d => d.id !== draftId));
    setDraftItems(prev => prev.filter(di => di.draft_id !== draftId));
    const { error } = await supabase.from('obligation_drafts').delete().eq('id', draftId);
    if (error) { toast.error('فشل الحذف'); await loadAll(); return; }
  }, [loadAll]);

  return {
    obligations, items, drafts, draftItems, loading,
    addObligation, updateObligation, deleteObligation,
    addItem, updateItem, deleteItem,
    updateDraftItem, addDraftItem, removeDraftItem,
    postDraft, skipDraft, deleteDraft,
    refresh: loadAll,
  };
}

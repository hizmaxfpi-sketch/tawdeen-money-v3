import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Contact,
  ContactType,
  CreateContactInput,
  ContactOption,
  ContactsStats,
} from '@/types/contacts';
import { useRealtimeSync } from './useRealtimeSync';
import { cacheSet, cacheGet } from '@/lib/offlineCache';
import { guardOffline } from '@/lib/offlineGuard';

let _cachedContacts: Contact[] | null = null;
let _contactsCacheUserId: string | null = null;
let _contactsCacheTime = 0;
const CONTACTS_CACHE_TTL = 30_000;

export function useSupabaseContacts() {
  const { user } = useAuth();
  const PAGE_SIZE = 50; // زيادة حجم الصفحة لتقليل الطلبات
  const [contacts, setContacts] = useState<Contact[]>(() => cacheGet<Contact[]>('contacts') || []);
  const [isLoading, setIsLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const realtimeRef = useRef<{ suppressNext: (ms?: number) => void }>({ suppressNext: () => {} });

  const fetchContacts = useCallback(async (reset = false) => {
    if (!user) return;
    // كاش للصفحة الأولى فقط
    if (reset && _cachedContacts && _contactsCacheUserId === user.id && (Date.now() - _contactsCacheTime) < CONTACTS_CACHE_TTL) {
      setContacts(_cachedContacts);
      if (isLoading) setIsLoading(false);
      setInitialLoaded(true);
      return;
    }
    const currentPage = reset ? 0 : page;
    if (!initialLoaded) setIsLoading(true);
    else if (!reset) setLoadingMore(true);

    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, type, custom_type, phone, email, company, address, notes, parent_contact_id, linked_contacts, total_transactions, total_debit, total_credit, balance, status, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (error) { console.error('Error fetching contacts:', error); }
    else {
      const mapped = (data || []).map(c => ({
        id: c.id,
        name: c.name,
        type: c.type as ContactType,
        customType: (c as any).custom_type || undefined,
        phone: c.phone || undefined,
        email: c.email || undefined,
        company: c.company || undefined,
        address: c.address || undefined,
        notes: c.notes || undefined,
        parentContactId: c.parent_contact_id || undefined,
        linkedContacts: c.linked_contacts || undefined,
        totalTransactions: c.total_transactions,
        totalDebit: Number(c.total_debit),
        totalCredit: Number(c.total_credit),
        balance: Number(c.balance),
        status: c.status as Contact['status'],
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
      }));
      if (reset || currentPage === 0) {
        setContacts(mapped);
        cacheSet('contacts', mapped);
        setPage(0);
        _cachedContacts = mapped;
        _contactsCacheUserId = user.id;
        _contactsCacheTime = Date.now();
      } else {
        setContacts(prev => [...prev, ...mapped]);
      }
      setHasMore((data || []).length === PAGE_SIZE);
    }
    setIsLoading(false);
    setLoadingMore(false);
    setInitialLoaded(true);
  }, [user, page, initialLoaded]);

  useEffect(() => {
    if (user) fetchContacts(true);
  }, [user]);

  // Realtime: auto-refresh when contacts change
  const rt = useRealtimeSync(['contacts'], () => {
    _cachedContacts = null;
    _contactsCacheTime = 0;
    fetchContacts(true);
  });
  realtimeRef.current = rt;

  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore) setPage(prev => prev + 1);
  }, [hasMore, loadingMore]);

  useEffect(() => {
    if (page > 0) fetchContacts();
  }, [page]);

  const addContact = useCallback(async (input: CreateContactInput) => {
    if (!user) return;
    if (guardOffline()) return;
    const { data, error } = await supabase.from('contacts').insert({
      user_id: user.id,
      name: input.name,
      type: input.type,
      custom_type: input.customType || null,
      phone: input.phone || null,
      email: input.email || null,
      company: input.company || null,
      address: input.address || null,
      notes: input.notes || null,
      parent_contact_id: input.parentContactId || null,
    } as any).select().single();
    if (error) { toast.error('خطأ في إضافة جهة الاتصال'); console.error(error); return; }
    toast.success('تم إضافة جهة الاتصال بنجاح');
    // Log to activity
    try { await supabase.from('activity_log').insert({ user_id: user.id, event_type: 'contact_created', entity_type: 'contact', entity_id: (data as any)?.id, entity_name: input.name, details: { type: input.type, customType: input.customType }, status: 'active' } as any); } catch {}
    realtimeRef.current.suppressNext();
    fetchContacts(true);
    return data;
  }, [user, fetchContacts]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    if (!user) return;
    if (guardOffline()) return;
    const { error } = await supabase.from('contacts').update({
      name: updates.name,
      type: updates.type,
      phone: updates.phone,
      email: updates.email,
      company: updates.company,
      address: updates.address,
      notes: updates.notes,
    }).eq('id', id);
    if (error) { toast.error('خطأ في تحديث جهة الاتصال'); return; }
    toast.success('تم تحديث جهة الاتصال بنجاح');
    // Log to activity
    try { await supabase.from('activity_log').insert({ user_id: user.id, event_type: 'contact_updated', entity_type: 'contact', entity_id: id, entity_name: updates.name || '', details: { type: updates.type }, status: 'active' } as any); } catch {}
    realtimeRef.current.suppressNext();
    fetchContacts(true);
  }, [user, fetchContacts]);

  const deleteContact = useCallback(async (id: string) => {
    if (!user) return;
    if (guardOffline()) return;
    const contact = contacts.find(c => c.id === id);
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) { toast.error('خطأ في حذف جهة الاتصال'); return; }
    toast.success('تم حذف جهة الاتصال');
    // Log deletion to activity
    if (contact) {
      try { await supabase.from('activity_log').insert({ user_id: user.id, event_type: 'contact_deleted', entity_type: 'contact', entity_id: id, entity_name: contact.name, details: { type: contact.type, balance: contact.balance }, status: 'deleted' } as any); } catch {}
    }
    realtimeRef.current.suppressNext();
    fetchContacts(true);
  }, [user, contacts, fetchContacts]);

  // مزامنة أرصدة الحسابات من الدفتر الموحد (v_contact_balance)
  const syncBalances = useCallback(async () => {
    if (!user) return;
    await (supabase.rpc as any)('sync_contact_balances');
    await fetchContacts(true);
  }, [user, fetchContacts]);

  const updateContactBalance = useCallback(async (_id: string, _amount: number, _type: 'debit' | 'credit') => {
    // deprecated: الأرصدة تُحسب من الدفتر الموحد تلقائياً
    await syncBalances();
  }, [syncBalances]);

  const linkContacts = useCallback(async (contactId: string, linkedContactId: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;
    const currentLinks = contact.linkedContacts || [];
    if (!currentLinks.includes(linkedContactId)) {
      await supabase.from('contacts').update({
        linked_contacts: [...currentLinks, linkedContactId],
      }).eq('id', contactId);
      toast.success('تم ربط جهات الاتصال بنجاح');
      fetchContacts();
    }
  }, [contacts, fetchContacts]);

  const unlinkContacts = useCallback(async (contactId: string, linkedContactId: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;
    await supabase.from('contacts').update({
      linked_contacts: (contact.linkedContacts || []).filter(id => id !== linkedContactId),
    }).eq('id', contactId);
    fetchContacts();
  }, [contacts, fetchContacts]);

  const getContact = useCallback((id: string) => contacts.find(c => c.id === id), [contacts]);

  const searchContacts = useCallback((query: string) => {
    if (!query.trim()) return contacts;
    const lowerQuery = query.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(lowerQuery) ||
      c.phone?.includes(query) ||
      c.email?.toLowerCase().includes(lowerQuery) ||
      c.company?.toLowerCase().includes(lowerQuery)
    );
  }, [contacts]);

  const filterByType = useCallback((type: ContactType | 'all') => {
    if (type === 'all') return contacts;
    return contacts.filter(c => c.type === type);
  }, [contacts]);

  const getLinkedContacts = useCallback((contactId: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact?.linkedContacts) return [];
    return contacts.filter(c => contact.linkedContacts?.includes(c.id));
  }, [contacts]);

  const getSubordinates = useCallback((contactId: string) =>
    contacts.filter(c => c.parentContactId === contactId), [contacts]);

  const getContactOptions = useCallback((type?: ContactType | 'all'): ContactOption[] => {
    let filtered = contacts.filter(c => c.status === 'active');
    if (type && type !== 'all') filtered = filtered.filter(c => c.type === type);
    return filtered.map(c => ({ id: c.id, name: c.name, type: c.type, phone: c.phone, balance: c.balance }));
  }, [contacts]);

  const getClientOptions = useMemo(() =>
    contacts.filter(c => c.type === 'client' && c.status === 'active')
      .map(c => ({ id: c.id, name: c.name, type: c.type, phone: c.phone, balance: c.balance })),
  [contacts]);

  const getVendorOptions = useMemo(() =>
    contacts.filter(c => c.type === 'vendor' && c.status === 'active')
      .map(c => ({ id: c.id, name: c.name, type: c.type, phone: c.phone, balance: c.balance })),
  [contacts]);

  const getStats = useCallback((): ContactsStats => {
    const activeContacts = contacts.filter(c => c.status === 'active');
    return {
      totalContacts: activeContacts.length,
      clients: activeContacts.filter(c => c.type === 'client').length,
      vendors: activeContacts.filter(c => c.type === 'vendor').length,
      shippingAgents: activeContacts.filter(c => c.type === 'shipping_agent').length,
      employees: activeContacts.filter(c => c.type === 'employee').length,
      totalReceivables: activeContacts.reduce((sum, c) => sum + Math.max(0, c.balance), 0),
      totalPayables: activeContacts.reduce((sum, c) => sum + Math.max(0, -c.balance), 0),
    };
  }, [contacts]);

  return {
    contacts, isLoading, hasMore, loadingMore, loadMore,
    addContact, updateContact, deleteContact, updateContactBalance,
    linkContacts, unlinkContacts,
    getContact, searchContacts, filterByType, getLinkedContacts, getSubordinates,
    getContactOptions, getClientOptions, getVendorOptions,
    getStats,
    syncBalances,
    syncWithLedgerAccounts: syncBalances,
  };
}

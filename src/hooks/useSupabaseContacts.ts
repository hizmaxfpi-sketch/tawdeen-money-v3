import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Contact, ContactType, CreateContactInput, ContactOption, ContactsStats,
} from '@/types/contacts';
import { useRealtimeSync } from './useRealtimeSync';
import { cacheSet, cacheGet } from '@/lib/offlineCache';
import { guardOffline } from '@/lib/offlineGuard';

// ============================================================
// SINGLETON STORE for contacts — one fetch / one realtime channel
// ============================================================

const CONTACTS_CACHE_TTL = 30_000;

type Listener = () => void;
const listeners = new Set<Listener>();
let _state: { contacts: Contact[]; loading: boolean } = {
  contacts: cacheGet<Contact[]>('contacts') || [],
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

const mapContact = (c: any): Contact => ({
  id: c.id,
  name: c.name,
  type: c.type as ContactType,
  customType: c.custom_type || undefined,
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
});

async function _fetchContacts(userId: string, force = false): Promise<void> {
  if (!force && _userId === userId && (Date.now() - _cacheTime) < CONTACTS_CACHE_TTL && _state.contacts.length > 0) {
    setState({ loading: false });
    return;
  }
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, type, custom_type, phone, email, company, address, notes, parent_contact_id, linked_contacts, total_transactions, total_debit, total_credit, balance, status, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .range(0, 199); // first 200 contacts; pagination handled separately
      if (error) { console.error('Error fetching contacts:', error); setState({ loading: false }); return; }
      const mapped = (data || []).map(mapContact);
      _userId = userId; _cacheTime = Date.now();
      cacheSet('contacts', mapped);
      setState({ contacts: mapped, loading: false });
    } finally { _inflight = null; }
  })();
  return _inflight;
}

export function useSupabaseContacts() {
  const { user } = useAuth();
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const realtimeRef = useRef<{ suppressNext: (ms?: number) => void }>({ suppressNext: () => {} });

  useEffect(() => {
    if (!user) return;
    if (_bootstrappedUserId !== user.id) {
      _bootstrappedUserId = user.id;
      _userId = null;
      _fetchContacts(user.id, true);
    } else if (_state.contacts.length === 0) {
      _fetchContacts(user.id);
    }
  }, [user]);

  const rt = useRealtimeSync(['contacts'], () => {
    if (!user) return;
    _cacheTime = 0;
    _fetchContacts(user.id, true);
  });
  realtimeRef.current = rt;
  _suppressNext = rt.suppressNext;

  const fetchContacts = useCallback(async (_reset = true) => {
    if (user) await _fetchContacts(user.id, true);
  }, [user]);

  const contacts = state.contacts;

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
    if (data) {
      const newContact = mapContact({ ...data, total_transactions: 0, total_debit: 0, total_credit: 0, balance: 0, status: 'active' });
      setState({ contacts: [newContact, ..._state.contacts] });
    }
    supabase.from('activity_log').insert({ user_id: user.id, event_type: 'contact_created', entity_type: 'contact', entity_id: (data as any)?.id, entity_name: input.name, details: { type: input.type, customType: input.customType }, status: 'active' } as any).then(() => {}, () => {});
    _cacheTime = 0;
    _suppressNext();
    return data;
  }, [user]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    if (!user) return;
    if (guardOffline()) return;
    const { error } = await supabase.from('contacts').update({
      name: updates.name, type: updates.type, phone: updates.phone, email: updates.email,
      company: updates.company, address: updates.address, notes: updates.notes,
    }).eq('id', id);
    if (error) { toast.error('خطأ في تحديث جهة الاتصال'); return; }
    toast.success('تم تحديث جهة الاتصال بنجاح');
    setState({ contacts: _state.contacts.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date() } as Contact : c) });
    supabase.from('activity_log').insert({ user_id: user.id, event_type: 'contact_updated', entity_type: 'contact', entity_id: id, entity_name: updates.name || '', details: { type: updates.type }, status: 'active' } as any).then(() => {}, () => {});
    _cacheTime = 0;
    _suppressNext();
  }, [user]);

  const deleteContact = useCallback(async (id: string) => {
    if (!user) return;
    if (guardOffline()) return;
    const contact = _state.contacts.find(c => c.id === id);
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) { toast.error('خطأ في حذف جهة الاتصال'); return; }
    toast.success('تم حذف جهة الاتصال');
    setState({ contacts: _state.contacts.filter(c => c.id !== id) });
    if (contact) {
      supabase.from('activity_log').insert({ user_id: user.id, event_type: 'contact_deleted', entity_type: 'contact', entity_id: id, entity_name: contact.name, details: { type: contact.type, balance: contact.balance }, status: 'deleted' } as any).then(() => {}, () => {});
    }
    _cacheTime = 0;
    _suppressNext();
  }, [user]);

  const syncBalances = useCallback(async () => {
    if (!user) return;
    _cacheTime = 0;
    await _fetchContacts(user.id, true);
  }, [user]);

  const updateContactBalance = useCallback(async () => { await syncBalances(); }, [syncBalances]);

  const linkContacts = useCallback(async (contactId: string, linkedContactId: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;
    const currentLinks = contact.linkedContacts || [];
    if (!currentLinks.includes(linkedContactId)) {
      await supabase.from('contacts').update({ linked_contacts: [...currentLinks, linkedContactId] }).eq('id', contactId);
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
    const lq = query.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(lq) ||
      c.phone?.includes(query) ||
      c.email?.toLowerCase().includes(lq) ||
      c.company?.toLowerCase().includes(lq)
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
    const active = contacts.filter(c => c.status === 'active');
    return {
      totalContacts: active.length,
      clients: active.filter(c => c.type === 'client').length,
      vendors: active.filter(c => c.type === 'vendor').length,
      shippingAgents: active.filter(c => c.type === 'shipping_agent').length,
      employees: active.filter(c => c.type === 'employee').length,
      totalReceivables: active.reduce((s, c) => s + Math.max(0, c.balance), 0),
      totalPayables: active.reduce((s, c) => s + Math.max(0, -c.balance), 0),
    };
  }, [contacts]);

  return {
    contacts,
    isLoading: state.loading,
    hasMore: false,
    loadingMore: false,
    loadMore: () => {},
    addContact, updateContact, deleteContact, updateContactBalance,
    linkContacts, unlinkContacts,
    getContact, searchContacts, filterByType, getLinkedContacts, getSubordinates,
    getContactOptions, getClientOptions, getVendorOptions,
    getStats,
    syncBalances,
    syncWithLedgerAccounts: syncBalances,
  };
}

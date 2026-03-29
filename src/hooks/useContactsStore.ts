import { useState, useCallback, useEffect, useMemo } from 'react';
import { 
  Contact, 
  ContactType, 
  CreateContactInput, 
  ContactOption,
  ContactsStats,
  ContactTransaction
} from '@/types/contacts';

// مفتاح التخزين المحلي
const STORAGE_KEY = 'contacts_hub';

// وظائف التخزين
function loadFromStorage(): Contact[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored).map((item: any) => ({
        ...item,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
      }));
    }
  } catch (error) {
    console.error('Error loading contacts:', error);
  }
  return [];
}

function saveToStorage(data: Contact[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving contacts:', error);
  }
}

export function useContactsStore() {
  const [contacts, setContacts] = useState<Contact[]>(() => loadFromStorage());

  // حفظ عند التغيير
  useEffect(() => {
    saveToStorage(contacts);
  }, [contacts]);

  // ============= إدارة جهات الاتصال =============

  const addContact = useCallback((input: CreateContactInput): Contact => {
    const newContact: Contact = {
      ...input,
      id: `contact-${Date.now()}`,
      totalTransactions: 0,
      totalDebit: 0,
      totalCredit: 0,
      balance: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setContacts(prev => [...prev, newContact]);
    return newContact;
  }, []);

  const updateContact = useCallback((id: string, updates: Partial<Contact>) => {
    setContacts(prev => prev.map(c => {
      if (c.id === id) {
        return { 
          ...c, 
          ...updates, 
          updatedAt: new Date() 
        };
      }
      return c;
    }));
  }, []);

  const deleteContact = useCallback((id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
  }, []);

  // تحديث الأرصدة المالية
  const updateContactBalance = useCallback((
    id: string, 
    amount: number, 
    type: 'debit' | 'credit'
  ) => {
    setContacts(prev => prev.map(c => {
      if (c.id === id) {
        const newDebit = type === 'debit' ? c.totalDebit + amount : c.totalDebit;
        const newCredit = type === 'credit' ? c.totalCredit + amount : c.totalCredit;
        return {
          ...c,
          totalDebit: newDebit,
          totalCredit: newCredit,
          balance: newDebit - newCredit,
          totalTransactions: c.totalTransactions + 1,
          updatedAt: new Date(),
        };
      }
      return c;
    }));
  }, []);

  // ربط جهتي اتصال
  const linkContacts = useCallback((contactId: string, linkedContactId: string) => {
    setContacts(prev => prev.map(c => {
      if (c.id === contactId) {
        const currentLinks = c.linkedContacts || [];
        if (!currentLinks.includes(linkedContactId)) {
          return {
            ...c,
            linkedContacts: [...currentLinks, linkedContactId],
            updatedAt: new Date(),
          };
        }
      }
      return c;
    }));
  }, []);

  // إزالة ربط جهتي اتصال
  const unlinkContacts = useCallback((contactId: string, linkedContactId: string) => {
    setContacts(prev => prev.map(c => {
      if (c.id === contactId) {
        return {
          ...c,
          linkedContacts: (c.linkedContacts || []).filter(id => id !== linkedContactId),
          updatedAt: new Date(),
        };
      }
      return c;
    }));
  }, []);

  // ============= الاستعلامات =============

  // الحصول على جهة اتصال بالمعرف
  const getContact = useCallback((id: string): Contact | undefined => {
    return contacts.find(c => c.id === id);
  }, [contacts]);

  // البحث في جهات الاتصال
  const searchContacts = useCallback((query: string): Contact[] => {
    if (!query.trim()) return contacts;
    const lowerQuery = query.toLowerCase();
    return contacts.filter(c => 
      c.name.toLowerCase().includes(lowerQuery) ||
      c.phone?.includes(query) ||
      c.email?.toLowerCase().includes(lowerQuery) ||
      c.company?.toLowerCase().includes(lowerQuery)
    );
  }, [contacts]);

  // تصفية حسب النوع
  const filterByType = useCallback((type: ContactType | 'all'): Contact[] => {
    if (type === 'all') return contacts;
    return contacts.filter(c => c.type === type);
  }, [contacts]);

  // الحصول على جهات الاتصال المرتبطة
  const getLinkedContacts = useCallback((contactId: string): Contact[] => {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact?.linkedContacts) return [];
    return contacts.filter(c => contact.linkedContacts?.includes(c.id));
  }, [contacts]);

  // الحصول على التابعين
  const getSubordinates = useCallback((contactId: string): Contact[] => {
    return contacts.filter(c => c.parentContactId === contactId);
  }, [contacts]);

  // ============= خيارات القوائم المنسدلة =============

  const getContactOptions = useCallback((type?: ContactType | 'all'): ContactOption[] => {
    let filtered = contacts.filter(c => c.status === 'active');
    if (type && type !== 'all') {
      filtered = filtered.filter(c => c.type === type);
    }
    return filtered.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      phone: c.phone,
      balance: c.balance,
    }));
  }, [contacts]);

  // العملاء فقط
  const getClientOptions = useMemo(() => {
    return contacts
      .filter(c => c.type === 'client' && c.status === 'active')
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        phone: c.phone,
        balance: c.balance,
      }));
  }, [contacts]);

  // الموردين فقط
  const getVendorOptions = useMemo(() => {
    return contacts
      .filter(c => c.type === 'vendor' && c.status === 'active')
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        phone: c.phone,
        balance: c.balance,
      }));
  }, [contacts]);

  // ============= الإحصائيات =============

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

  // ============= التكامل مع الحسابات الدفترية =============

  // مزامنة مع الحسابات الدفترية (للتوافقية)
  const syncWithLedgerAccounts = useCallback((ledgerAccounts: any[]) => {
    ledgerAccounts.forEach(account => {
      const existingContact = contacts.find(c => 
        c.name === account.name || c.id === account.id
      );
      
      if (!existingContact) {
        // إضافة جهة اتصال جديدة من الحساب الدفتري
        const typeMap: Record<string, ContactType> = {
          'client': 'client',
          'vendor': 'vendor',
          'partner': 'partner',
          'employee': 'employee',
        };
        
        addContact({
          name: account.name,
          type: typeMap[account.type] || 'other',
          phone: account.phone,
          email: account.email,
          notes: account.notes,
        });
      }
    });
  }, [contacts, addContact]);

  return {
    contacts,
    // إدارة جهات الاتصال
    addContact,
    updateContact,
    deleteContact,
    updateContactBalance,
    linkContacts,
    unlinkContacts,
    // الاستعلامات
    getContact,
    searchContacts,
    filterByType,
    getLinkedContacts,
    getSubordinates,
    // خيارات القوائم
    getContactOptions,
    getClientOptions,
    getVendorOptions,
    // الإحصائيات
    getStats,
    // التكامل
    syncWithLedgerAccounts,
  };
}

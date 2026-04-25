import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Plus, Search, UserCheck, Truck, Ship, Briefcase, Handshake, User, ChevronLeft, Phone, MessageCircle, Building2, MoreVertical, TrendingUp, TrendingDown, ArrowRightLeft, Receipt, RefreshCw, Eye, FileText, FileSpreadsheet, Download, Filter, LayoutGrid, List, X, CheckSquare, ClipboardList, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { Contact, ContactType, CONTACT_TYPE_LABELS, CONTACT_TYPE_COLORS } from '@/types/contacts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSupabaseFinance } from '@/hooks/useSupabaseFinance';
import { exportAccountStatement } from '@/utils/accountStatementPdf';
import { generateHDPreviewPDF } from '@/utils/hdPreview';
import { Transaction } from '@/types/finance';
import { formatDateGregorian, formatDateShort, formatAmount, formatNumber } from '@/utils/formatUtils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePersistedFilter } from '@/hooks/usePersistedFilters';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { calculateLedgerSummary, EMPTY_LEDGER_SUMMARY } from '@/utils/ledgerSummary';
import { StatementEntriesView } from '@/components/shared/StatementEntriesView';

const LEGAL_DISCLAIMER = 'هذا المستند تم إنشاؤه آلياً من النظام وهو معتمد بدون توقيع أو ختم. تخلي المؤسسة مسؤوليتها عن أي كشط، شطب، أو تعديل يدوي يطرأ على هذه الورقة.';

const TypeIcons: Record<ContactType | 'all', any> = {
  all: BookOpen, client: UserCheck, vendor: Truck, shipping_agent: Ship,
  employee: Briefcase, partner: Handshake, other: User,
};

const CATEGORY_LABELS: Record<string, string> = {
  client_collection: 'تحصيل', vendor_payment: 'صرف مورد', expense: 'مصروفات',
  partner_payment: 'صرف شريك', partner_collection: 'تحصيل شريك',
  fund_transfer: 'تحويل', debt_payment: 'سداد دين', other: 'أخرى',
};

type ViewMode = 'grid' | 'list';

interface LedgerAccountsPageProps {
  transactions: Transaction[];
  ledgerSummary?: {
    ledgerDebit: number;
    ledgerCredit: number;
    ledgerNet: number;
  };
}

export function LedgerAccountsPage({ transactions, ledgerSummary }: LedgerAccountsPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { contacts, deleteContact, syncBalances } = useSupabaseContacts();
  const perms = useUserPermissions();
  const canEdit = perms.canEdit('contacts');
  const canDelete = perms.canDelete('contacts');
  const canCreate = perms.canCreate('contacts');

  const [searchQuery, setSearchQuery] = usePersistedFilter('ledger-search', '');
  const [selectedTypes, setSelectedTypes] = usePersistedFilter<Set<ContactType>>('ledger-types', new Set());
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempSelectedTypes, setTempSelectedTypes] = useState<Set<ContactType>>(new Set());
  const [viewMode, setViewMode] = usePersistedFilter<ViewMode>('ledger-view', 'grid');
  const [sortBy, setSortBy] = usePersistedFilter<string>('ledger-sort', 'updated_desc');
  const [isSyncing, setIsSyncing] = useState(false);
  const [statementContact, setStatementContact] = useState<Contact | null>(null);
  const [statementTxs, setStatementTxs] = useState<Transaction[]>([]);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const statementRef = useRef<HTMLDivElement>(null);
  const [showFilteredPreview, setShowFilteredPreview] = useState(false);
  const [statementViewMode, setStatementViewMode] = useState<'table' | 'cards'>('table');

  // Get all unique types from actual contacts in DB, with custom types expanded
  const availableTypes = useMemo(() => {
    const types = new Set<ContactType>();
    contacts.forEach(c => types.add(c.type));
    return Array.from(types);
  }, [contacts]);

  // Get unique custom type names for 'other' contacts
  const customTypeNames = useMemo(() => {
    const names = new Set<string>();
    contacts.filter(c => c.type === 'other' && c.customType).forEach(c => names.add(c.customType!));
    return Array.from(names);
  }, [contacts]);

  // Custom type filter: track selected custom type names separately
  const [selectedCustomTypes, setSelectedCustomTypes] = usePersistedFilter<Set<string>>('ledger-custom-types', new Set());

  const contactLedgerSummaries = useMemo(() => {
    const grouped = new Map<string, Transaction[]>();

    transactions.forEach((transaction) => {
      if (!transaction.contactId) return;
      const current = grouped.get(transaction.contactId) || [];
      current.push(transaction);
      grouped.set(transaction.contactId, current);
    });

    const summaries = new Map<string, ReturnType<typeof calculateLedgerSummary>>();
    grouped.forEach((contactTransactions, contactId) => {
      summaries.set(contactId, calculateLedgerSummary(contactTransactions));
    });

    return summaries;
  }, [transactions]);

  // ✅ Source of truth: ledger contacts' own transactions, NOT dashboard snapshot.
  // Dashboard snapshot is only a fallback display value if local data not yet loaded.
  const ledgerTransactionStats = useMemo(() => {
    const activeContacts = contacts.filter(c => c.status === 'active');
    const totals = activeContacts.reduce((summary, contact) => {
      const contactSummary = contactLedgerSummaries.get(contact.id) || EMPTY_LEDGER_SUMMARY;
      summary.totalTransactions += contactSummary.transactionCount;
      summary.totalDebit += contactSummary.totalDebit;
      summary.totalCredit += contactSummary.totalCredit;
      return summary;
    }, { totalTransactions: 0, totalDebit: 0, totalCredit: 0 });
    // Prefer locally-computed totals (always live & accurate); fall back to snapshot only if no data yet.
    const hasLocal = transactions.length > 0 || activeContacts.length > 0;
    const totalDebit = hasLocal ? totals.totalDebit : (ledgerSummary?.ledgerDebit ?? 0);
    const totalCredit = hasLocal ? totals.totalCredit : (ledgerSummary?.ledgerCredit ?? 0);
    const netBalance = totalDebit - totalCredit;
    return { totalTransactions: totals.totalTransactions, totalIncome: totalDebit, totalExpenses: totalCredit, netBalance };
  }, [contacts, contactLedgerSummaries, ledgerSummary, transactions.length]);

  const handleSyncBalances = async () => {
    setIsSyncing(true);
    try {
      await syncBalances();
      toast.success('تم تحديث الأرصدة بنجاح');
    } catch {
      toast.error('خطأ في تحديث الأرصدة');
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredContacts = useMemo(() => {
    let result = [...contacts];
    if (selectedTypes.size > 0 || selectedCustomTypes.size > 0) {
      result = result.filter(c => {
        // Standard type match
        if (c.type !== 'other' && selectedTypes.has(c.type)) return true;
        // Custom type match
        if (c.type === 'other' && c.customType && selectedCustomTypes.has(c.customType)) return true;
        // If only standard types selected and no custom types, exclude 'other' unless explicitly selected
        if (c.type === 'other' && !c.customType && selectedTypes.has('other')) return true;
        // If nothing selected from relevant sets, exclude
        if (selectedTypes.size === 0 && selectedCustomTypes.size > 0) return false;
        if (selectedCustomTypes.size === 0 && selectedTypes.size > 0 && c.type === 'other') return false;
        return false;
      });
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.phone?.includes(query) ||
        c.email?.toLowerCase().includes(query) ||
        c.company?.toLowerCase().includes(query)
      );
    }
    const getSummary = (id: string) => contactLedgerSummaries.get(id) || EMPTY_LEDGER_SUMMARY;
    result.sort((a, b) => {
      switch (sortBy) {
        case 'updated_desc':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'updated_asc':
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case 'created_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'created_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name_asc':
          return a.name.localeCompare(b.name, 'ar');
        case 'name_desc':
          return b.name.localeCompare(a.name, 'ar');
        case 'most_active':
          return getSummary(b.id).transactionCount - getSummary(a.id).transactionCount;
        case 'least_active':
          return getSummary(a.id).transactionCount - getSummary(b.id).transactionCount;
        case 'balance_desc':
          return Math.abs(getSummary(b.id).balance) - Math.abs(getSummary(a.id).balance);
        case 'balance_asc':
          return Math.abs(getSummary(a.id).balance) - Math.abs(getSummary(b.id).balance);
        case 'debit_desc':
          return getSummary(b.id).totalDebit - getSummary(a.id).totalDebit;
        case 'credit_desc':
          return getSummary(b.id).totalCredit - getSummary(a.id).totalCredit;
        default:
          return 0;
      }
    });
    return result;
  }, [contacts, selectedTypes, selectedCustomTypes, searchQuery, sortBy, contactLedgerSummaries]);

  const handleAddAccount = () => navigate('/contacts/add');
  const handleViewAccount = (contact: Contact) => navigate(`/ledger/${contact.id}`);
  const handleEditAccount = (contact: Contact) => navigate(`/contacts/edit/${contact.id}`);
  const handleDeleteAccount = async (contactId: string) => {
    // Check if account has related transactions
    const hasTransactions = transactions.some(t => t.contactId === contactId);
    if (hasTransactions) {
      toast.error('لا يمكن حذف هذا الحساب لوجود عمليات مالية مرتبطة به. قم بحذف العمليات أولاً.');
      return;
    }
    const contact = contacts.find(c => c.id === contactId);
    if (confirm('هل أنت متأكد من حذف هذا الحساب الدفتري؟')) {
      // Log to activity log
      if (user && contact) {
        await supabase.from('activity_log').insert({
          user_id: user.id,
          event_type: 'account_deleted',
          entity_type: 'account',
          entity_id: contactId,
          entity_name: contact.name,
          details: { type: contact.type, balance: contact.balance },
          status: 'deleted',
        } as any);
      }
      deleteContact(contactId);
    }
  };

  // Filter modal handlers
  const [tempSelectedCustomTypes, setTempSelectedCustomTypes] = useState<Set<string>>(new Set());
  const openFilterModal = () => {
    setTempSelectedTypes(new Set(selectedTypes));
    setTempSelectedCustomTypes(new Set(selectedCustomTypes));
    setShowFilterModal(true);
  };

  const handleToggleType = (type: ContactType) => {
    setTempSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleSelectAll = () => { setTempSelectedTypes(new Set(availableTypes)); setTempSelectedCustomTypes(new Set(customTypeNames)); };
  const handleClearAll = () => { setTempSelectedTypes(new Set()); setTempSelectedCustomTypes(new Set()); };
  const handleApplyFilter = () => {
    setSelectedTypes(new Set(tempSelectedTypes));
    setSelectedCustomTypes(new Set(tempSelectedCustomTypes));
    setShowFilterModal(false);
  };

  const fetchContactTransactions = async (contactId: string): Promise<Transaction[]> => {
    if (!user) return [];
    const { data, error } = await supabase
      .from('transactions')
      .select('id, type, category, amount, description, date, fund_id, contact_id, project_id, notes, created_at')
      .eq('contact_id', contactId)
      .order('date', { ascending: true });
    
    if (error) { console.error('Error fetching contact transactions:', error); return []; }
    return (data || []).map(t => ({
      id: t.id, type: t.type as any, category: t.category as any, amount: Number(t.amount),
      description: t.description || '', date: t.date, fundId: t.fund_id || '',
      contactId: t.contact_id || undefined, projectId: t.project_id || undefined,
      notes: t.notes || undefined, createdAt: new Date(t.created_at),
    }));
  };

  const handleHDPreview = async (contact: Contact) => {
    setLoadingStatement(true);
    setStatementContact(contact);
    const txs = await fetchContactTransactions(contact.id);
    setStatementTxs(txs);
    setLoadingStatement(false);
  };

  const handleExportStatementPDF = async (contact: Contact) => {
    const contactTxs = await fetchContactTransactions(contact.id);
    const ledgerSummary = calculateLedgerSummary(contactTxs);
    exportAccountStatement({
      entityName: contact.name, entityType: contact.type === 'other' && contact.customType ? contact.customType : CONTACT_TYPE_LABELS[contact.type],
      balance: ledgerSummary.balance, totalDebit: ledgerSummary.totalDebit, totalCredit: ledgerSummary.totalCredit,
      phone: contact.phone || undefined, email: contact.email || undefined, company: contact.company || undefined,
      transactions: contactTxs,
    });
    toast.success('تم تصدير كشف الحساب PDF');
  };

  const handleExportStatementExcel = async (contact: Contact) => {
    const contactTxs = await fetchContactTransactions(contact.id);
    const header = 'التاريخ,البيان,التصنيف,مدين,دائن,الرصيد\n';
    let running = 0;
    const rows = contactTxs.map(t => {
      if (t.type === 'in') running += t.amount; else running -= t.amount;
      return `${formatDateGregorian(t.date)},${(t.description || '').replace(/,/g, ' ')},${CATEGORY_LABELS[t.category] || t.category},${t.type === 'in' ? formatAmount(t.amount) : ''},${t.type === 'out' ? formatAmount(t.amount) : ''},${formatAmount(running)}`;
    }).join('\n');
    const csv = '\uFEFF' + header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `كشف_حساب_${contact.name}_${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('تم تصدير كشف الحساب Excel/CSV');
  };

  const handleDownloadHDPDF = async () => {
    if (!statementRef.current || !statementContact) return;
    try {
      await generateHDPreviewPDF(statementRef.current, `كشف_حساب_HD_${statementContact.name}.pdf`);
      toast.success('تم تصدير كشف الحساب HD');
    } catch { toast.error('خطأ في التصدير'); }
  };

  const handleWhatsAppClick = (e: React.MouseEvent, phone: string) => {
    e.stopPropagation();
    window.open(`https://wa.me/${phone.replace(/[^0-9+]/g, '')}`, '_blank');
  };

  const handleCallClick = (e: React.MouseEvent, phone: string) => {
    e.stopPropagation();
    window.open(`tel:${phone}`, '_self');
  };

  const statementSummary = useMemo(() => calculateLedgerSummary(statementTxs), [statementTxs]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          الحسابات الدفترية
        </h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="gap-1 h-8 text-[11px] px-2 sm:text-xs" onClick={handleSyncBalances} disabled={isSyncing}>
            <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
            <span className="hidden sm:inline">تحديث الأرصدة</span>
          </Button>
          {canCreate && (
            <Button size="sm" className="gap-1 h-8 text-xs px-2" onClick={handleAddAccount}>
              <Plus className="h-3.5 w-3.5" />
              حساب جديد
            </Button>
          )}
        </div>
      </div>

      {/* إحصائيات العمليات */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Receipt className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold">إحصائيات العمليات المالية</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-card/80 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5"><ArrowRightLeft className="h-3 w-3 text-primary" /></div>
            <p className="text-sm font-bold text-primary">{formatNumber(ledgerTransactionStats.totalTransactions)}</p>
            <p className="text-[9px] text-muted-foreground">العمليات</p>
          </div>
          <div className="bg-green-500/10 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5"><TrendingUp className="h-3 w-3 text-green-600" /></div>
            <p className="text-sm font-bold text-green-600">${formatNumber(ledgerTransactionStats.totalIncome)}</p>
            <p className="text-[9px] text-green-600">مدين</p>
          </div>
          <div className="bg-red-500/10 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5"><TrendingDown className="h-3 w-3 text-red-600" /></div>
            <p className="text-sm font-bold text-red-600">${formatNumber(ledgerTransactionStats.totalExpenses)}</p>
            <p className="text-[9px] text-red-600">دائن</p>
          </div>
          <div className={cn("rounded-lg p-2 text-center", ledgerTransactionStats.netBalance >= 0 ? "bg-green-500/10" : "bg-red-500/10")}>
            <p className={cn("text-sm font-bold", ledgerTransactionStats.netBalance >= 0 ? "text-green-600" : "text-red-600")}>
              ${formatNumber(Math.abs(ledgerTransactionStats.netBalance))}
            </p>
            <p className="text-[9px] text-muted-foreground">الصافي</p>
          </div>
        </div>
      </motion.div>


      {/* Search + Filter Icon + View Switcher */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث بالاسم، الهاتف، البريد..." className="pr-8 text-right h-8 text-xs" />
        </div>
        <Button
          variant={selectedTypes.size > 0 ? "default" : "outline"}
          size="icon"
          className="h-8 w-8 shrink-0 relative"
          onClick={openFilterModal}
        >
          <Filter className="h-3.5 w-3.5" />
          {selectedTypes.size > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
              {selectedTypes.size}
            </span>
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="ترتيب">
              <ArrowUpDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={() => setSortBy('updated_desc')} className={cn(sortBy === 'updated_desc' && 'bg-accent')}>تاريخ التعديل (الأحدث)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('updated_asc')} className={cn(sortBy === 'updated_asc' && 'bg-accent')}>تاريخ التعديل (الأقدم)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('created_desc')} className={cn(sortBy === 'created_desc' && 'bg-accent')}>تاريخ الإنشاء (الأحدث)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('created_asc')} className={cn(sortBy === 'created_asc' && 'bg-accent')}>تاريخ الإنشاء (الأقدم)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('name_asc')} className={cn(sortBy === 'name_asc' && 'bg-accent')}>الاسم (أ - ي)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('name_desc')} className={cn(sortBy === 'name_desc' && 'bg-accent')}>الاسم (ي - أ)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('most_active')} className={cn(sortBy === 'most_active' && 'bg-accent')}>الأكثر حركة</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('least_active')} className={cn(sortBy === 'least_active' && 'bg-accent')}>الأقل حركة</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('balance_desc')} className={cn(sortBy === 'balance_desc' && 'bg-accent')}>الرصيد (الأكبر)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('balance_asc')} className={cn(sortBy === 'balance_asc' && 'bg-accent')}>الرصيد (الأصغر)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('debit_desc')} className={cn(sortBy === 'debit_desc' && 'bg-accent')}>الأكبر مديناً</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('credit_desc')} className={cn(sortBy === 'credit_desc' && 'bg-accent')}>الأكبر دائناً</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex h-8 rounded-md border border-border overflow-hidden shrink-0">
          <button
            onClick={() => setViewMode('grid')}
            className={cn("px-2 flex items-center justify-center transition-colors", viewMode === 'grid' ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn("px-2 flex items-center justify-center transition-colors border-r border-border", viewMode === 'list' ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Active filter badges */}
      {(selectedTypes.size > 0 || selectedCustomTypes.size > 0) && (
        <div className="flex items-center gap-1 flex-wrap">
          {Array.from(selectedTypes).filter(t => t !== 'other').map(type => (
            <Badge key={type} variant="secondary" className="text-[10px] h-5 gap-1 cursor-pointer" onClick={() => {
              setSelectedTypes(prev => { const next = new Set(prev); next.delete(type); return next; });
            }}>
              {CONTACT_TYPE_LABELS[type]}
              <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
          {Array.from(selectedCustomTypes).map(cName => (
            <Badge key={`ct-${cName}`} variant="secondary" className="text-[10px] h-5 gap-1 cursor-pointer" onClick={() => {
              setSelectedCustomTypes(prev => { const next = new Set(prev); next.delete(cName); return next; });
            }}>
              {cName}
              <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
          <button className="text-[10px] text-destructive hover:underline" onClick={() => { setSelectedTypes(new Set()); setSelectedCustomTypes(new Set()); }}>
            مسح الكل
          </button>
        </div>
      )}

      {/* === Filtered Summary (independent, frontend-only) === */}
      {(selectedTypes.size > 0 || selectedCustomTypes.size > 0 || searchQuery.trim()) && filteredContacts.length > 0 && (() => {
        const filteredSummary = filteredContacts.reduce(
          (acc, c) => {
            const s = contactLedgerSummaries.get(c.id) || EMPTY_LEDGER_SUMMARY;
            acc.totalDebit += s.totalDebit;
            acc.totalCredit += s.totalCredit;
            return acc;
          },
          { totalDebit: 0, totalCredit: 0 }
        );
        const filteredBalance = filteredSummary.totalDebit - filteredSummary.totalCredit;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-1 rounded-lg border border-border bg-card/80 px-3 py-1.5">
              <span className="text-[10px] font-bold text-green-600">مدين: ${formatNumber(filteredSummary.totalDebit)}</span>
              <span className="text-muted-foreground text-[10px]">|</span>
              <span className="text-[10px] font-bold text-red-600">دائن: ${formatNumber(filteredSummary.totalCredit)}</span>
              <span className="text-muted-foreground text-[10px]">|</span>
              <span className={cn("text-[10px] font-bold", filteredBalance >= 0 ? "text-green-600" : "text-red-600")}>
                الرصيد: ${formatNumber(Math.abs(filteredBalance))}
              </span>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 shrink-0" onClick={() => setShowFilteredPreview(true)}>
              <Eye className="h-3 w-3" /> معاينة
            </Button>
          </div>
        );
      })()}

      {/* Accounts List */}
      <div className={cn(viewMode === 'list' ? "space-y-0.5" : "space-y-2")}>
        {filteredContacts.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-6 shadow-sm border border-border text-center">
            <div className="flex justify-center mb-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-muted-foreground opacity-50" />
              </div>
            </div>
            <h3 className="text-xs font-medium mb-1">{searchQuery ? 'لا توجد نتائج' : 'لا توجد حسابات دفترية'}</h3>
            <p className="text-[11px] text-muted-foreground mb-3">{searchQuery ? 'جرب كلمات بحث مختلفة' : 'أضف أول حساب دفتري للبدء'}</p>
            {!searchQuery && canCreate && (
              <Button size="sm" onClick={handleAddAccount} className="text-xs">
                <Plus className="h-3.5 w-3.5 ml-1" />
                إضافة حساب دفتري
              </Button>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredContacts.map(contact => {
              const TypeIcon = TypeIcons[contact.type] || User;
              const typeColor = CONTACT_TYPE_COLORS[contact.type];
              const ledgerSummary = contactLedgerSummaries.get(contact.id) || EMPTY_LEDGER_SUMMARY;
              
              if (viewMode === 'list') {
                return (
                  <motion.div
                    key={contact.id}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 5 }}
                    onClick={() => handleViewAccount(contact)}
                    className="bg-card border-b border-border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors flex items-center gap-2"
                  >
                    <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 border text-[10px]", typeColor)}>
                      <TypeIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-xs truncate">{contact.name}</h3>
                      <span className="text-[10px] text-muted-foreground">{contact.type === 'other' && contact.customType ? contact.customType : CONTACT_TYPE_LABELS[contact.type]}</span>
                    </div>
                    <div className={cn(
                      "text-xs font-bold shrink-0",
                      ledgerSummary.balance > 0 ? 'text-income' : 
                      ledgerSummary.balance < 0 ? 'text-expense' : 
                      'text-muted-foreground'
                    )}>
                      {ledgerSummary.balance > 0 ? '+' : ledgerSummary.balance < 0 ? '-' : ''}${formatNumber(Math.abs(ledgerSummary.balance))}
                    </div>
                    <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleViewAccount(contact)}
                  className="bg-card rounded-xl border border-border p-3 shadow-sm cursor-pointer hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("h-11 w-11 rounded-full flex items-center justify-center shrink-0 border", typeColor)}>
                      <TypeIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-bold text-sm truncate">{contact.name}</h3>
                          {contact.company && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Building2 className="h-3 w-3" />{contact.company}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {contact.phone && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:bg-green-500/10" onClick={(e) => handleWhatsAppClick(e, contact.phone!)}>
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:bg-blue-500/10" onClick={(e) => handleCallClick(e, contact.phone!)}>
                                <Phone className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" onClick={(e) => { e.stopPropagation(); handleHDPreview(contact); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEdit && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditAccount(contact); }}>تعديل</DropdownMenuItem>}
                              {canDelete && <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteAccount(contact.id); }}>حذف</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="outline" className={cn("text-[10px] h-5", typeColor)}>
                          {contact.type === 'other' && contact.customType ? contact.customType : CONTACT_TYPE_LABELS[contact.type]}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-bold",
                            ledgerSummary.balance > 0 ? 'bg-income/10 text-income' : 
                            ledgerSummary.balance < 0 ? 'bg-expense/10 text-expense' : 
                            'bg-muted text-muted-foreground'
                          )}>
                            {ledgerSummary.balance > 0 ? '+' : ledgerSummary.balance < 0 ? '-' : ''}${formatNumber(Math.abs(ledgerSummary.balance))}
                          </div>
                          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Filter Modal */}
      <Dialog open={showFilterModal} onOpenChange={setShowFilterModal}>
        <DialogContent className="max-w-xs p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              تصفية حسب التصنيف
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Select All / Clear */}
            <div className="flex items-center justify-between">
              <button className="text-xs text-primary hover:underline flex items-center gap-1" onClick={handleSelectAll}>
                <CheckSquare className="h-3 w-3" />
                تحديد الكل
              </button>
              <button className="text-xs text-muted-foreground hover:underline" onClick={handleClearAll}>
                مسح الكل
              </button>
            </div>
            {/* Category checkboxes */}
            <div className="space-y-2">
              {availableTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">لا توجد تصنيفات</p>
              ) : (
                availableTypes.map(type => {
                  const TypeIcon = TypeIcons[type] || User;
                  if (type === 'other' && customTypeNames.length > 0) {
                    // Show each unique custom type as separate filterable entry
                    return customTypeNames.map(cName => {
                      const count = contacts.filter(c => c.type === 'other' && c.customType === cName).length;
                      return (
                        <label key={`other-${cName}`} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                          <Checkbox
                            checked={tempSelectedCustomTypes.has(cName)}
                            onCheckedChange={() => {
                              setTempSelectedCustomTypes(prev => {
                                const next = new Set(prev);
                                if (next.has(cName)) next.delete(cName); else next.add(cName);
                                return next;
                              });
                            }}
                          />
                          <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 border", CONTACT_TYPE_COLORS[type])}>
                            <TypeIcon className="h-3 w-3" />
                          </div>
                          <span className="text-xs font-medium flex-1">{cName}</span>
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{formatNumber(count)}</span>
                        </label>
                      );
                    });
                  }
                  const count = contacts.filter(c => c.type === type).length;
                  return (
                    <label key={type} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                      <Checkbox
                        checked={tempSelectedTypes.has(type)}
                        onCheckedChange={() => handleToggleType(type)}
                      />
                      <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 border", CONTACT_TYPE_COLORS[type])}>
                        <TypeIcon className="h-3 w-3" />
                      </div>
                      <span className="text-xs font-medium flex-1">
                        {CONTACT_TYPE_LABELS[type] || type}
                      </span>
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{formatNumber(count)}</span>
                    </label>
                  );
                })
              )}
            </div>
            {/* Apply button */}
            <Button size="sm" className="w-full h-9 text-xs" onClick={handleApplyFilter}>
              تطبيق ({(tempSelectedTypes.size + tempSelectedCustomTypes.size) > 0 ? `${tempSelectedTypes.size + tempSelectedCustomTypes.size} تصنيف` : 'الكل'})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Account Statement HD Preview Dialog */}
      <Dialog open={!!statementContact} onOpenChange={(o) => !o && setStatementContact(null)}>
        <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" />
              كشف حساب - {statementContact?.name}
            </DialogTitle>
          </DialogHeader>

          {statementContact && (
            <>
              {loadingStatement ? (
                <div className="p-8 text-center text-muted-foreground text-xs">جاري تحميل البيانات...</div>
              ) : (
                <div ref={statementRef} className="mx-4 bg-white text-black rounded-lg overflow-hidden" style={{ direction: 'rtl' }}>
                  <div style={{ background: '#194178', color: 'white', padding: '16px', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>كشف حساب</h1>
                    <p style={{ fontSize: '10px', opacity: 0.9 }}>توطين - المساعد المالي</p>
                    <p style={{ fontSize: '9px', opacity: 0.8, marginTop: '2px' }}>تاريخ الإصدار: {formatDateGregorian(new Date(), 'long')}</p>
                  </div>

                  <div style={{ padding: '12px 16px', background: '#f5f7fa', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#194178' }}>{statementContact.name}</div>
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                      {statementContact.type === 'other' && statementContact.customType ? statementContact.customType : CONTACT_TYPE_LABELS[statementContact.type]}
                      {statementContact.phone && ` | ${statementContact.phone}`}
                      {statementContact.company && ` | ${statementContact.company}`}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', padding: '12px 16px' }}>
                    <div style={{ textAlign: 'center', padding: '8px', background: '#dcfce7', borderRadius: '6px' }}>
                      <div style={{ fontSize: '9px', color: '#166534' }}>مدين (Debit)</div>
                      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#166534' }}>${formatNumber(statementSummary.totalDebit)}</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '8px', background: '#fef2f2', borderRadius: '6px' }}>
                      <div style={{ fontSize: '9px', color: '#991b1b' }}>دائن (Credit)</div>
                      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#991b1b' }}>${formatNumber(statementSummary.totalCredit)}</div>
                    </div>
                    <div style={{
                      textAlign: 'center', padding: '8px', borderRadius: '6px',
                      background: statementSummary.balance > 0 ? '#dcfce7' : statementSummary.balance < 0 ? '#fef2f2' : '#f5f5f5',
                    }}>
                      <div style={{ fontSize: '9px', color: '#666' }}>الرصيد</div>
                      <div style={{
                        fontSize: '13px', fontWeight: 'bold',
                        color: statementSummary.balance > 0 ? '#16a34a' : statementSummary.balance < 0 ? '#dc2626' : '#666',
                      }}>
                        ${formatNumber(Math.abs(statementSummary.balance))}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 pt-0">
                    <StatementEntriesView
                      title={`كشف الحساب (${formatNumber(statementTxs.length)})`}
                      rows={(() => {
                        let running = 0;
                        return statementTxs.map((t) => {
                          if (t.type === 'in') running += t.amount; else running -= t.amount;
                          return { id: t.id, date: t.date, description: t.description, type: t.type, amount: t.amount, runningBalance: running };
                        });
                      })()}
                      viewMode={statementViewMode}
                      onViewModeChange={setStatementViewMode}
                    />
                  </div>

                  <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: '#fafafa', borderRadius: '4px', border: '1px solid #eee' }}>
                    <p style={{ fontSize: '7px', color: '#888', textAlign: 'center', lineHeight: '1.6' }}>{LEGAL_DISCLAIMER}</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px', fontSize: '8px', color: '#999', borderTop: '1px solid #eee' }}>
                    توطين © {new Date().getFullYear()} - جميع الحقوق محفوظة
                  </div>
                </div>
              )}

              <div className="flex gap-2 p-4 pt-2">
                <Button size="sm" className="flex-1 gap-1 h-9 text-xs" onClick={handleDownloadHDPDF} disabled={loadingStatement}>
                  <Download className="h-3.5 w-3.5" /> تحميل HD PDF
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1 h-9 text-xs" onClick={() => { handleExportStatementPDF(statementContact); setStatementContact(null); }}>
                  <FileText className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1 h-9 text-xs" onClick={() => { handleExportStatementExcel(statementContact); setStatementContact(null); }}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Filtered Preview Modal (independent) */}
      <Dialog open={showFilteredPreview} onOpenChange={setShowFilteredPreview}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              معاينة الحسابات المفلترة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Filtered transactions list */}
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {filteredContacts.map(contact => {
                const ls = contactLedgerSummaries.get(contact.id) || EMPTY_LEDGER_SUMMARY;
                if (ls.transactionCount === 0) return null;
                return (
                  <div key={contact.id} className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/30">
                    <div>
                      <p className="text-xs font-bold">{contact.name}</p>
                      <p className="text-[9px] text-muted-foreground">{CONTACT_TYPE_LABELS[contact.type]} • {ls.transactionCount} عملية</p>
                    </div>
                    <div className="text-left space-y-0.5">
                      <p className="text-[10px] text-green-600">مدين: ${formatNumber(ls.totalDebit)}</p>
                      <p className="text-[10px] text-red-600">دائن: ${formatNumber(ls.totalCredit)}</p>
                      <p className={cn("text-[10px] font-bold", ls.balance >= 0 ? "text-green-600" : "text-red-600")}>
                        ${formatNumber(Math.abs(ls.balance))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Summary footer */}
            {(() => {
              const s = filteredContacts.reduce(
                (acc, c) => {
                  const ls = contactLedgerSummaries.get(c.id) || EMPTY_LEDGER_SUMMARY;
                  acc.d += ls.totalDebit; acc.c += ls.totalCredit;
                  return acc;
                }, { d: 0, c: 0 }
              );
              const bal = s.d - s.c;
              return (
                <div className="grid grid-cols-3 gap-2 border-t border-border pt-2">
                  <div className="text-center p-2 rounded-lg bg-green-500/10">
                    <p className="text-[9px] text-muted-foreground">إجمالي مدين</p>
                    <p className="text-xs font-bold text-green-600">${formatNumber(s.d)}</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-red-500/10">
                    <p className="text-[9px] text-muted-foreground">إجمالي دائن</p>
                    <p className="text-xs font-bold text-red-600">${formatNumber(s.c)}</p>
                  </div>
                  <div className={cn("text-center p-2 rounded-lg", bal >= 0 ? "bg-green-500/10" : "bg-red-500/10")}>
                    <p className="text-[9px] text-muted-foreground">الرصيد</p>
                    <p className={cn("text-xs font-bold", bal >= 0 ? "text-green-600" : "text-red-600")}>${formatNumber(Math.abs(bal))}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

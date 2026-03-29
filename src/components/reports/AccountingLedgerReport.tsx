import { useState, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Search, Filter, FileText, FileSpreadsheet, Eye, X,
  Users, DollarSign, ArrowUpCircle, ArrowDownCircle,
  Phone, Mail, User, Download, Printer
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { generateHDPreviewPDF, printHDPreview } from '@/utils/hdPreview';
import { formatDateGregorian, formatAmount as fmtAmt } from '@/utils/formatUtils';

interface ContactRow {
  id: string;
  name: string;
  type: string;
  custom_type: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  company: string | null;
  balance: number;
  total_debit: number;
  total_credit: number;
  total_transactions: number;
  status: string;
  created_at: string;
}

interface TransactionRow {
  id: string;
  type: string;
  category: string;
  amount: number;
  description: string | null;
  date: string;
  fund_id: string | null;
  contact_id: string | null;
  project_id: string | null;
  shipment_id: string | null;
  source_type: string | null;
  notes: string | null;
  created_at: string;
  currency_code: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  client: 'عميل', vendor: 'مورد', shipping_agent: 'وكيل شحن',
  employee: 'موظف', partner: 'شريك', other: 'أخرى',
};

const CATEGORY_LABELS: Record<string, string> = {
  client_collection: 'تحصيل', vendor_payment: 'صرف مورد', expense: 'مصروفات',
  partner_payment: 'صرف شريك', partner_collection: 'تحصيل شريك',
  fund_transfer: 'تحويل', debt_payment: 'سداد دين', other: 'أخرى',
};

const formatAmount = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });

export function AccountingLedgerReport() {
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const [selectedContact, setSelectedContact] = useState<ContactRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Preview states
  const [previewAllOpen, setPreviewAllOpen] = useState(false);
  const [previewDetailOpen, setPreviewDetailOpen] = useState(false);
  const previewAllRef = useRef<HTMLDivElement>(null);
  const previewDetailRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data: contacts = [] } = useQuery({
    queryKey: ['ledger-report-contacts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      if (error) throw error;
      return (data || []) as ContactRow[];
    },
    enabled: !!user,
  });

  const { data: contactTransactions = [] } = useQuery({
    queryKey: ['ledger-report-transactions', selectedContact?.id],
    queryFn: async () => {
      if (!selectedContact) return [];
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('contact_id', selectedContact.id)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data || []) as TransactionRow[];
    },
    enabled: !!selectedContact,
  });

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    contacts.forEach(c => {
      if (c.custom_type) types.add(c.custom_type);
      else types.add(c.type);
    });
    return Array.from(types);
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.phone?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q)) return false;
      }
      if (filterType !== 'all') {
        if ((c.custom_type || c.type) !== filterType) return false;
      }
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      return true;
    });
  }, [contacts, searchQuery, filterType, filterStatus]);

  const stats = useMemo(() => {
    const totalAccounts = filteredContacts.length;
    const totalDebit = filteredContacts.reduce((s, c) => s + c.total_debit, 0);
    const totalCredit = filteredContacts.reduce((s, c) => s + c.total_credit, 0);
    const netBalance = totalDebit - totalCredit;
    return { totalAccounts, totalDebit, totalCredit, netBalance };
  }, [filteredContacts]);

  const openDetail = useCallback((contact: ContactRow) => {
    setSelectedContact(contact);
    setDetailOpen(true);
  }, []);

  // Preview export/print helpers
  const handlePreviewExportPDF = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!ref.current) return;
    setExporting(true);
    try {
      await generateHDPreviewPDF(ref.current, filename);
      toast.success('تم تصدير PDF بنجاح');
    } catch { toast.error('خطأ في التصدير'); }
    finally { setExporting(false); }
  };

  const handlePreviewPrint = (ref: React.RefObject<HTMLDivElement>) => {
    if (!ref.current) return;
    printHDPreview(ref.current);
  };

  // Export PDF
  const handleExportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF('l', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(25, 65, 120);
    doc.rect(0, 0, pw, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('تقرير الدفتر المحاسبي', pw / 2, 16, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}`, pw / 2, 26, { align: 'center' });
    let y = 45;
    const statsRows = [
      ['إجمالي الحسابات', stats.totalAccounts.toString()],
      ['إجمالي المسحوبات', `$${formatAmount(stats.totalDebit)}`],
      ['إجمالي المدفوعات', `$${formatAmount(stats.totalCredit)}`],
      ['صافي الرصيد', `$${formatAmount(stats.netBalance)}`],
    ];
    (doc as any).autoTable({ startY: y, body: statsRows, styles: { fontSize: 10, halign: 'center', font: 'Helvetica' }, columnStyles: { 0: { fontStyle: 'bold', halign: 'right' }, 1: { halign: 'left' } }, margin: { left: 40, right: 40 }, theme: 'plain' });
    y = (doc as any).lastAutoTable.finalY + 10;
    if (filteredContacts.length > 0) {
      (doc as any).autoTable({
        startY: y,
        head: [['الاسم', 'النوع', 'الهاتف', 'البريد', 'مدين', 'دائن', 'الرصيد', 'العمليات']],
        body: filteredContacts.map(c => [c.name, c.custom_type || TYPE_LABELS[c.type] || c.type, c.phone || '-', c.email || '-', `$${formatAmount(c.total_debit)}`, `$${formatAmount(c.total_credit)}`, `$${formatAmount(c.balance)}`, c.total_transactions.toString()]),
        styles: { font: 'Helvetica', fontSize: 8, halign: 'center' },
        headStyles: { fillColor: [25, 65, 120], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 10, right: 10 },
      });
    }
    const ph = doc.internal.pageSize.getHeight();
    doc.setFillColor(245, 245, 245);
    doc.rect(0, ph - 15, pw, 15, 'F');
    doc.setTextColor(100);
    doc.setFontSize(7);
    doc.text(`توطين © ${new Date().getFullYear()} - جميع الحقوق محفوظة`, pw / 2, ph - 5, { align: 'center' });
    doc.save(`تقرير_الدفتر_المحاسبي_${Date.now()}.pdf`);
    toast.success('تم تصدير PDF بنجاح');
  };

  // Export Excel
  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const data = filteredContacts.map(c => ({
      'الاسم': c.name, 'النوع': c.custom_type || TYPE_LABELS[c.type] || c.type, 'الهاتف': c.phone || '', 'البريد': c.email || '', 'العنوان': c.address || '',
      'إجمالي مدين': c.total_debit, 'إجمالي دائن': c.total_credit, 'الرصيد': c.balance, 'عدد العمليات': c.total_transactions,
      'الحالة': c.status === 'active' ? 'نشط' : 'غير نشط',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الدفتر المحاسبي');
    XLSX.writeFile(wb, `الدفتر_المحاسبي_${Date.now()}.xlsx`);
    toast.success('تم تصدير Excel بنجاح');
  };

  // Export detail PDF
  const handleExportDetailPDF = async () => {
    if (!selectedContact) return;
    const { exportAccountStatement } = await import('@/utils/accountStatementPdf');
    await exportAccountStatement({
      entityName: selectedContact.name,
      entityType: selectedContact.custom_type || TYPE_LABELS[selectedContact.type] || selectedContact.type,
      balance: selectedContact.balance, totalDebit: selectedContact.total_debit, totalCredit: selectedContact.total_credit,
      phone: selectedContact.phone || undefined, email: selectedContact.email || undefined, company: selectedContact.company || undefined,
      transactions: contactTransactions.map(t => ({ id: t.id, type: t.type as 'in' | 'out', category: t.category as any, amount: t.amount, description: t.description || '', date: t.date, fundId: t.fund_id || '', createdAt: new Date(t.created_at) })),
    });
    toast.success('تم تصدير كشف الحساب');
  };

  const StatCard = ({ icon: Icon, label, value, color = 'text-foreground', bg = 'bg-muted/50' }: { icon: any; label: string; value: string; color?: string; bg?: string }) => (
    <div className={cn("text-center p-2.5 rounded-xl", bg)}>
      <Icon className={cn("h-4 w-4 mx-auto mb-1", color)} />
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-bold", color)}>{value}</p>
    </div>
  );

  // Shared HD preview content for the full ledger
  const LedgerPreviewContent = () => (
    <div ref={previewAllRef} className="bg-white text-black rounded-lg overflow-hidden" style={{ direction: 'rtl' }}>
      <div style={{ background: '#194178', color: 'white', padding: '20px', textAlign: 'center', borderRadius: '8px 8px 0 0' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '4px' }}>تقرير الدفتر المحاسبي</h1>
        <p style={{ fontSize: '11px', opacity: 0.9 }}>توطين - المساعد المالي</p>
        <p style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px' }}>تاريخ الإصدار: {formatDateGregorian(new Date().toISOString(), 'long')}</p>
      </div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', padding: '16px' }}>
        {[
          { label: 'إجمالي الحسابات', value: stats.totalAccounts.toString(), bg: '#eff6ff' },
          { label: 'إجمالي المسحوبات', value: `$${formatAmount(stats.totalDebit)}`, bg: '#fef2f2' },
          { label: 'إجمالي المدفوعات', value: `$${formatAmount(stats.totalCredit)}`, bg: '#dcfce7' },
          { label: 'صافي الرصيد', value: `$${formatAmount(Math.abs(stats.netBalance))}`, bg: stats.netBalance >= 0 ? '#dcfce7' : '#fef2f2' },
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{s.value}</div>
          </div>
        ))}
      </div>
      {/* Table */}
      <div style={{ padding: '0 16px 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: '#194178', color: 'white' }}>
              {['#', 'الاسم', 'النوع', 'الهاتف', 'مدين', 'دائن', 'الرصيد', 'العمليات'].map((h, i) => (
                <th key={i} style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 'bold' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredContacts.map((c, idx) => (
              <tr key={c.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f5f7fa', borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px', textAlign: 'center' }}>{idx + 1}</td>
                <td style={{ padding: '6px', fontWeight: 'bold' }}>{c.name}</td>
                <td style={{ padding: '6px', textAlign: 'center' }}>{c.custom_type || TYPE_LABELS[c.type] || c.type}</td>
                <td style={{ padding: '6px', textAlign: 'center' }}>{c.phone || '-'}</td>
                <td style={{ padding: '6px', textAlign: 'center', color: '#991b1b' }}>${formatAmount(c.total_debit)}</td>
                <td style={{ padding: '6px', textAlign: 'center', color: '#166534' }}>${formatAmount(c.total_credit)}</td>
                <td style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold', color: c.balance > 0 ? '#991b1b' : c.balance < 0 ? '#166534' : '#666' }}>
                  ${formatAmount(Math.abs(c.balance))} {c.balance > 0 ? '(مدين)' : c.balance < 0 ? '(دائن)' : ''}
                </td>
                <td style={{ padding: '6px', textAlign: 'center' }}>{c.total_transactions}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#194178', color: 'white', fontWeight: 'bold' }}>
              <td colSpan={4} style={{ padding: '8px', textAlign: 'center' }}>الإجمالي</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>${formatAmount(stats.totalDebit)}</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>${formatAmount(stats.totalCredit)}</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>${formatAmount(Math.abs(stats.netBalance))}</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{filteredContacts.reduce((s, c) => s + c.total_transactions, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ textAlign: 'center', padding: '10px', fontSize: '9px', color: '#999', borderTop: '1px solid #eee' }}>
        توطين © {new Date().getFullYear()} - جميع الحقوق محفوظة
      </div>
    </div>
  );

  // Shared HD preview for individual contact
  const ContactPreviewContent = () => {
    if (!selectedContact) return null;
    let runningBalance = 0;
    return (
      <div ref={previewDetailRef} className="bg-white text-black rounded-lg overflow-hidden" style={{ direction: 'rtl' }}>
        <div style={{ background: '#194178', color: 'white', padding: '20px', textAlign: 'center', borderRadius: '8px 8px 0 0' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '4px' }}>كشف حساب</h1>
          <p style={{ fontSize: '14px', opacity: 0.95 }}>{selectedContact.name}</p>
          <p style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px' }}>تاريخ الإصدار: {formatDateGregorian(new Date().toISOString(), 'long')}</p>
        </div>
        {/* Contact info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '16px' }}>
          {[
            { label: 'النوع', value: selectedContact.custom_type || TYPE_LABELS[selectedContact.type] || selectedContact.type },
            ...(selectedContact.phone ? [{ label: 'الهاتف', value: selectedContact.phone }] : []),
            ...(selectedContact.email ? [{ label: 'البريد', value: selectedContact.email }] : []),
            ...(selectedContact.company ? [{ label: 'الشركة', value: selectedContact.company }] : []),
          ].map((item, i) => (
            <div key={i} style={{ background: '#f5f7fa', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '3px' }}>{item.label}</div>
              <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{item.value}</div>
            </div>
          ))}
        </div>
        {/* Balance summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '0 16px 16px' }}>
          <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#666' }}>مدين</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#991b1b' }}>${formatAmount(selectedContact.total_debit)}</div>
          </div>
          <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#666' }}>دائن</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#166534' }}>${formatAmount(selectedContact.total_credit)}</div>
          </div>
          <div style={{ background: selectedContact.balance > 0 ? '#fef2f2' : '#dcfce7', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#666' }}>الرصيد</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: selectedContact.balance > 0 ? '#991b1b' : '#166534' }}>${formatAmount(Math.abs(selectedContact.balance))}</div>
          </div>
        </div>
        {/* Transactions */}
        <div style={{ padding: '0 16px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ background: '#194178', color: 'white' }}>
                {['#', 'التاريخ', 'البيان', 'النوع', 'مدين', 'دائن', 'الرصيد'].map((h, i) => (
                  <th key={i} style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 'bold' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contactTransactions.map((t, idx) => {
                if (t.type === 'out') runningBalance += t.amount;
                else runningBalance -= t.amount;
                return (
                  <tr key={t.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f5f7fa', borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '5px', textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ padding: '5px', textAlign: 'center' }}>{formatDateGregorian(t.date)}</td>
                    <td style={{ padding: '5px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '-'}</td>
                    <td style={{ padding: '5px', textAlign: 'center' }}>{CATEGORY_LABELS[t.category] || t.category}</td>
                    <td style={{ padding: '5px', textAlign: 'center', color: '#991b1b' }}>{t.type === 'out' ? `$${formatAmount(t.amount)}` : '-'}</td>
                    <td style={{ padding: '5px', textAlign: 'center', color: '#166534' }}>{t.type === 'in' ? `$${formatAmount(t.amount)}` : '-'}</td>
                    <td style={{ padding: '5px', textAlign: 'center', fontWeight: 'bold', color: runningBalance > 0 ? '#991b1b' : '#166534' }}>${formatAmount(Math.abs(runningBalance))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 30px' }}>
          <div style={{ textAlign: 'center', width: '40%' }}>
            <div style={{ borderBottom: '1px solid #999', height: '30px', marginBottom: '6px' }}></div>
            <div style={{ fontSize: '10px', color: '#666' }}>توقيع العميل</div>
          </div>
          <div style={{ textAlign: 'center', width: '40%' }}>
            <div style={{ borderBottom: '1px solid #999', height: '30px', marginBottom: '6px' }}></div>
            <div style={{ fontSize: '10px', color: '#666' }}>توقيع المسؤول</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px', fontSize: '9px', color: '#999', borderTop: '1px solid #eee' }}>
          توطين © {new Date().getFullYear()} - جميع الحقوق محفوظة
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Statistics */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-3 shadow-sm border border-border">
        <h3 className="text-xs font-bold mb-3">إحصائيات الدفتر المحاسبي</h3>
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon={Users} label="إجمالي الحسابات" value={stats.totalAccounts.toString()} color="text-primary" bg="bg-accent" />
          <StatCard icon={ArrowDownCircle} label="إجمالي المسحوبات" value={`$${formatAmount(stats.totalDebit)}`} color="text-expense" bg="bg-expense/10" />
          <StatCard icon={ArrowUpCircle} label="إجمالي المدفوعات" value={`$${formatAmount(stats.totalCredit)}`} color="text-income" bg="bg-income/10" />
          <StatCard icon={DollarSign} label="صافي الرصيد" value={`$${formatAmount(Math.abs(stats.netBalance))}`} color={stats.netBalance >= 0 ? 'text-income' : 'text-expense'} bg={stats.netBalance >= 0 ? 'bg-income/10' : 'bg-expense/10'} />
        </div>
      </motion.div>

      {/* Search & Filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث بالاسم، الهاتف، البريد..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-8 h-9 text-xs" />
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" />
          </Button>
        </div>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="grid grid-cols-2 gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 text-[10px]"><SelectValue placeholder="نوع الحساب" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                {availableTypes.map(t => (<SelectItem key={t} value={t}>{TYPE_LABELS[t] || t}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-[10px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">غير نشط</SelectItem>
              </SelectContent>
            </Select>
          </motion.div>
        )}
      </div>

      {/* Export & Preview Buttons */}
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" className="gap-1 h-8 text-[10px]" onClick={() => setPreviewAllOpen(true)}>
          <Eye className="h-3 w-3" /> معاينة
        </Button>
        <Button variant="outline" size="sm" className="gap-1 h-8 text-[10px]" onClick={handleExportPDF}>
          <FileText className="h-3 w-3" /> تصدير PDF
        </Button>
        <Button variant="outline" size="sm" className="gap-1 h-8 text-[10px]" onClick={handleExportExcel}>
          <FileSpreadsheet className="h-3 w-3" /> تصدير Excel
        </Button>
      </div>

      {/* Contacts List */}
      <div className="space-y-2">
        {filteredContacts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs">لا توجد حسابات مطابقة للبحث</div>
        ) : (
          filteredContacts.map(contact => (
            <motion.div key={contact.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-xl bg-card p-3 shadow-sm border border-border cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => openDetail(contact)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">{contact.name}</p>
                    <Badge variant="secondary" className="text-[8px] h-4">{contact.custom_type || TYPE_LABELS[contact.type] || contact.type}</Badge>
                  </div>
                </div>
                <div className="text-left">
                  <p className={cn("text-sm font-bold", contact.balance > 0 ? 'text-expense' : contact.balance < 0 ? 'text-income' : 'text-muted-foreground')}>
                    ${formatAmount(Math.abs(contact.balance))}
                  </p>
                  <p className="text-[8px] text-muted-foreground">{contact.balance > 0 ? 'مدين' : contact.balance < 0 ? 'دائن' : 'مسوّى'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                {contact.phone && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{contact.phone}</span>}
                {contact.email && <span className="flex items-center gap-0.5"><Mail className="h-2.5 w-2.5" />{contact.email}</span>}
                <span className="mr-auto">{contact.total_transactions} عملية</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-[9px]">
                <div className="bg-expense/10 rounded-lg px-2 py-1 text-center">
                  <span className="text-muted-foreground">مدين: </span>
                  <span className="font-bold text-expense">${formatAmount(contact.total_debit)}</span>
                </div>
                <div className="bg-income/10 rounded-lg px-2 py-1 text-center">
                  <span className="text-muted-foreground">دائن: </span>
                  <span className="font-bold text-income">${formatAmount(contact.total_credit)}</span>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              كشف حساب: {selectedContact?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedContact && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">النوع</span><Badge variant="secondary" className="text-[9px]">{selectedContact.custom_type || TYPE_LABELS[selectedContact.type] || selectedContact.type}</Badge></div>
                {selectedContact.phone && <div className="flex justify-between"><span className="text-muted-foreground">الهاتف</span><span>{selectedContact.phone}</span></div>}
                {selectedContact.email && <div className="flex justify-between"><span className="text-muted-foreground">البريد</span><span>{selectedContact.email}</span></div>}
                {selectedContact.address && <div className="flex justify-between"><span className="text-muted-foreground">العنوان</span><span>{selectedContact.address}</span></div>}
                {selectedContact.company && <div className="flex justify-between"><span className="text-muted-foreground">الشركة</span><span>{selectedContact.company}</span></div>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="bg-expense/10 rounded-lg p-2"><p className="text-muted-foreground">مدين</p><p className="font-bold text-expense">${formatAmount(selectedContact.total_debit)}</p></div>
                <div className="bg-income/10 rounded-lg p-2"><p className="text-muted-foreground">دائن</p><p className="font-bold text-income">${formatAmount(selectedContact.total_credit)}</p></div>
                <div className={cn("rounded-lg p-2", selectedContact.balance > 0 ? 'bg-expense/10' : 'bg-income/10')}><p className="text-muted-foreground">الرصيد</p><p className={cn("font-bold", selectedContact.balance > 0 ? 'text-expense' : 'text-income')}>${formatAmount(Math.abs(selectedContact.balance))}</p></div>
              </div>
              {/* Preview + Export buttons for individual */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="gap-1 h-8 text-[10px]" onClick={() => setPreviewDetailOpen(true)}>
                  <Eye className="h-3 w-3" /> معاينة كشف الحساب
                </Button>
                <Button variant="outline" size="sm" className="gap-1 h-8 text-[10px]" onClick={handleExportDetailPDF}>
                  <FileText className="h-3 w-3" /> تصدير PDF
                </Button>
              </div>
              <div className="text-xs font-bold">سجل العمليات ({contactTransactions.length})</div>
              {contactTransactions.length === 0 ? (
                <p className="text-center text-muted-foreground text-[10px] py-4">لا توجد عمليات</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[9px] px-2 h-8">التاريخ</TableHead>
                        <TableHead className="text-[9px] px-2 h-8">البيان</TableHead>
                        <TableHead className="text-[9px] px-2 h-8">النوع</TableHead>
                        <TableHead className="text-[9px] px-2 h-8">مدين</TableHead>
                        <TableHead className="text-[9px] px-2 h-8">دائن</TableHead>
                        <TableHead className="text-[9px] px-2 h-8">المصدر</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contactTransactions.map(t => (
                        <TableRow key={t.id} className="text-[9px]">
                          <TableCell className="px-2 py-1.5">{formatDate(t.date)}</TableCell>
                          <TableCell className="px-2 py-1.5 max-w-[120px] truncate">{t.description || '-'}</TableCell>
                          <TableCell className="px-2 py-1.5"><Badge variant="secondary" className="text-[7px] h-3.5">{CATEGORY_LABELS[t.category] || t.category}</Badge></TableCell>
                          <TableCell className="px-2 py-1.5 text-expense font-medium">{t.type === 'out' ? `$${formatAmount(t.amount)}` : '-'}</TableCell>
                          <TableCell className="px-2 py-1.5 text-income font-medium">{t.type === 'in' ? `$${formatAmount(t.amount)}` : '-'}</TableCell>
                          <TableCell className="px-2 py-1.5">
                            <Badge variant={t.source_type === 'manual' ? 'outline' : 'secondary'} className="text-[7px] h-3.5">
                              {t.source_type === 'manual' ? 'يدوي' : t.source_type === 'shipment_invoice' ? 'شحنة' : t.source_type === 'project_client' ? 'مشروع' : t.source_type || 'يدوي'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full Ledger Preview Dialog */}
      <Dialog open={previewAllOpen} onOpenChange={setPreviewAllOpen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> معاينة تقرير الدفتر المحاسبي
            </DialogTitle>
          </DialogHeader>
          <div className="mx-4 mb-2">
            <LedgerPreviewContent />
          </div>
          <div className="flex gap-2 p-4 pt-2 border-t border-border">
            <Button size="sm" className="flex-1 gap-1 h-9 text-xs" onClick={() => handlePreviewExportPDF(previewAllRef, `تقرير_الدفتر_${Date.now()}.pdf`)} disabled={exporting}>
              <Download className="h-3.5 w-3.5" /> {exporting ? 'جاري...' : 'تحميل PDF'}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9 text-xs" onClick={() => handlePreviewPrint(previewAllRef)}>
              <Printer className="h-3.5 w-3.5" /> طباعة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact Detail Preview Dialog */}
      <Dialog open={previewDetailOpen} onOpenChange={setPreviewDetailOpen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> معاينة كشف حساب: {selectedContact?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="mx-4 mb-2">
            <ContactPreviewContent />
          </div>
          <div className="flex gap-2 p-4 pt-2 border-t border-border">
            <Button size="sm" className="flex-1 gap-1 h-9 text-xs" onClick={() => handlePreviewExportPDF(previewDetailRef, `كشف_حساب_${selectedContact?.name}_${Date.now()}.pdf`)} disabled={exporting}>
              <Download className="h-3.5 w-3.5" /> {exporting ? 'جاري...' : 'تحميل PDF'}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9 text-xs" onClick={() => handlePreviewPrint(previewDetailRef)}>
              <Printer className="h-3.5 w-3.5" /> طباعة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, TrendingDown, Wallet, Landmark, CreditCard, Eye, Scale, Edit2, Trash2, RefreshCw } from 'lucide-react';
import { Fund, Transaction, FundType } from '@/types/finance';
import { Currency, CURRENCY_FLAGS } from '@/hooks/useCurrencies';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { BottomNav } from '@/components/layout/BottomNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { useLanguage } from '@/i18n/LanguageContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { UnifiedTransactionLog } from '@/components/shared/UnifiedTransactionLog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateGregorian, formatAmount, formatNumber } from '@/utils/formatUtils';
import { compareTransactionsByBusinessDateAsc, compareTransactionsByBusinessDateDesc } from '@/utils/transactionSort';
import { generateHDPreviewPDF } from '@/utils/hdPreview';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface FundDetailsProps {
  funds: Fund[];
  transactions: Transaction[];
  currencies?: Currency[];
  onUpdateFund?: (id: string, updates: Partial<Fund>) => Promise<void>;
  onDeleteFund?: (id: string) => Promise<void>;
  onDeleteTransaction?: (transactionId: string) => Promise<void>;
  onRefresh?: () => void;
}

const FUND_ICONS: Record<FundType, typeof Wallet> = {
  cash: Wallet,
  bank: Landmark,
  wallet: CreditCard,
};

const FUND_LABELS: Record<string, string> = {
  cash: 'صندوق نقدي',
  bank: 'حساب بنكي',
  wallet: 'محفظة إلكترونية',
  safe: 'خزنة',
  other: 'أخرى',
};

const LEGAL_DISCLAIMER = 'هذا المستند تم إنشاؤه آلياً من النظام وهو معتمد بدون توقيع أو ختم. تخلي المؤسسة مسؤوليتها عن أي كشط، شطب، أو تعديل يدوي يطرأ على هذه الورقة.';

export function FundDetails({ funds, transactions, currencies = [], onUpdateFund, onDeleteFund, onDeleteTransaction, onRefresh }: FundDetailsProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showPreview, setShowPreview] = useState(false);
  const [activeCurrencyTab, setActiveCurrencyTab] = useState('all');
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<string>('cash');
  const [editDescription, setEditDescription] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);
  const permissions = useUserPermissions();

  const fund = funds.find(f => f.id === id);

  // جلب كامل حركات الصندوق مباشرة من قاعدة البيانات (لتجاوز حد الـ 50 المُحمَّلة في الذاكرة)
  const [allFundTransactions, setAllFundTransactions] = useState<Transaction[]>([]);
  const [loadingFundTx, setLoadingFundTx] = useState(false);

  useEffect(() => {
    if (!fund) return;
    let cancelled = false;
    const fetchAll = async () => {
      setLoadingFundTx(true);
      const pageSize = 1000;
      let from = 0;
      const rows: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, type, category, amount, description, date, fund_id, account_id, contact_id, project_id, notes, attachments, created_at, currency_code, exchange_rate, source_type, created_by_name')
          .eq('fund_id', fund.id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error || !data) break;
        rows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      if (cancelled) return;
      const mapped: Transaction[] = rows.map(t => ({
        id: t.id,
        type: t.type as any,
        category: t.category as any,
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
      }));
      setAllFundTransactions(mapped);
      setLoadingFundTx(false);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [fund?.id, transactions.length]);

  const fundTransactions = useMemo(() => {
    if (!fund) return [];
    // ندمج: نفضّل الجلب المباشر من DB، ونرجع للـprop عند التحميل الأول
    const source = allFundTransactions.length > 0 ? allFundTransactions : transactions.filter(t => t.fundId === fund.id);
    return [...source].sort(compareTransactionsByBusinessDateAsc);
  }, [fund, transactions, allFundTransactions]);

  // Get unique currency codes from transactions
  const availableCurrencyTabs = useMemo(() => {
    const codes = new Set<string>();
    fundTransactions.forEach(t => {
      const code = (t as any).currencyCode || 'USD';
      codes.add(code);
    });
    return Array.from(codes);
  }, [fundTransactions]);

  // Filter transactions by currency tab
  const filteredTransactions = useMemo(() => {
    if (activeCurrencyTab === 'all') return fundTransactions;
    return fundTransactions.filter(t => {
      const code = (t as any).currencyCode || 'USD';
      return code === activeCurrencyTab;
    });
  }, [fundTransactions, activeCurrencyTab]);

  const stats = useMemo(() => {
    const totalIn = filteredTransactions.filter(t => t.type === 'in').reduce((sum, t) => sum + t.amount, 0);
    const totalOut = filteredTransactions.filter(t => t.type === 'out').reduce((sum, t) => sum + t.amount, 0);
    const balance = totalIn - totalOut;
    return { totalIn, totalOut, balance, transactionCount: filteredTransactions.length };
  }, [filteredTransactions]);

  // Build running balance rows
  const ledgerRows = useMemo(() => {
    let running = 0;
    return filteredTransactions.map(t => {
      if (t.type === 'in') running += t.amount;
      else running -= t.amount;
      return { ...t, runningBalance: running };
    });
  }, [filteredTransactions]);

  // Build currency tabs list
  const currencyTabs = useMemo(() => {
    const tabs: { code: string; label: string; flag?: string }[] = [
      { code: 'all', label: 'الكل' },
    ];
    availableCurrencyTabs.forEach(code => {
      tabs.push({ code, label: code, flag: CURRENCY_FLAGS[code] });
    });
    return tabs;
  }, [availableCurrencyTabs]);

  // Reversed for display (newest first)
  const displayTransactions = useMemo(() => {
    return [...filteredTransactions].sort(compareTransactionsByBusinessDateDesc);
  }, [filteredTransactions]);

  if (!fund) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">الصندوق غير موجود</p>
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>
        </div>
      </div>
    );
  }

  const Icon = FUND_ICONS[fund.type] || Wallet;

  const hasTransactions = fundTransactions.length > 0;

  const handleOpenEdit = () => {
    setEditName(fund.name);
    setEditType(fund.type);
    setEditDescription(fund.description || '');
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!onUpdateFund || !editName.trim()) return;
    await onUpdateFund(fund.id, { name: editName.trim(), type: editType as FundType, description: editDescription.trim() || undefined });
    setShowEditDialog(false);
  };

  const handleDeleteFund = async () => {
    if (!onDeleteFund) return;
    await onDeleteFund(fund.id);
    navigate(-1);
    setShowDeleteDialog(false);
  };
  const handleDownloadHDPDF = async () => {
    if (!previewRef.current) return;
    try {
      await generateHDPreviewPDF(previewRef.current, `كشف_صندوق_HD_${fund.name}.pdf`);
      toast.success('تم تصدير كشف الصندوق HD');
    } catch { toast.error('خطأ في التصدير'); }
  };

  const handleExportExcel = () => {
    const header = 'التاريخ,البيان,التصنيف,مدين,دائن,الرصيد\n';
    let running = 0;
    const rows = filteredTransactions.map(t => {
      if (t.type === 'in') running += t.amount; else running -= t.amount;
      return `${formatDateGregorian(t.date)},${(t.description || '').replace(/,/g, ' ')},${t.category},${t.type === 'in' ? formatAmount(t.amount) : ''},${t.type === 'out' ? formatAmount(t.amount) : ''},${formatAmount(running)}`;
    }).join('\n');
    const csv = '\uFEFF' + header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `كشف_صندوق_${fund.name}_${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('تم تصدير Excel/CSV');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Sidebar currentPage="funds" onNavigate={(page) => navigate(`/?page=${page}`)} />

      <div className="flex-1 flex flex-col min-h-screen md:mr-64 rtl:md:mr-64 ltr:md:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-gradient-primary text-primary-foreground shadow-lg">
          <div className="container max-w-5xl mx-auto flex h-14 items-center gap-3 px-4">
            <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-primary-foreground/10">
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate">{fund.name}</h1>
              <p className="text-xs opacity-80">{FUND_LABELS[fund.type]}</p>
            </div>
            <div className="flex items-center gap-1">
              {onRefresh && (
                <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={onRefresh}>
                  <RefreshCw className="h-5 w-5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => setShowPreview(true)}>
                <Eye className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        <main className="container max-w-lg mx-auto px-4 py-4 space-y-4 md:max-w-4xl lg:max-w-5xl pb-24">
        {/* Fund Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-card p-4 shadow-sm border border-border"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full",
              fund.type === 'cash' ? "bg-gradient-income" : fund.type === 'bank' ? "bg-gradient-primary" : "bg-gradient-savings"
            )}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold">{fund.name}</h2>
              <p className="text-xs text-muted-foreground">{FUND_LABELS[fund.type]}</p>
            </div>
          </div>
          
          <div className="text-center py-4 border-y border-border">
            <p className="text-xs text-muted-foreground mb-1">الرصيد الحالي</p>
            <p className="text-3xl font-bold text-foreground">${fund.balance.toLocaleString()}</p>
          </div>

          {fund.description && (
            <p className="mt-3 text-sm text-muted-foreground bg-muted p-3 rounded-lg">{fund.description}</p>
          )}
        </motion.div>

        {/* 3 Power Cards */}
        <div className="grid grid-cols-3 gap-3">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
            <TrendingUp className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-emerald-600">${formatNumber(stats.totalIn)}</p>
            <p className="text-[10px] text-emerald-600 font-medium">مدين (Debit)</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-center">
            <TrendingDown className="h-5 w-5 text-rose-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-rose-600">${formatNumber(stats.totalOut)}</p>
            <p className="text-[10px] text-rose-600 font-medium">دائن (Credit)</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={cn("rounded-xl border p-3 text-center",
              stats.balance > 0 ? "bg-emerald-500/10 border-emerald-500/20" :
              stats.balance < 0 ? "bg-rose-500/10 border-rose-500/20" :
              "bg-muted border-border"
            )}>
            <Scale className={cn("h-5 w-5 mx-auto mb-1", stats.balance > 0 ? "text-emerald-600" : stats.balance < 0 ? "text-rose-600" : "text-muted-foreground")} />
            <p className={cn("text-lg font-bold", stats.balance > 0 ? "text-emerald-600" : stats.balance < 0 ? "text-rose-600" : "text-muted-foreground")}>
              ${formatNumber(Math.abs(stats.balance))}
            </p>
            <p className="text-[10px] text-muted-foreground font-medium">الرصيد (Balance)</p>
          </motion.div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(true)} className="flex-1 gap-2 h-9 text-xs">
            <Eye className="h-3.5 w-3.5" /> معاينة كشف الصندوق
          </Button>
           {!hasTransactions && onUpdateFund && permissions.canEdit('funds') && (
             <Button variant="outline" onClick={handleOpenEdit} className="gap-2 h-9 text-xs">
               <Edit2 className="h-3.5 w-3.5" /> تعديل
             </Button>
           )}
           {!hasTransactions && onDeleteFund && permissions.canDelete('funds') && (
             <Button variant="outline" onClick={() => setShowDeleteDialog(true)} className="gap-2 h-9 text-xs text-destructive hover:text-destructive">
               <Trash2 className="h-3.5 w-3.5" /> حذف
             </Button>
           )}
        </div>

        {/* Currency Tabs */}
        {currencyTabs.length > 2 && (
          <div className="flex gap-1 p-1 bg-muted rounded-xl overflow-x-auto scrollbar-hide">
            {currencyTabs.map(tab => (
              <button
                key={tab.code}
                onClick={() => setActiveCurrencyTab(tab.code)}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                  activeCurrencyTab === tab.code
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.flag && <span className="text-sm">{tab.flag}</span>}
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Professional Ledger Table */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-xl bg-card shadow-sm border border-border overflow-hidden">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-bold">سجل العمليات المالية ({formatNumber(stats.transactionCount)})</h3>
          </div>
          {ledgerRows.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">لا توجد عمليات مسجلة</p>
          ) : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-center text-[11px] font-bold px-2">التاريخ</TableHead>
                    <TableHead className="text-center text-[11px] font-bold px-2">البيان</TableHead>
                    <TableHead className="text-center text-[11px] font-bold text-emerald-600 px-2">مدين</TableHead>
                    <TableHead className="text-center text-[11px] font-bold text-rose-600 px-2">دائن</TableHead>
                    <TableHead className="text-center text-[11px] font-bold px-2">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerRows.map((row) => (
                    <TableRow key={row.id} className="text-xs">
                      <TableCell className="text-center px-2 py-2 text-[11px] whitespace-nowrap">
                        {formatDateGregorian(row.date)}
                      </TableCell>
                      <TableCell className="text-center px-2 py-2 text-[11px] max-w-[120px] truncate">
                        {row.description || '-'}
                      </TableCell>
                      <TableCell className="text-center px-2 py-2 text-[11px] text-emerald-600 font-semibold">
                        {row.type === 'in' ? `$${formatAmount(row.amount)}` : '-'}
                      </TableCell>
                      <TableCell className="text-center px-2 py-2 text-[11px] text-rose-600 font-semibold">
                        {row.type === 'out' ? `$${formatAmount(row.amount)}` : '-'}
                      </TableCell>
                      <TableCell className={cn("text-center px-2 py-2 text-[11px] font-bold",
                        row.runningBalance > 0 ? "text-emerald-600" : row.runningBalance < 0 ? "text-rose-600" : "")}>
                        ${formatAmount(Math.abs(row.runningBalance))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </motion.div>

        {/* Transaction Log with delete support for manual transactions */}
        <UnifiedTransactionLog 
          transactions={displayTransactions}
          title={activeCurrencyTab === 'all' ? 'سجل عمليات الصندوق' : `عمليات ${activeCurrencyTab}`}
          showExport={true}
          maxHeight="400px"
          currencies={currencies}
          displayCurrencyCode={displayCurrency}
          onDisplayCurrencyChange={setDisplayCurrency}
          onDeleteTransaction={onDeleteTransaction}
        />

        {/* Legal Footer */}
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground leading-relaxed">{LEGAL_DISCLAIMER}</p>
        </div>
      </main>

        <div className="md:hidden">
          <BottomNav currentPage="funds" onNavigate={(page) => navigate(`/?page=${page}`)} />
        </div>
      </div>

      {/* HD Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> كشف صندوق - {fund.name}
            </DialogTitle>
          </DialogHeader>

          <div ref={previewRef} className="mx-4 bg-white text-black rounded-lg overflow-hidden" style={{ direction: 'rtl' }}>
            <div style={{ background: '#194178', color: 'white', padding: '16px', textAlign: 'center' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>كشف صندوق</h1>
              <p style={{ fontSize: '10px', opacity: 0.9 }}>توطين - المساعد المالي</p>
              <p style={{ fontSize: '9px', opacity: 0.8, marginTop: '2px' }}>تاريخ الإصدار: {formatDateGregorian(new Date(), 'long')}</p>
            </div>

            <div style={{ padding: '12px 16px', background: '#f5f7fa', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#194178' }}>{fund.name}</div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{FUND_LABELS[fund.type]}</div>
            </div>

            {/* 3 Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', padding: '12px 16px' }}>
              <div style={{ textAlign: 'center', padding: '10px 6px', background: '#dcfce7', borderRadius: '6px' }}>
                <div style={{ fontSize: '9px', color: '#166534', marginBottom: '2px' }}>مدين (Debit)</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#166534' }}>${formatNumber(stats.totalIn)}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '10px 6px', background: '#fef2f2', borderRadius: '6px' }}>
                <div style={{ fontSize: '9px', color: '#991b1b', marginBottom: '2px' }}>دائن (Credit)</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#991b1b' }}>${formatNumber(stats.totalOut)}</div>
              </div>
              <div style={{
                textAlign: 'center', padding: '10px 6px', borderRadius: '6px',
                background: stats.balance > 0 ? '#dcfce7' : stats.balance < 0 ? '#fef2f2' : '#f5f5f5',
              }}>
                <div style={{ fontSize: '9px', color: '#666', marginBottom: '2px' }}>الرصيد (Balance)</div>
                <div style={{
                  fontSize: '14px', fontWeight: 'bold',
                  color: stats.balance > 0 ? '#16a34a' : stats.balance < 0 ? '#dc2626' : '#666',
                }}>
                  ${formatNumber(Math.abs(stats.balance))}
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div style={{ padding: '0 16px 12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead>
                  <tr style={{ background: '#f0f4f8' }}>
                    <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center' }}>التاريخ</th>
                    <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center' }}>البيان</th>
                    <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center', color: '#166534' }}>مدين</th>
                    <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center', color: '#991b1b' }}>دائن</th>
                    <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center' }}>الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row, i) => (
                    <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '5px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>{formatDateGregorian(row.date)}</td>
                      <td style={{ padding: '5px 4px', textAlign: 'center' }}>{row.description || '-'}</td>
                      <td style={{ padding: '5px 4px', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>
                        {row.type === 'in' ? `$${formatAmount(row.amount)}` : '-'}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'center', color: '#dc2626', fontWeight: 600 }}>
                        {row.type === 'out' ? `$${formatAmount(row.amount)}` : '-'}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 'bold', color: row.runningBalance >= 0 ? '#16a34a' : '#dc2626' }}>
                        ${formatAmount(Math.abs(row.runningBalance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ledgerRows.length === 0 && (
                <p style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '11px' }}>لا توجد عمليات</p>
              )}
            </div>

            <div style={{ padding: '8px 16px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
              <p style={{ fontSize: '8px', color: '#999', lineHeight: 1.6 }}>{LEGAL_DISCLAIMER}</p>
            </div>
          </div>

          <div className="p-4 pt-2 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={handleDownloadHDPDF}>
              <Eye className="h-3.5 w-3.5" /> تصدير HD PDF
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={handleExportExcel}>
              <Wallet className="h-3.5 w-3.5" /> تصدير Excel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Fund Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تعديل الصندوق</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">اسم الصندوق *</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">النوع</label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FUND_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">الوصف</label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>إلغاء</Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim()}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Fund Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف الصندوق؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الصندوق "{fund.name}" نهائياً. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFund} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

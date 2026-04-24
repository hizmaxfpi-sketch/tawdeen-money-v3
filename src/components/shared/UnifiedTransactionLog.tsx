import { useState, useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpCircle, ArrowDownCircle, Filter, Search, ChevronDown, Edit3, Download, FileText, FileSpreadsheet, Trash2, X, Paperclip, Eye, Calendar, Printer, Globe, Ship, Briefcase, ArrowLeftRight, Landmark } from 'lucide-react';
import { generateHDPreviewPDF } from '@/utils/hdPreview';
import { cn } from '@/lib/utils';
import { Transaction } from '@/types/finance';
import { Currency } from '@/hooks/useCurrencies';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatDateGregorian, formatTime, formatDateTime } from '@/utils/formatUtils';
import { compareTransactionsByBusinessDateDesc } from '@/utils/transactionSort';
import { CurrencyDisplaySelector, convertForDisplay, formatWithCurrency, getOriginalAmount, getCurrencySymbol } from './CurrencyDisplaySelector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { TransactionHDPreview } from './TransactionHDPreview';
import { usePersistedFilter } from '@/hooks/usePersistedFilters';
import { useLanguage } from '@/i18n/LanguageContext';

interface UnifiedTransactionLogProps {
  transactions: Transaction[];
  title?: string;
  storageKey?: string;
  showExport?: boolean;
  showDateRange?: boolean;
  showPreviewButton?: boolean;
  onEditTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction?: (transactionId: string) => void;
  maxHeight?: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  currencies?: Currency[];
  displayCurrencyCode?: string;
  onDisplayCurrencyChange?: (code: string) => void;
}

export function UnifiedTransactionLog({ 
  transactions, 
  title,
  storageKey = 'default',
  showExport = true,
  showDateRange = false,
  showPreviewButton = false,
  onEditTransaction,
  onDeleteTransaction,
  maxHeight = '320px',
  hasMore,
  onLoadMore,
  currencies = [],
  displayCurrencyCode = 'USD',
  onDisplayCurrencyChange,
}: UnifiedTransactionLogProps) {
  const { t, language } = useLanguage();
  const persistKey = `txlog-${storageKey}`;
  const [rawFilter, setFilter] = usePersistedFilter<'all' | 'in' | 'out'>(`${persistKey}-filter`, 'all');
  // Defensive: only accept the 3 valid values; anything else falls back to 'all'
  const filter: 'all' | 'in' | 'out' = (rawFilter === 'in' || rawFilter === 'out') ? rawFilter : 'all';
  const [search, setSearch] = usePersistedFilter(`${persistKey}-search`, '');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [hdPreviewTransaction, setHdPreviewTransaction] = useState<Transaction | null>(null);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [dateFrom, setDateFrom] = usePersistedFilter(`${persistKey}-datefrom`, '');
  const [dateTo, setDateTo] = usePersistedFilter(`${persistKey}-dateto`, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const displayTitle = title || t('reports.transactionLog');

  // ✅ Memoized filter+sort — runs only when inputs change (was running every render)
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(tx => {
        const matchesType = filter === 'all' || tx.type === filter;
        const matchesSearch = (tx.description || '').toLowerCase().includes(search.toLowerCase());
        const matchesDateFrom = !dateFrom || tx.date >= dateFrom;
        const matchesDateTo = !dateTo || tx.date <= dateTo;
        return matchesType && matchesSearch && matchesDateFrom && matchesDateTo;
      })
      .sort(compareTransactionsByBusinessDateDesc);
  }, [transactions, filter, search, dateFrom, dateTo]);

  useEffect(() => {
    const handleScroll = () => {
      if (expandedId) setExpandedId(null);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (expandedId && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpandedId(null);
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedId]);

  const handleTransactionClick = (transaction: Transaction) => {
    if (expandedId === transaction.id) {
      setEditingTransaction(transaction);
    } else {
      setExpandedId(transaction.id);
    }
  };

  const formatDate = (dateStr: string) => {
    return formatDateGregorian(dateStr);
  };

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getCategoryLabel = (category: string) => {
    return t(`category.${category}`);
  };

  const formatDescription = (tx: Transaction): string => {
    const desc = tx.description || '';
    if (desc.startsWith('قيمة عقد مشروع:')) return `عقد - ${desc.replace('قيمة عقد مشروع: ', '')}`;
    if (desc.startsWith('تكلفة مشروع:')) return `تكلفة - ${desc.replace('تكلفة مشروع: ', '')}`;
    if (desc.startsWith('أجور شحن - ')) return desc;
    if (desc.startsWith('دفعة - ')) return desc;
    if (desc.startsWith('ترحيل تلقائي - قيمة عقد مشروع:')) return `عقد - ${desc.replace('ترحيل تلقائي - قيمة عقد مشروع: ', '')}`;
    if (desc.startsWith('ترحيل تلقائي - تكلفة مشروع:')) return `تكلفة - ${desc.replace('ترحيل تلقائي - تكلفة مشروع: ', '')}`;
    if (desc.startsWith('شحنة - ')) return desc.replace('شحنة - ', 'شحنة: ');
    if (desc.startsWith('دفعة شحنة - ')) return desc.replace('دفعة شحنة - ', 'دفعة: ');
    return desc;
  };
  const getSourceLabel = (sourceType: string): string => {
    return t(`source.${sourceType}`);
  };

  const getTransactionIcon = (tx: Transaction) => {
    if (tx.sourceType === 'shipment_invoice' || tx.sourceType === 'shipment_payment') {
      return <Ship className="h-4 w-4" />;
    }
    if (tx.sourceType === 'project_client' || tx.sourceType === 'project_vendor') {
      return <Briefcase className="h-4 w-4" />;
    }
    if (tx.sourceType === 'fund_transfer') {
      return <ArrowLeftRight className="h-4 w-4" />;
    }
    if (tx.sourceType === 'debt_payment') {
      return <Landmark className="h-4 w-4" />;
    }
    return tx.type === 'in' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />;
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    toast.success(`${t('common.loading')} ${format.toUpperCase()}...`);
  };

  const handleDelete = () => {
    if (deletingTransaction && onDeleteTransaction) {
      onDeleteTransaction(deletingTransaction.id);
      toast.success(t('common.success'));
    }
    setDeletingTransaction(null);
    setEditingTransaction(null);
  };

  return (
    <div ref={containerRef} className="rounded-xl bg-card p-3 shadow-sm border border-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold">{displayTitle}</h3>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowReportPreview(true)} title={t('common.previewReport')}>
            <Eye className="h-4 w-4" />
          </Button>
          {showExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border-border z-50">
                <DropdownMenuItem onClick={() => handleExport('pdf')} className="gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" />
                  {t('common.export')} PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4" />
                  {t('common.export')} Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn("p-1.5 rounded-md transition-colors", showFilters ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Currency Display Selector */}
      {currencies.length > 0 && onDisplayCurrencyChange && (
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] text-muted-foreground">{t('projects.displayCurrency')}</span>
          <CurrencyDisplaySelector currencies={currencies} selectedCode={displayCurrencyCode} onChange={onDisplayCurrencyChange} />
        </div>
      )}

      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
            <div className="space-y-2">
              <div className="relative">
                <Search className={cn("absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground", language === 'ar' ? "right-2.5" : "left-2.5")} />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search') + "..."} className={cn("h-9 text-sm", language === 'ar' ? "pr-9" : "pl-9")} />
              </div>
              <div className="flex gap-1.5">
                {(['all', 'in', 'out'] as const).map((type) => (
                  <button key={type} onClick={() => setFilter(type)} className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-colors", filter === type ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80")}>
                    {type === 'all' ? t('common.all') : type === 'in' ? t('tx.debit') : t('tx.credit')}
                  </button>
                ))}
              </div>
              {/* Date Range Filter */}
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">{t('common.fromDate')}</label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">{t('common.toDate')}</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
                </div>
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="mt-3 p-1 hover:bg-muted rounded">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <TransactionList
        items={filteredTransactions}
        maxHeight={maxHeight}
        expandedId={expandedId}
        displayCurrencyCode={displayCurrencyCode}
        currencies={currencies}
        onClick={handleTransactionClick}
        getTransactionIcon={getTransactionIcon}
        getCategoryLabel={getCategoryLabel}
        getSourceLabel={getSourceLabel}
        formatDescription={formatDescription}
        formatDate={formatDate}
        formatFullDate={formatFullDate}
        emptyLabel={t('common.noTransactions')}
        labels={{
          date: t('tx.date'),
          typeLabel: t('common.typeLabel'),
          debit: t('tx.debit'),
          credit: t('tx.credit'),
          currency: t('tx.currency'),
          exchangeRate: t('tx.exchangeRate'),
          time: t('activity.time'),
          user: t('activity.user'),
          notes: t('tx.notes'),
          clickAgain: t('tx.clickAgain'),
        }}
      />

      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            className="h-8 text-[11px] gap-1.5 px-6 border-primary/20 hover:bg-primary/5 text-primary"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {t('common.loadMore')}
          </Button>
        </div>
      )}

      {/* Transaction Details Modal */}
      <Dialog open={!!editingTransaction} onOpenChange={(open) => !open && setEditingTransaction(null)}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm">{t('common.details')}</DialogTitle>
          </DialogHeader>
          {editingTransaction && (
            <div className="space-y-3">
              <div className="p-2.5 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", editingTransaction.type === 'in' ? "bg-income-light" : "bg-expense-light")}>
                    {editingTransaction.type === 'in' ? <ArrowUpCircle className="h-4 w-4 text-income" /> : <ArrowDownCircle className="h-4 w-4 text-expense" />}
                  </div>
                  <div>
                    <p className="text-xs font-medium">{editingTransaction.description}</p>
                    <p className={cn("text-sm font-bold", editingTransaction.type === 'in' ? "text-income" : "text-expense")}>
                      {editingTransaction.type === 'in' ? '+' : '-'}${editingTransaction.amount.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('tx.category')}:</span>
                    <span>{getCategoryLabel(editingTransaction.category)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.source')}:</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-bold",
                      (!editingTransaction.sourceType || editingTransaction.sourceType === 'manual')
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    )}>
                      {getSourceLabel(editingTransaction.sourceType || 'manual')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('tx.date')}:</span>
                    <span>{formatFullDate(editingTransaction.date)}</span>
                  </div>
                  {editingTransaction.currencyCode && editingTransaction.currencyCode !== 'USD' && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('tx.currency')}:</span>
                      <span>{(() => { const orig = getOriginalAmount(editingTransaction); return `${orig.code} ${orig.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`; })()}</span>
                    </div>
                  )}
                  {editingTransaction.currencyCode && editingTransaction.currencyCode !== 'USD' && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('tx.exchangeRate')}:</span>
                      <span>{editingTransaction.exchangeRate}</span>
                    </div>
                  )}
                  {editingTransaction.createdAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('activity.time')}:</span>
                      <span>{formatDateTime(editingTransaction.createdAt)}</span>
                    </div>
                  )}
                  {editingTransaction.notes && (
                    <div>
                      <span className="text-muted-foreground">{t('tx.notes')}:</span>
                      <p className="mt-0.5 p-1.5 bg-background rounded text-[11px]">{editingTransaction.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {editingTransaction.attachment && (
                <div className="p-2.5 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-xs">
                    <Paperclip className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">{t('tx.attachedDocument')}</span>
                  </div>
                  <div className="mt-2">
                    {editingTransaction.attachment.startsWith('data:image') ? (
                      <img src={editingTransaction.attachment} alt="مرفق" className="w-full h-24 object-cover rounded-md" />
                    ) : (
                      <div className="flex items-center gap-2 p-2 bg-background rounded-md">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[11px]">{t('tx.attachedFile')}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="gap-1 h-8 text-[11px]"
                  onClick={() => {
                    setHdPreviewTransaction(editingTransaction);
                    setEditingTransaction(null);
                  }}
                >
                  <Eye className="h-3 w-3" />
                  {t('common.preview')} HD
                </Button>
                
                {/* Show edit only for manual transactions */}
                {(!editingTransaction.sourceType || editingTransaction.sourceType === 'manual') && onEditTransaction && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="gap-1 h-8 text-[11px]"
                    onClick={() => {
                      onEditTransaction(editingTransaction);
                      setEditingTransaction(null);
                    }}
                  >
                    <Edit3 className="h-3 w-3" />
                    {t('common.edit')}
                  </Button>
                )}
                
                {/* Show delete only for manual transactions or when explicitly allowed */}
                {(!editingTransaction.sourceType || editingTransaction.sourceType === 'manual') && onDeleteTransaction && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="gap-1 h-8 text-[11px] text-destructive hover:text-destructive"
                    onClick={() => setDeletingTransaction(editingTransaction)}
                  >
                    <Trash2 className="h-3 w-3" />
                    {t('common.delete')}
                  </Button>
                )}

                {/* Info for auto-generated entries */}
                {editingTransaction.sourceType && editingTransaction.sourceType !== 'manual' && (
                  <div className="col-span-2 text-center p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold mb-1">
                      {t('tx.protectedEntry')}
                    </p>
                    <p className="text-[9px] text-amber-600 dark:text-amber-500">
                      {editingTransaction.sourceType === 'project_client' || editingTransaction.sourceType === 'project_vendor'
                        ? t('tx.projectLink')
                        : editingTransaction.sourceType === 'shipment_invoice' || editingTransaction.sourceType === 'shipment_payment'
                        ? t('tx.shipmentLink')
                        : editingTransaction.sourceType === 'fund_transfer'
                        ? t('tx.transferLink')
                        : editingTransaction.sourceType === 'debt_payment'
                        ? t('tx.debtLink')
                        : t('tx.autoLink')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* HD Preview Dialog */}
      <TransactionHDPreview
        transaction={hdPreviewTransaction}
        open={!!hdPreviewTransaction}
        onClose={() => setHdPreviewTransaction(null)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTransaction} onOpenChange={(open) => !open && setDeletingTransaction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ar' ? 'سيتم حذف هذه العملية نهائياً. هذا الإجراء لا يمكن التراجع عنه.' : 'This transaction will be permanently deleted. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report Preview Dialog */}
      <Dialog open={showReportPreview} onOpenChange={setShowReportPreview}>
        <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" /> {t('reports.ledgerPreview')}
              </DialogTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={() => {
                  if (!reportRef.current) return;
                  const printWindow = window.open('', '_blank');
                  if (!printWindow) return;
                  printWindow.document.write(`
                    <html dir="${language === 'ar' ? 'rtl' : 'ltr'}"><head><title>${t('reports.transactionLog')}</title>
                    <style>
                      * { margin:0; padding:0; box-sizing:border-box; }
                      body { font-family: 'Segoe UI', Tahoma, sans-serif; direction:${language === 'ar' ? 'rtl' : 'ltr'}; padding:15mm; color:#1a1a1a; }
                      table { width:100%; border-collapse:collapse; }
                      th { background:#194178; color:white; padding:6px; font-size:11px; }
                      td { padding:5px 4px; border-bottom:1px solid #e5e7eb; text-align:center; font-size:10px; }
                      tr:nth-child(even) { background:#f9fafb; }
                      @media print { body { padding:10mm; } }
                    </style></head><body>
                    ${reportRef.current.innerHTML}
                    </body></html>
                  `);
                  printWindow.document.close();
                  setTimeout(() => printWindow.print(), 400);
                }}>
                  <Printer className="h-3 w-3" /> {t('common.print')}
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={async () => {
                  if (!reportRef.current) return;
                  try {
                    await generateHDPreviewPDF(reportRef.current, `report_${Date.now()}.pdf`);
                    toast.success(t('common.success'));
                  } catch { toast.error(t('common.error')); }
                }}>
                  <FileText className="h-3 w-3" /> PDF
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div ref={reportRef} className="mx-4 mb-4 bg-white text-black rounded-lg overflow-hidden" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
            <div style={{ background: '#194178', color: 'white', padding: '16px', textAlign: 'center' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '4px' }}>{t('reports.transactionLog')}</h1>
              <p style={{ fontSize: '10px', opacity: 0.9 }}>{t('brand.full')}</p>
              <p style={{ fontSize: '9px', opacity: 0.8, marginTop: '2px' }}>
                {t('common.issueDate')}: {formatDateGregorian(new Date(), 'long')}
                {dateFrom && ` | ${t('common.fromDate')}: ${dateFrom}`}
                {dateTo && ` | ${t('common.toDate')}: ${dateTo}`}
                {displayCurrencyCode !== 'USD' && ` | ${t('common.currency')}: ${displayCurrencyCode}`}
              </p>
            </div>

            <div style={{ padding: '8px 12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead>
                   <tr style={{ background: '#f0f4f8' }}>
                     <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center' }}>{t('common.date')}</th>
                     <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center' }}>{t('activity.time')}</th>
                     <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center' }}>{t('tx.description')}</th>
                     <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center' }}>{t('common.typeLabel')}</th>
                     <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center' }}>{t('common.amount')} ({getCurrencySymbol(displayCurrencyCode, currencies)})</th>
                     {displayCurrencyCode === 'USD' && <th style={{ padding: '6px 4px', borderBottom: '2px solid #194178', textAlign: 'center' }}>{t('tx.currency')}</th>}
                   </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t_item, i) => (
                    <tr key={t_item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '5px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>{formatDateGregorian(t_item.date)}</td>
                      <td style={{ padding: '5px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>{t_item.createdAt ? formatTime(t_item.createdAt) : '-'}</td>
                      <td style={{ padding: '5px 4px', textAlign: 'center' }}>{t_item.description || '-'}</td>
                      <td style={{ padding: '5px 4px', textAlign: 'center', color: t_item.type === 'in' ? '#16a34a' : '#dc2626' }}>
                        {t_item.type === 'in' ? t('tx.debit') : t('tx.credit')}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 'bold', color: t_item.type === 'in' ? '#16a34a' : '#dc2626' }}>
                        {displayCurrencyCode === 'USD'
                          ? `$${t_item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : formatWithCurrency(convertForDisplay(t_item.amount, displayCurrencyCode, currencies), displayCurrencyCode, currencies)
                        }
                      </td>
                      {displayCurrencyCode === 'USD' && (
                        <td style={{ padding: '5px 4px', textAlign: 'center', fontSize: '9px', color: '#666' }}>
                          {t_item.currencyCode && t_item.currencyCode !== 'USD'
                            ? (() => { const orig = getOriginalAmount(t_item); return `${orig.code} ${orig.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`; })()
                            : '-'
                          }
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTransactions.length === 0 && (
                <p style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '11px' }}>{t('common.noTransactions')}</p>
              )}
            </div>

            {/* Summary totals */}
             {filteredTransactions.length > 0 && (() => {
              const totalIn = filteredTransactions.filter(t_item => t_item.type === 'in').reduce((s, t_item) => s + t_item.amount, 0);
              const totalOut = filteredTransactions.filter(t_item => t_item.type === 'out').reduce((s, t_item) => s + t_item.amount, 0);
              const sym = getCurrencySymbol(displayCurrencyCode, currencies);
              const dispIn = convertForDisplay(totalIn, displayCurrencyCode, currencies);
              const dispOut = convertForDisplay(totalOut, displayCurrencyCode, currencies);
              return (
              <div style={{ padding: '8px 12px', borderTop: '2px solid #194178' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ textAlign: 'center', padding: '8px', background: '#dcfce7', borderRadius: '6px' }}>
                    <div style={{ fontSize: '9px', color: '#166534' }}>{language === 'ar' ? 'إجمالي مدين (Debit)' : 'Total Debit'}</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#166534' }}>
                      {sym}{dispIn.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px', background: '#fef2f2', borderRadius: '6px' }}>
                    <div style={{ fontSize: '9px', color: '#991b1b' }}>{language === 'ar' ? 'إجمالي دائن (Credit)' : 'Total Credit'}</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#991b1b' }}>
                      {sym}{dispOut.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
              );
            })()}

            <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
              <p style={{ fontSize: '8px', color: '#999', lineHeight: 1.6 }}>
                {t('reports.legalDisclaimer')}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============= Virtualized Transaction List =============
// Renders rows with a virtualizer when list is long (>30) to avoid mounting hundreds of nodes.
// Removes the per-item stagger animation that compounded into seconds of jank on long lists.
interface TxListProps {
  items: Transaction[];
  maxHeight: string;
  expandedId: string | null;
  displayCurrencyCode: string;
  currencies: Currency[];
  onClick: (tx: Transaction) => void;
  getTransactionIcon: (tx: Transaction) => JSX.Element;
  getCategoryLabel: (c: string) => string;
  getSourceLabel: (s: string) => string;
  formatDescription: (tx: Transaction) => string;
  formatDate: (s: string) => string;
  formatFullDate: (s: string) => string;
  emptyLabel: string;
  labels: {
    date: string; typeLabel: string; debit: string; credit: string;
    currency: string; exchangeRate: string; time: string;
    user: string; notes: string; clickAgain: string;
  };
}

function TransactionList(props: TxListProps) {
  const { items, maxHeight, expandedId } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const VIRT_THRESHOLD = 30;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (items[index]?.id === expandedId ? 220 : 56),
    overscan: 6,
    getItemKey: (index) => items[index]?.id || index,
  });

  // Re-measure when expandedId toggles so the row grows/shrinks smoothly
  useEffect(() => {
    virtualizer.measure();
  }, [expandedId, virtualizer]);

  if (items.length === 0) {
    return (
      <div className="overflow-y-auto scrollbar-hide" style={{ maxHeight }}>
        <p className="text-center py-6 text-sm text-muted-foreground">{props.emptyLabel}</p>
      </div>
    );
  }

  // Small lists: render directly (no virtualization overhead)
  if (items.length <= VIRT_THRESHOLD) {
    return (
      <div className="space-y-1.5 overflow-y-auto scrollbar-hide" style={{ maxHeight }}>
        {items.map(tx => <TxRow key={tx.id} tx={tx} {...props} />)}
      </div>
    );
  }

  // Large lists: virtualized
  return (
    <div ref={parentRef} className="overflow-y-auto scrollbar-hide" style={{ maxHeight, contain: 'strict' }}>
      <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vItem => {
          const tx = items[vItem.index];
          return (
            <div
              key={vItem.key}
              ref={virtualizer.measureElement}
              data-index={vItem.index}
              style={{
                position: 'absolute',
                top: 0, left: 0, width: '100%',
                transform: `translateY(${vItem.start}px)`,
                paddingBottom: 6,
              }}
            >
              <TxRow tx={tx} {...props} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TxRowProps extends Omit<TxListProps, 'items' | 'maxHeight' | 'emptyLabel'> {
  tx: Transaction;
}

function TxRow({
  tx, expandedId, displayCurrencyCode, currencies, onClick,
  getTransactionIcon, getCategoryLabel, getSourceLabel,
  formatDescription, formatDate, formatFullDate, labels,
}: TxRowProps) {
  const isExpanded = expandedId === tx.id;
  return (
    <div
      onClick={() => onClick(tx)}
      className={cn(
        "cursor-pointer rounded-lg transition-colors duration-150 border",
        isExpanded
          ? "bg-accent/50 border-primary/30 shadow-md"
          : "bg-transparent border-transparent hover:bg-muted/50"
      )}
    >
      <div className="flex items-center gap-2.5 p-2">
        <div className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
          tx.type === 'in' ? "bg-income-light text-income" : "bg-expense-light text-expense",
          tx.sourceType === 'shipment_invoice' || tx.sourceType === 'shipment_payment' ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
          tx.sourceType === 'project_client' || tx.sourceType === 'project_vendor' ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" : ""
        )}>
          {getTransactionIcon(tx)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{formatDescription(tx)}</p>
            {tx.sourceType && tx.sourceType !== 'manual' && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                {getSourceLabel(tx.sourceType)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{getCategoryLabel(tx.category)}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">{formatDate(tx.date)}</span>
            {tx.createdAt && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-[10px] text-muted-foreground">{formatTime(tx.createdAt)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className={cn("text-sm font-bold", tx.type === 'in' ? "text-income" : "text-expense")}>
            {tx.type === 'in' ? '+' : '-'}
            {displayCurrencyCode === 'USD'
              ? `$${tx.amount.toLocaleString()}`
              : formatWithCurrency(convertForDisplay(tx.amount, displayCurrencyCode, currencies), displayCurrencyCode, currencies)
            }
          </span>
          {tx.currencyCode && tx.currencyCode !== 'USD' && displayCurrencyCode === 'USD' && (
            <span className="text-[9px] text-muted-foreground">
              {(() => { const orig = getOriginalAmount(tx); return `${orig.code} ${orig.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`; })()}
            </span>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-180")} />
      </div>

      {isExpanded && (
        <div className="overflow-hidden">
          <div className="px-3 pb-2 pt-1 border-t border-border/50 space-y-1.5">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">{labels.date}:</span><span className="mr-1 font-medium">{formatFullDate(tx.date)}</span></div>
              <div><span className="text-muted-foreground">{labels.typeLabel}:</span><span className="mr-1 font-medium">{tx.type === 'in' ? labels.debit : labels.credit}</span></div>
              {tx.currencyCode && tx.currencyCode !== 'USD' && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">{labels.currency}:</span>
                  <span className="mr-1 font-medium">
                    {(() => { const orig = getOriginalAmount(tx); return `${orig.code} ${orig.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${labels.exchangeRate}: ${orig.rate})`; })()}
                  </span>
                </div>
              )}
              {tx.createdAt && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">{labels.time}:</span>
                  <span className="mr-1 font-medium">{formatDateTime(tx.createdAt)}</span>
                </div>
              )}
              {tx.createdByName && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">{labels.user}:</span>
                  <span className="mr-1 font-medium text-primary">{tx.createdByName}</span>
                </div>
              )}
            </div>
            {tx.notes && (
              <div className="text-xs">
                <span className="text-muted-foreground">{labels.notes}:</span>
                <p className="mt-0.5 text-foreground bg-muted/50 p-1.5 rounded text-[11px]">{tx.notes}</p>
              </div>
            )}
            <div className="flex items-center justify-center pt-1">
              <span className="text-[10px] text-primary flex items-center gap-1">
                <Edit3 className="h-3 w-3" />
                {labels.clickAgain}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

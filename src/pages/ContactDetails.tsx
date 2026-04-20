import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowRight, Edit2, Trash2, TrendingUp, TrendingDown, 
  Phone, Mail, Building2, MessageCircle, MapPin, 
  UserCheck, Truck, Ship, Briefcase, Handshake, User,
  Plus, Printer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BottomNav } from '@/components/layout/BottomNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { useLanguage } from '@/i18n/LanguageContext';
import { UnifiedTransactionLog } from '@/components/shared/UnifiedTransactionLog';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { useSupabaseFinance } from '@/hooks/useSupabaseFinance';
import { Contact, ContactType, CONTACT_TYPE_LABELS, CONTACT_TYPE_COLORS } from '@/types/contacts';
import { Transaction } from '@/types/finance';
import { useCurrencies, CURRENCY_FLAGS, DEFAULT_APP_CURRENCY } from '@/hooks/useCurrencies';
import { calculateLedgerSummary } from '@/utils/ledgerSummary';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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

// أيقونات الأنواع
const TypeIcons: Record<ContactType, any> = {
  client: UserCheck,
  vendor: Truck,
  shipping_agent: Ship,
  employee: Briefcase,
  partner: Handshake,
  other: User,
};

export function ContactDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { user } = useAuth();
  const { contacts, updateContact, deleteContact } = useSupabaseContacts();
  const { transactions, funds, addTransaction, updateTransaction, deleteTransaction, getFundOptions } = useSupabaseFinance();
  const { currencies } = useCurrencies();
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionType, setTransactionType] = useState<'credit' | 'debit'>('credit');
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // حقول نموذج العملية المالية
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [txDescription, setTxDescription] = useState('');
  const [txFundId, setTxFundId] = useState<string>('');
  const [txCurrencyCode, setTxCurrencyCode] = useState('USD');
  const [txManualExchangeRate, setTxManualExchangeRate] = useState('');

  const contact = useMemo(() => contacts.find(c => c.id === id), [contacts, id]);
  
  const fundOptions = getFundOptions();

  // Fetch ALL contact transactions directly from DB (no pagination limit)
  const [contactTransactions, setContactTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  useEffect(() => {
    if (!contact || !user) return;
    setTxLoading(true);
    supabase
      .from('transactions')
      .select('id, type, category, amount, description, date, fund_id, contact_id, project_id, notes, created_at, currency_code, exchange_rate, source_type, created_by_name, attachments')
      .eq('contact_id', contact.id)
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setContactTransactions(data.map((t: any) => ({
            id: t.id, type: t.type as any, category: t.category as any, amount: Number(t.amount),
            description: t.description || '', date: t.date, fundId: t.fund_id || '',
            contactId: t.contact_id || undefined, projectId: t.project_id || undefined,
            notes: t.notes || undefined, createdAt: new Date(t.created_at),
            currencyCode: t.currency_code || 'USD', exchangeRate: Number(t.exchange_rate || 1),
            sourceType: t.source_type || 'manual', createdByName: t.created_by_name || undefined,
            attachment: t.attachments?.[0] || undefined,
          })));
        }
        setTxLoading(false);
      });
  }, [contact, user, transactions]);
  // الإحصائيات - المصدر الوحيد هو سجل العمليات المالية نفسه
  const stats = useMemo(() => {
    return calculateLedgerSummary(contactTransactions);
  }, [contactTransactions]);
  // حساب معامل الصرف الفعلي
  const centralizedRate = useMemo(() => {
    if (txCurrencyCode === 'USD') return 1;
    const currency = currencies.find(c => c.code === txCurrencyCode);
    return currency?.exchangeRate || 1;
  }, [txCurrencyCode, currencies]);

  const effectiveRate = useMemo(() => {
    if (txManualExchangeRate) {
      const parsed = parseFloat(txManualExchangeRate);
      return parsed > 0 ? parsed : centralizedRate;
    }
    return centralizedRate;
  }, [txManualExchangeRate, centralizedRate]);

  const usdEquivalent = useMemo(() => {
    const amt = parseFloat(txAmount);
    if (!amt || txCurrencyCode === 'USD') return null;
    return amt / effectiveRate;
  }, [txAmount, txCurrencyCode, effectiveRate]);

  const selectedCurrency = currencies.find(c => c.code === txCurrencyCode) || DEFAULT_APP_CURRENCY;

  if (!contact) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">الحساب الدفتري المطلوب غير موجود</p>
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>
        </div>
      </div>
    );
  }

  const TypeIcon = TypeIcons[contact.type] || User;
  const typeColor = CONTACT_TYPE_COLORS[contact.type];

  const handleDelete = async () => {
    await deleteContact(contact.id);
    navigate(-1);
    setShowDeleteDialog(false);
  };

  const handleOpenTransactionForm = (type: 'credit' | 'debit') => {
    setEditingTransaction(null);
    setTransactionType(type);
    setTxAmount('');
    const now = new Date();
    setTxDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
    setTxDescription('');
    setTxFundId('');
    setTxCurrencyCode('USD');
    setTxManualExchangeRate('');
    setShowTransactionForm(true);
  };

  const openTransactionEditor = (tx: Transaction) => {
    setEditingTransaction(tx);
    setTransactionType(tx.type === 'in' ? 'debit' : 'credit');
    setTxAmount(tx.amount.toString());
    setTxDate(tx.date);
    setTxDescription(tx.description);
    setTxFundId(tx.fundId || '');
    setTxCurrencyCode(tx.currencyCode || 'USD');
    setTxManualExchangeRate(
      tx.currencyCode && tx.currencyCode !== 'USD' && tx.exchangeRate ? String(tx.exchangeRate) : '',
    );
    setShowTransactionForm(true);
  };

  const resetTransactionEditor = () => {
    setEditingTransaction(null);
    setTxSubmitting(false);
  };

  const handleAddTransaction = async () => {
    const amount = parseFloat(txAmount);
    if (!amount || amount <= 0 || !txDescription.trim() || txSubmitting) return;
    setTxSubmitting(true);
    try {
      const txType = transactionType === 'debit' ? 'in' : 'out';
      const category = txFundId
        ? (transactionType === 'debit' ? 'client_collection' : 'vendor_payment')
        : (transactionType === 'debit' ? 'ledger_debit' : 'ledger_credit');
      
      const finalAmount = txCurrencyCode === 'USD' ? amount : amount / effectiveRate;
      
      const payload = {
        type: txType,
        amount: Number(finalAmount.toFixed(4)),
        date: txDate,
        category,
        description: txDescription.trim(),
        fundId: txFundId || '',
        contactId: contact.id,
        currencyCode: txCurrencyCode,
        exchangeRate: effectiveRate,
      } as any;

      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, payload);
      } else {
        await addTransaction(payload);
      }

      setShowTransactionForm(false);
      resetTransactionEditor();
    } finally {
      setTxSubmitting(false);
    }
  };

  const handleWhatsAppClick = () => {
    const phone = contact.phone;
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Sidebar currentPage="accounts" onNavigate={(page) => navigate(`/?page=${page}`)} />

      <div className="flex-1 flex flex-col min-h-screen md:mr-64 rtl:md:mr-64 ltr:md:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-gradient-primary text-primary-foreground shadow-lg">
          <div className="container max-w-5xl mx-auto flex h-14 items-center gap-3 px-4">
            <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-primary-foreground/10">
              <ArrowRight className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-bold flex-1">تفاصيل الحساب الدفتري</h1>
          </div>
        </header>

        <main className="container max-w-lg mx-auto px-4 py-4 space-y-4 md:max-w-4xl lg:max-w-5xl pb-24">
        {/* Account Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-card p-4 shadow-sm border border-border"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full border",
              typeColor
            )}>
              <TypeIcon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold">{contact.name}</h2>
              <p className="text-xs text-muted-foreground">{CONTACT_TYPE_LABELS[contact.type]}</p>
              {contact.company && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Building2 className="h-3 w-3" />
                  {contact.company}
                </p>
              )}
            </div>
          </div>
          
          {/* Balance Display */}
          <div className="text-center py-4 border-y border-border">
            <p className="text-xs text-muted-foreground mb-1">الرصيد الحالي</p>
            <p className={cn(
              "text-2xl font-bold",
              stats.balance > 0 ? "text-income" : stats.balance < 0 ? "text-expense" : "text-foreground"
            )}>
              {stats.balance > 0 ? '+' : stats.balance < 0 ? '-' : ''}${Math.abs(stats.balance).toLocaleString()}
            </p>
          </div>

          {/* Contact Info */}
          <div className="mt-3 space-y-2">
            {contact.phone && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span dir="ltr">{contact.phone}</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={handleWhatsAppClick}>
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={() => window.open(`tel:${contact.phone}`)}>
                    <Phone className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span dir="ltr">{contact.email}</span>
              </div>
            )}
            {contact.address && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{contact.address}</span>
              </div>
            )}
          </div>

          {contact.notes && (
            <p className="mt-3 text-sm text-muted-foreground bg-muted p-3 rounded-lg">{contact.notes}</p>
          )}
        </motion.div>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl bg-card p-3 shadow-sm border border-border text-center"
          >
            <div className="flex justify-center mb-2">
              <TrendingUp className="h-4 w-4 text-income" />
            </div>
            <p className="text-base font-bold text-income">${stats.totalDebit.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">مدين (Debit)</p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-xl bg-card p-3 shadow-sm border border-border text-center"
          >
            <div className="flex justify-center mb-2">
              <TrendingDown className="h-4 w-4 text-expense" />
            </div>
            <p className="text-base font-bold text-expense">${stats.totalCredit.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">دائن (Credit)</p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl bg-card p-3 shadow-sm border border-border text-center"
          >
            <p className="text-base font-bold mt-2">{stats.transactionCount}</p>
            <p className="text-[11px] text-muted-foreground">عدد العمليات</p>
          </motion.div>
        </div>


        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => handleOpenTransactionForm('debit')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-sm font-bold"
          >
            <Plus className="h-4 w-4 ml-1" />
            مدين (Debit)
          </Button>
          <Button
            onClick={() => handleOpenTransactionForm('credit')}
            className="bg-rose-600 hover:bg-rose-700 text-white h-12 text-sm font-bold"
          >
            <Plus className="h-4 w-4 ml-1" />
            دائن (Credit)
          </Button>
        </div>

        {/* Transaction History */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <UnifiedTransactionLog 
            transactions={contactTransactions}
            title="سجل العمليات المالية"
            showExport={true}
            maxHeight="500px"
            currencies={currencies}
            displayCurrencyCode={displayCurrency}
            onDisplayCurrencyChange={setDisplayCurrency}
            onEditTransaction={openTransactionEditor}
            onDeleteTransaction={deleteTransaction}
          />
        </motion.div>
      </main>

      {/* Bottom Nav */}
      <BottomNav currentPage="accounts" onNavigate={(page) => navigate(`/?page=${page}`)} />

      {/* Transaction Form Dialog */}
      <Dialog open={showTransactionForm} onOpenChange={(open) => {
        setShowTransactionForm(open);
        if (!open) resetTransactionEditor();
      }}>
        <DialogContent className="max-w-sm z-[100]">
          <DialogHeader>
            <DialogTitle className={transactionType === 'debit' ? 'text-emerald-600' : 'text-rose-600'}>
              {editingTransaction
                ? (transactionType === 'debit' ? 'تعديل قيد مدين (Debit)' : 'تعديل قيد دائن (Credit)')
                : (transactionType === 'debit' ? 'إضافة قيد مدين (Debit)' : 'إضافة قيد دائن (Credit)')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* العملة والمبلغ */}
            <div className="flex gap-2">
              {currencies.length > 0 && (
                <div className="w-[100px]">
                  <label className="block text-sm text-muted-foreground mb-1">العملة</label>
                  <Select value={txCurrencyCode} onValueChange={(val) => { setTxCurrencyCode(val); setTxManualExchangeRate(''); }}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[110] bg-popover">
                      {currencies.map(c => (
                        <SelectItem key={c.code} value={c.code} className="text-xs">
                          <span className="flex items-center gap-1">
                            <span>{CURRENCY_FLAGS[c.code] || '💱'}</span>
                            <span className="font-medium">{c.code}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex-1">
                <label className="block text-sm text-muted-foreground mb-1">المبلغ ({selectedCurrency.symbol}) *</label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-bold">
                    {selectedCurrency.symbol}
                  </span>
                  <Input 
                    type="number" 
                    value={txAmount} 
                    onChange={(e) => setTxAmount(e.target.value)} 
                    placeholder="0.00"
                    className="text-lg pr-9"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* معامل الصرف */}
            {txCurrencyCode !== 'USD' && (
              <div className="rounded-lg bg-muted/40 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">معامل الصرف</span>
                  <span className="text-[10px] text-primary">
                    المركزي: {centralizedRate.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={txManualExchangeRate || centralizedRate.toString()}
                    onChange={(e) => setTxManualExchangeRate(e.target.value)}
                    className="h-8 text-xs flex-1"
                    dir="ltr"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {selectedCurrency.symbol} = $1
                  </span>
                </div>
                {usdEquivalent !== null && (
                  <p className="text-xs text-primary font-medium text-center">
                    ≈ ${usdEquivalent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm text-muted-foreground mb-1">التاريخ *</label>
              <Input 
                type="date" 
                value={txDate} 
                onChange={(e) => setTxDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">الوصف *</label>
              <Textarea 
                value={txDescription} 
                onChange={(e) => setTxDescription(e.target.value)}
                placeholder="وصف العملية المالية..."
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">الصندوق (اختياري)</label>
              <Select value={txFundId || 'none'} onValueChange={(val) => setTxFundId(val === 'none' ? '' : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="-- بدون صندوق (قيد فقط) --" />
                </SelectTrigger>
                <SelectContent className="z-[110] bg-popover">
                  <SelectItem value="none">-- بدون صندوق (قيد فقط) --</SelectItem>
                  {fundOptions.map(fund => (
                    <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {txFundId 
                  ? 'سيتم التأثير على رصيد الصندوق والحساب الدفتري معاً' 
                  : 'سيتم تسجيل قيد في الحساب الدفتري فقط دون التأثير على الصناديق'}
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowTransactionForm(false)}>إلغاء</Button>
            <Button 
              onClick={handleAddTransaction}
              disabled={!txAmount || parseFloat(txAmount) <= 0 || !txDescription.trim() || txSubmitting}
              className={transactionType === 'debit' ? 'bg-green-600 hover:bg-green-700' : 'bg-rose-600 hover:bg-rose-700'}
            >
              {txSubmitting ? '...' : (editingTransaction ? 'حفظ التعديلات' : 'إضافة العملية')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الحساب الدفتري "{contact.name}" نهائياً. هذا الإجراء لا يمكن التراجع عنه.
              {contactTransactions.length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  ⚠️ يوجد {contactTransactions.length} عملية مالية مرتبطة بهذا الحساب الدفتري
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

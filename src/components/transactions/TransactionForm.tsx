import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Mic, DollarSign, Calendar, FileText, StickyNote, BookOpen, Coins, Loader2 } from 'lucide-react';
import { Transaction, FundOption, AccountOption, TransactionCategory, TransactionType } from '@/types/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';
import { OCRScanner } from '@/components/smart-entry/OCRScanner';
import { VoiceInput } from '@/components/smart-entry/VoiceInput';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { Currency, CURRENCY_FLAGS } from '@/hooks/useCurrencies';
import { DocumentAttachment } from '@/components/shared/DocumentAttachment';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';

interface TransactionFormProps {
  onSubmit: (transaction: Omit<Transaction, 'id' | 'createdAt'> & { contactId?: string; currencyCode?: string; exchangeRate?: number }) => Promise<any>;
  onClose: () => void;
  fundOptions: FundOption[];
  accountOptions: AccountOption[];
  defaultType?: TransactionType;
  currencies?: Currency[];
  editTransaction?: Transaction | null;
}

export function TransactionForm({ 
  onSubmit, onClose, fundOptions, accountOptions, defaultType = 'in', currencies = [], editTransaction,
}: TransactionFormProps) {
  const { t } = useLanguage();
  const { contacts } = useSupabaseContacts();
  
  const [type, setType] = useState<TransactionType>(defaultType);
  const [category, setCategory] = useState<TransactionCategory>(defaultType === 'in' ? 'client_collection' : 'vendor_payment');
  const [fundId, setFundId] = useState(fundOptions.find(f => f.type === 'cash')?.id || fundOptions[0]?.id || '');
  const [contactId, setContactId] = useState('none');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [showOCR, setShowOCR] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [manualExchangeRate, setManualExchangeRate] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const now = new Date();
    const nextDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const defaultFundId = fundOptions.find(f => f.type === 'cash')?.id || fundOptions[0]?.id || '';

    setType(editTransaction?.type || defaultType);
    setCategory((editTransaction?.category || (defaultType === 'in' ? 'client_collection' : 'vendor_payment')) as TransactionCategory);
    setFundId(editTransaction?.fundId || defaultFundId);
    setContactId(editTransaction?.contactId || 'none');
    setAmount(editTransaction?.amount?.toString() || '');
    setDate(editTransaction?.date ? editTransaction.date.split('T')[0] : nextDate);
    setDescription(editTransaction?.description || '');
    setAttachments(editTransaction?.attachment ? [editTransaction.attachment] : []);
    setNotes(editTransaction?.notes || '');
    setCurrencyCode(editTransaction?.currencyCode || 'USD');
    setManualExchangeRate(
      editTransaction?.currencyCode && editTransaction.currencyCode !== 'USD' && editTransaction.exchangeRate
        ? String(editTransaction.exchangeRate)
        : '',
    );
    setSubmitting(false);
    submittingRef.current = false;
  }, [editTransaction, defaultType, fundOptions]);

  const activeContacts = contacts.filter(c => c.status === 'active');

  const centralizedRate = useMemo(() => {
    if (currencyCode === 'USD') return 1;
    const currency = currencies.find(c => c.code === currencyCode);
    return currency?.exchangeRate || 1;
  }, [currencyCode, currencies]);

  const effectiveRate = useMemo(() => {
    if (manualExchangeRate) {
      const parsed = parseFloat(manualExchangeRate);
      return parsed > 0 ? parsed : centralizedRate;
    }
    return centralizedRate;
  }, [manualExchangeRate, centralizedRate]);

  const usdEquivalent = useMemo(() => {
    const amt = parseFloat(amount);
    if (!amt || currencyCode === 'USD') return null;
    return amt / effectiveRate;
  }, [amount, currencyCode, effectiveRate]);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setCategory(newType === 'in' ? 'client_collection' : 'vendor_payment');
  };

  const handleSubmit = async () => {
    if (!amount || !description || !fundId || submittingRef.current) return;

    const parsedAmount = parseFloat(amount);
    const finalAmount = currencyCode === 'USD' ? parsedAmount : parsedAmount / effectiveRate;

    // ✅ منع الصرف من صندوق رصيده غير كاف (للعمليات اليدوية)
    if (type === 'out') {
      const selectedFund = fundOptions.find(f => f.id === fundId);
      if (selectedFund) {
        // عند التعديل: نسمح بنفس قيمة العملية الأصلية لأنها مخصومة مسبقاً
        const originalAmount = editTransaction && editTransaction.type === 'out' && editTransaction.fundId === fundId
          ? editTransaction.amount
          : 0;
        const effectiveBalance = selectedFund.balance + originalAmount;
        if (finalAmount > effectiveBalance + 0.0001) {
          toast.error(
            `${t('tx.insufficientBalance')} (${selectedFund.name}: $${effectiveBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })})`
          );
          return;
        }
      }
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        type, category,
        amount: Number(finalAmount.toFixed(4)),
        description, date, fundId,
        contactId: contactId !== 'none' ? contactId : undefined,
        attachment: attachments.length > 0 ? attachments[0] : undefined,
        notes: notes || undefined,
        currencyCode, exchangeRate: effectiveRate,
      });

      confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 }, colors: type === 'in' ? ['#22c55e', '#10b981'] : ['#ef4444', '#f97316'] });
      onClose();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleOCRResult = (data: { amount?: number; date?: string; merchant?: string }) => {
    if (data.amount) setAmount(data.amount.toString());
    if (data.date) setDate(data.date);
    if (data.merchant) setDescription(data.merchant);
    setShowOCR(false);
  };

  const handleVoiceResult = (data: { amount?: number; category?: string; description?: string }) => {
    if (data.amount) setAmount(data.amount.toString());
    if (data.description) setDescription(data.description);
    setShowVoice(false);
  };

  const selectedCurrency = currencies.find(c => c.code === currencyCode);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-3 border-b border-border sticky top-0 bg-card z-10">
          <h3 className="text-sm font-bold">{editTransaction ? t('tx.edit') : t('tx.new')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-3 space-y-3">
          <div className="flex rounded-lg bg-muted p-0.5">
            <button onClick={() => handleTypeChange('in')}
              className={cn("flex-1 py-2 rounded-md text-xs font-medium transition-all",
                type === 'in' ? "bg-gradient-income text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {t('tx.debit')}
            </button>
            <button onClick={() => handleTypeChange('out')}
              className={cn("flex-1 py-2 rounded-md text-xs font-medium transition-all",
                type === 'out' ? "bg-gradient-expense text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {t('tx.credit')}
            </button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowOCR(true)} className="flex-1 gap-1.5 h-8 text-[10px]">
              <Camera className="h-3.5 w-3.5" />{t('tx.scanDoc')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowVoice(true)} className="flex-1 gap-1.5 h-8 text-[10px]">
              <Mic className="h-3.5 w-3.5" />{t('tx.voiceInput')}
            </Button>
          </div>

          <div>
            <label className="block text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
              <BookOpen className="h-3 w-3" />{t('tx.ledgerAccount')}
            </label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('tx.selectLedger')} /></SelectTrigger>
              <SelectContent className="bg-popover z-[110] max-h-[200px]">
                <SelectItem value="none" className="text-xs">{t('tx.noLedger')}</SelectItem>
                {activeContacts.map(contact => (
                  <SelectItem key={contact.id} value={contact.id} className="text-xs">
                    {contact.name} {contact.balance !== 0 && (
                      <span className={cn("mr-1", contact.balance > 0 ? "text-income" : "text-expense")}>
                        (${Math.abs(contact.balance).toLocaleString('en-US')})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">
              {type === 'in' ? t('tx.fundReceiver') : t('tx.fundSource')}
            </label>
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('tx.selectFund')} /></SelectTrigger>
              <SelectContent className="bg-popover z-[110]">
                {fundOptions.map(fund => (
                  <SelectItem key={fund.id} value={fund.id} className="text-xs">
                    {fund.name} (${fund.balance.toLocaleString('en-US')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2">
              {currencies.length > 0 && (
                <div className="w-[90px]">
                  <label className="block text-[10px] text-muted-foreground mb-1">
                    <Coins className="h-3 w-3 inline ml-0.5" />{t('tx.currency')}
                  </label>
                  <Select value={currencyCode} onValueChange={(val) => { setCurrencyCode(val); setManualExchangeRate(''); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover z-[110]">
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
                <label className="block text-[10px] text-muted-foreground mb-1">
                  {t('tx.amount')} ({selectedCurrency?.symbol || '$'})
                </label>
                <div className="relative">
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">
                    {selectedCurrency?.symbol || '$'}
                  </span>
                  <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-8 text-xs pr-7" dir="ltr" />
                </div>
              </div>

              <div className="w-[110px]">
                <label className="block text-[10px] text-muted-foreground mb-1">{t('tx.date')}</label>
                <div className="relative">
                  <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-[10px] pr-7" />
                </div>
              </div>
            </div>

            {currencyCode !== 'USD' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="rounded-lg bg-muted/40 p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{t('tx.exchangeRate')}</span>
                  <span className="text-[9px] text-primary">
                    {t('tx.centralRate')}: {centralizedRate.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="number" step="0.01" value={manualExchangeRate || centralizedRate.toString()}
                    onChange={(e) => setManualExchangeRate(e.target.value)} className="h-7 text-xs flex-1" dir="ltr" />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{selectedCurrency?.symbol} = $1</span>
                </div>
                {usdEquivalent !== null && (
                  <p className="text-[10px] text-primary font-medium text-center">
                    ≈ ${usdEquivalent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </p>
                )}
              </motion.div>
            )}
          </div>

          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">{t('tx.descriptionRequired')}</label>
            <div className="relative">
              <FileText className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('tx.descriptionPlaceholder')} className="h-8 text-xs pr-7" />
            </div>
          </div>

          <DocumentAttachment attachments={attachments} onAttachmentsChange={setAttachments} maxFiles={3} />

          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">{t('tx.notesOptional')}</label>
            <div className="relative">
              <StickyNote className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('tx.notesPlaceholder')} rows={2} className="text-xs pr-7 min-h-[50px] resize-none" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 h-9 text-xs">{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={!amount || !description || !fundId || submitting}
              className={cn("flex-1 h-9 text-xs gap-1", type === 'in' ? "bg-gradient-income" : "bg-gradient-expense", submitting && "pointer-events-none opacity-90")}>
              {submitting ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('common.saving') || 'جاري الحفظ...'}</>) : t('tx.save')}
            </Button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showOCR && <OCRScanner onScanComplete={handleOCRResult} onClose={() => setShowOCR(false)} />}
        {showVoice && <VoiceInput onResult={handleVoiceResult} onClose={() => setShowVoice(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Mic, DollarSign, Calendar, FileText, StickyNote, BookOpen, Coins, Plus } from 'lucide-react';
import { Transaction, FundOption, AccountOption, TransactionCategory, TransactionType } from '@/types/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';
import { OCRScanner } from '@/components/smart-entry/OCRScanner';
import { VoiceInput } from '@/components/smart-entry/VoiceInput';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { Currency, CURRENCY_FLAGS } from '@/hooks/useCurrencies';
import { DocumentAttachment } from '@/components/shared/DocumentAttachment';
import { useLanguage } from '@/i18n/LanguageContext';

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
  
  const [type, setType] = useState<TransactionType>(editTransaction?.type || defaultType);
  const [category, setCategory] = useState<TransactionCategory>(editTransaction?.category || (defaultType === 'in' ? 'client_collection' : 'vendor_payment'));
  const [fundId, setFundId] = useState(editTransaction?.fundId || fundOptions.find(f => f.type === 'cash')?.id || fundOptions[0]?.id || '');
  const [contactId, setContactId] = useState(editTransaction?.contactId || 'none');
  const [amount, setAmount] = useState(editTransaction?.amount?.toString() || '');
  const [date, setDate] = useState(() => {
    if (editTransaction?.date) return editTransaction.date.split('T')[0];
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [description, setDescription] = useState(editTransaction?.description || '');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [notes, setNotes] = useState(editTransaction?.notes || '');
  const [showOCR, setShowOCR] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [manualExchangeRate, setManualExchangeRate] = useState<string>('');

  // Bulk entry state
  const [isBulkEntry, setIsBulkEntry] = useState(false);
  const [items, setItems] = useState<Array<{ id: string; description: string; amount: string; contactId: string }>>([]);

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

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: '', amount: '', contactId: 'none' }]);
  };

  const removeItem = (id: string) => {
    const newItems = items.filter(item => item.id !== id);
    setItems(newItems);
    updateTotalFromItems(newItems);
  };

  const updateItem = (id: string, field: string, value: string) => {
    const newItems = items.map(item => item.id === id ? { ...item, [field]: value } : item);
    setItems(newItems);
    if (field === 'amount') {
      updateTotalFromItems(newItems);
    }
  };

  const updateTotalFromItems = (currentItems: typeof items) => {
    const total = currentItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    setAmount(total > 0 ? total.toString() : '');
  };

  const handleSubmit = async () => {
    if (!amount || !description || !fundId) return;
    const parsedAmount = parseFloat(amount);
    const finalAmount = currencyCode === 'USD' ? parsedAmount : parsedAmount / effectiveRate;

    // Build items payload if bulk entry
    const itemsPayload = isBulkEntry ? items.map(item => ({
      description: item.description,
      amount: currencyCode === 'USD' ? parseFloat(item.amount) : parseFloat(item.amount) / effectiveRate,
      contact_id: item.contactId !== 'none' ? item.contactId : null
    })) : [];

    // Use RPC for bulk entry if items exist
    if (isBulkEntry && itemsPayload.length > 0) {
      const { data, error } = await supabase.rpc('create_bulk_transaction', {
        p_type: type,
        p_category: category,
        p_amount: Number(finalAmount.toFixed(4)),
        p_description: description,
        p_date: date,
        p_fund_id: fundId,
        p_items: itemsPayload,
        p_contact_id: contactId !== 'none' ? contactId : null,
        p_notes: notes || null,
        p_currency_code: currencyCode,
        p_exchange_rate: effectiveRate
      });
      if (error) {
        console.error('Bulk entry error:', error);
        return;
      }
    } else {
      await onSubmit({
        type, category,
        amount: Number(finalAmount.toFixed(4)),
        description, date, fundId,
        contactId: contactId !== 'none' ? contactId : undefined,
        attachment: attachments.length > 0 ? attachments[0] : undefined,
        notes: notes || undefined,
        currencyCode, exchangeRate: effectiveRate,
      });
    }

    confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 }, colors: type === 'in' ? ['#22c55e', '#10b981'] : ['#ef4444', '#f97316'] });
    onClose();
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

          <div className="flex items-center justify-between bg-muted/30 p-2 rounded-lg border border-dashed border-border">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold">عملية مجمعة (Bulk Entry)</span>
              <span className="text-[9px] text-muted-foreground">إضافة بنود تفصيلية لعملية واحدة</span>
            </div>
            <button
              onClick={() => {
                setIsBulkEntry(!isBulkEntry);
                if (!isBulkEntry && items.length === 0) addItem();
              }}
              className={cn(
                "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                isBulkEntry ? "bg-primary" : "bg-muted"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                isBulkEntry ? "translate-x-4" : "translate-x-0"
              )} />
            </button>
          </div>

          <AnimatePresence>
            {isBulkEntry && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-2 overflow-hidden">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-medium text-muted-foreground">بنود العملية</span>
                  <Button variant="ghost" size="sm" onClick={addItem} className="h-6 text-[9px] gap-1 text-primary">
                    <Plus className="h-3 w-3" /> إضافة بند
                  </Button>
                </div>
                {items.map((item, idx) => (
                  <div key={item.id} className="p-2 rounded-lg bg-muted/40 border border-border space-y-2 relative group">
                    <div className="flex gap-2">
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        placeholder="وصف البند (مثلاً: اسم الموظف)"
                        className="h-7 text-[10px] flex-1"
                      />
                      <Input
                        type="number"
                        value={item.amount}
                        onChange={(e) => updateItem(item.id, 'amount', e.target.value)}
                        placeholder="المبلغ"
                        className="h-7 text-[10px] w-20"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <Select value={item.contactId} onValueChange={(val) => updateItem(item.id, 'contactId', val)}>
                      <SelectTrigger className="h-7 text-[9px]"><SelectValue placeholder="الحساب المتأثر" /></SelectTrigger>
                      <SelectContent className="bg-popover z-[120]">
                        <SelectItem value="none" className="text-[9px]">بدون حساب</SelectItem>
                        {activeContacts.map(c => (
                          <SelectItem key={c.id} value={c.id} className="text-[9px]">{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

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
            <Button onClick={handleSubmit} disabled={!amount || !description || !fundId}
              className={cn("flex-1 h-9 text-xs", type === 'in' ? "bg-gradient-income" : "bg-gradient-expense")}>
              {t('tx.save')}
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

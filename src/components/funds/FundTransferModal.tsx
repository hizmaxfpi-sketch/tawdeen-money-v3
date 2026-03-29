import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ArrowLeftRight, DollarSign, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Fund } from '@/types/finance';
import { Currency } from '@/hooks/useCurrencies';
import { cn } from '@/lib/utils';

interface FundTransferModalProps {
  funds: Fund[];
  currencies?: Currency[];
  onTransfer: (fromFundId: string, toFundId: string, amount: number, note?: string, currencyCode?: string) => Promise<any>;
  onClose: () => void;
}

export function FundTransferModal({ funds, currencies = [], onTransfer, onClose }: FundTransferModalProps) {
  const [fromFundId, setFromFundId] = useState('');
  const [toFundId, setToFundId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('USD');

  const fromFund = funds.find(f => f.id === fromFundId);
  const selectedCurrencyData = currencies.find(c => c.code === selectedCurrency);
  const currencySymbol = selectedCurrencyData?.symbol || '$';
  
  const isValidTransfer = fromFundId && toFundId && fromFundId !== toFundId && 
    parseFloat(amount) > 0 && (fromFund ? parseFloat(amount) <= fromFund.balance : false);

  const handleSubmit = async () => {
    if (!isValidTransfer) return;
    await onTransfer(fromFundId, toFundId, parseFloat(amount), note || undefined, selectedCurrency);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-card rounded-xl shadow-xl"
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            تحويل بين الصناديق
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* العملة */}
          {currencies.length > 0 && (
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">العملة</label>
              <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="اختر العملة" />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {currencies.map(currency => (
                    <SelectItem key={currency.id} value={currency.code} className="text-xs">
                      <span className="flex items-center gap-2">
                        <span className="font-bold">{currency.symbol}</span>
                        <span>{currency.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* من صندوق */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">من صندوق *</label>
            <Select value={fromFundId} onValueChange={setFromFundId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="اختر الصندوق المصدر" />
              </SelectTrigger>
              <SelectContent className="z-[110]">
                {funds.map(fund => (
                  <SelectItem key={fund.id} value={fund.id} className="text-xs">
                    {fund.name} ({currencySymbol}{fund.balance.toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* إلى صندوق */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">إلى صندوق *</label>
            <Select value={toFundId} onValueChange={setToFundId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="اختر الصندوق المستقبل" />
              </SelectTrigger>
              <SelectContent className="z-[110]">
                {funds.filter(f => f.id !== fromFundId).map(fund => (
                  <SelectItem key={fund.id} value={fund.id} className="text-xs">
                    {fund.name} ({currencySymbol}{fund.balance.toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* المبلغ */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">المبلغ ({currencySymbol}) *</label>
            <div className="relative">
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] font-bold text-muted-foreground">{currencySymbol}</span>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9 text-sm pr-7"
                dir="ltr"
              />
            </div>
            {fromFund && parseFloat(amount) > fromFund.balance && (
              <p className="text-[10px] text-destructive mt-1">المبلغ أكبر من الرصيد المتاح</p>
            )}
          </div>

          {/* ملاحظة */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">ملاحظة (اختياري)</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="سبب التحويل..."
              className="h-9 text-xs"
            />
          </div>

          {/* معاينة */}
          {isValidTransfer && (
            <div className="bg-muted/50 p-3 rounded-lg text-[11px] space-y-1">
              <p className="text-muted-foreground">سيتم تسجيل ({selectedCurrencyData?.name || 'دولار أمريكي'}):</p>
              <p className="text-destructive">• دائن من {fromFund?.name}: {currencySymbol}{parseFloat(amount).toLocaleString()}</p>
              <p className="text-income">• مدين إلى {funds.find(f => f.id === toFundId)?.name}: {currencySymbol}{parseFloat(amount).toLocaleString()}</p>
            </div>
          )}

          {/* أزرار */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 h-9 text-xs">
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!isValidTransfer}
              className="flex-1 h-9 text-xs"
            >
              تنفيذ التحويل
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

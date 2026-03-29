import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Edit3, X, Check, RefreshCw } from 'lucide-react';
import { Currency, CURRENCY_FLAGS } from '@/hooks/useCurrencies';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MarketRatesWidgetProps {
  currencies: Currency[];
  onUpdateRate: (currencyId: string, rate: number) => void;
}

const QuickEditModal = memo(({ 
  currencies, 
  onUpdateRate, 
  onClose 
}: { 
  currencies: Currency[]; 
  onUpdateRate: (id: string, rate: number) => void; 
  onClose: () => void;
}) => {
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    currencies.filter(c => c.code !== 'USD').forEach(c => {
      initial[c.id] = c.exchangeRate.toString();
    });
    return initial;
  });

  const handleSaveAll = () => {
    Object.entries(rates).forEach(([id, val]) => {
      const rate = parseFloat(val);
      if (rate > 0) {
        const currency = currencies.find(c => c.id === id);
        if (currency && rate !== currency.exchangeRate) {
          onUpdateRate(id, rate);
        }
      }
    });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
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
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold">تحديث أسعار الصرف</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3 space-y-2.5">
          {currencies.filter(c => c.code !== 'USD').map(currency => {
            const flag = CURRENCY_FLAGS[currency.code] || '💱';
            return (
              <div key={currency.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <span className="text-lg">{flag}</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold">{currency.code}</p>
                  <p className="text-[10px] text-muted-foreground">{currency.name}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    value={rates[currency.id] || ''}
                    onChange={(e) => setRates(prev => ({ ...prev, [currency.id]: e.target.value }))}
                    className="h-7 w-24 text-xs text-center"
                    dir="ltr"
                  />
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap">= $1</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 p-3 pt-0">
          <button
            onClick={onClose}
            className="flex-1 h-8 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSaveAll}
            className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
          >
            <Check className="h-3 w-3" />
            حفظ الجميع
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
});

QuickEditModal.displayName = 'QuickEditModal';

export const MarketRatesWidget = memo(({ currencies, onUpdateRate }: MarketRatesWidgetProps) => {
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const nonUsdCurrencies = currencies.filter(c => c.code !== 'USD');

  if (nonUsdCurrencies.length === 0) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl bg-card p-3 shadow-sm border border-border"
      >
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-xs font-bold">أسعار الصرف اليوم</h3>
          </div>
          <button
            onClick={() => setShowQuickEdit(true)}
            className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors font-medium"
          >
            <Edit3 className="h-3 w-3" />
            تعديل سريع
          </button>
        </div>

        {/* Horizontal Scroll Rates */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
          {nonUsdCurrencies.map((currency, index) => {
            const flag = CURRENCY_FLAGS[currency.code] || '💱';
            return (
              <motion.div
                key={currency.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border",
                  "bg-muted/30 border-border/50 hover:border-primary/20 transition-colors"
                )}
              >
                <span className="text-base">{flag}</span>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground leading-none">$1 =</span>
                  <span className="text-xs font-bold leading-tight" dir="ltr">
                    {currency.exchangeRate.toLocaleString('en-US', { maximumFractionDigits: 2 })} {currency.symbol}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <AnimatePresence>
        {showQuickEdit && (
          <QuickEditModal
            currencies={currencies}
            onUpdateRate={onUpdateRate}
            onClose={() => setShowQuickEdit(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
});

MarketRatesWidget.displayName = 'MarketRatesWidget';

import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Plus, X, Trash2, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Currency, WORLD_CURRENCIES, CURRENCY_FLAGS } from '@/hooks/useCurrencies';
import { cn } from '@/lib/utils';

interface CurrencyManagerProps {
  currencies: Currency[];
  onAddCurrency?: (currencyCode: string) => void;
  onDeleteCurrency?: (currencyId: string) => void;
  onUpdateRate?: (currencyId: string, rate: number) => void;
}

const CurrencyCard = memo(({ 
  currency, 
  onDelete, 
  onUpdateRate 
}: { 
  currency: Currency; 
  onDelete?: (id: string) => void; 
  onUpdateRate?: (id: string, rate: number) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempRate, setTempRate] = useState(currency.exchangeRate.toString());
  const isUSD = currency.code === 'USD';
  const flag = CURRENCY_FLAGS[currency.code] || '💱';

  const handleSave = () => {
    const rate = parseFloat(tempRate);
    if (rate > 0 && onUpdateRate) {
      onUpdateRate(currency.id, rate);
    }
    setIsEditing(false);
  };

  return (
    <div className={cn(
      "rounded-xl p-3 border transition-all",
      isUSD 
        ? "bg-primary/5 border-primary/20" 
        : "bg-card border-border hover:border-primary/20"
    )}>
      <div className="flex items-center gap-2.5">
        {/* Flag & Code */}
        <div className="flex flex-col items-center min-w-[40px]">
          <span className="text-xl leading-none">{flag}</span>
          <span className="text-[10px] font-bold mt-0.5 text-foreground">{currency.code}</span>
        </div>

        {/* Rate Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{currency.name}</p>
          {isUSD ? (
            <p className="text-[10px] text-primary font-medium mt-0.5">العملة الأساسية</p>
          ) : isEditing && onUpdateRate ? (
            <div className="flex items-center gap-1 mt-1">
              <Input
                type="number"
                step="0.01"
                value={tempRate}
                onChange={(e) => setTempRate(e.target.value)}
                className="h-6 w-20 text-[11px] px-1.5"
                dir="ltr"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <span className="text-[9px] text-muted-foreground whitespace-nowrap">= $1</span>
              <button onClick={handleSave} className="p-0.5 text-primary hover:bg-primary/10 rounded">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setIsEditing(false)} className="p-0.5 text-muted-foreground hover:bg-muted rounded">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              disabled={!onUpdateRate}
              onClick={() => { setTempRate(currency.exchangeRate.toString()); setIsEditing(true); }}
              className={cn("flex items-center gap-1 mt-0.5 group", !onUpdateRate && "cursor-default")}
            >
              <span className="text-sm font-bold text-foreground">
                {currency.exchangeRate.toLocaleString('en-US', { maximumFractionDigits: 4 })}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {currency.symbol} = $1
              </span>
              {onUpdateRate && <RefreshCw className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
            </button>
          )}
        </div>

        {/* Delete */}
        {!isUSD && !isEditing && onDelete && (
          <button
            onClick={() => onDelete(currency.id)}
            className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});

CurrencyCard.displayName = 'CurrencyCard';

export function CurrencyManager({ currencies, onAddCurrency, onDeleteCurrency, onUpdateRate }: CurrencyManagerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState('');

  const availableCurrencies = WORLD_CURRENCIES.filter(
    wc => !currencies.find(c => c.code === wc.code)
  );

  const handleAdd = () => {
    if (!selectedCurrencyCode || !onAddCurrency) return;
    onAddCurrency(selectedCurrencyCode);
    setSelectedCurrencyCode('');
    setShowAddForm(false);
  };

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-savings">
            <Coins className="h-4 w-4 text-white" />
          </div>
          <div className="text-right">
            <p className="text-[13px] font-semibold">إدارة العملات</p>
            <p className="text-[11px] text-muted-foreground">{currencies.length} عملات • أسعار الصرف</p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-0 space-y-2">
              {/* Currency Grid */}
              <div className="grid grid-cols-1 gap-2">
                {currencies.map((currency) => (
                  <CurrencyCard
                    key={currency.id}
                    currency={currency}
                    onDelete={onDeleteCurrency}
                    onUpdateRate={onUpdateRate}
                  />
                ))}
              </div>

              {/* Add Button */}
              {!showAddForm && availableCurrencies.length > 0 && onAddCurrency && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddForm(true)}
                  className="w-full h-8 text-[11px] gap-1.5"
                >
                  <Plus className="h-3 w-3" />
                  إضافة عملة جديدة
                </Button>
              )}

              {/* Add Form */}
              <AnimatePresence>
                {showAddForm && onAddCurrency && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-semibold">اختر عملة من القائمة</p>
                      <button onClick={() => setShowAddForm(false)} className="p-1 hover:bg-muted rounded">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    
                    <Select value={selectedCurrencyCode} onValueChange={setSelectedCurrencyCode}>
                      <SelectTrigger className="h-9 text-[12px]">
                        <SelectValue placeholder="اختر العملة..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 z-[120] bg-popover">
                        {availableCurrencies.map(currency => (
                          <SelectItem key={currency.code} value={currency.code} className="text-[12px]">
                            <span className="flex items-center gap-2">
                              <span>{CURRENCY_FLAGS[currency.code] || '💱'}</span>
                              <span className="font-bold w-5">{currency.symbol}</span>
                              <span className="font-medium">{currency.code}</span>
                              <span className="text-muted-foreground">- {currency.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setShowAddForm(false); setSelectedCurrencyCode(''); }}
                        className="flex-1 h-8 text-[11px]"
                      >
                        إلغاء
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAdd}
                        disabled={!selectedCurrencyCode}
                        className="flex-1 h-8 text-[11px]"
                      >
                        إضافة
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

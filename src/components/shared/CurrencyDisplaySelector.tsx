import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Currency, CURRENCY_FLAGS } from '@/hooks/useCurrencies';
import { Globe } from 'lucide-react';

interface CurrencyDisplaySelectorProps {
  currencies: Currency[];
  selectedCode: string;
  onChange: (code: string) => void;
}

export function CurrencyDisplaySelector({ currencies, selectedCode, onChange }: CurrencyDisplaySelectorProps) {
  const options = useMemo(() => {
    const list = [{ code: 'USD', label: 'دولار أمريكي (أساسي)', flag: '🇺🇸' }];
    currencies.forEach(c => {
      if (c.code !== 'USD') {
        list.push({ code: c.code, label: c.name, flag: CURRENCY_FLAGS[c.code] || '💱' });
      }
    });
    return list;
  }, [currencies]);

  if (options.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Select value={selectedCode} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs min-w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[110] bg-popover">
          {options.map(o => (
            <SelectItem key={o.code} value={o.code} className="text-xs">
              <span className="flex items-center gap-1.5">
                <span>{o.flag}</span>
                <span>{o.code}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Helper: convert amount from USD to target currency
export function convertForDisplay(amountUSD: number, targetCode: string, currencies: Currency[]): number {
  if (targetCode === 'USD') return amountUSD;
  const currency = currencies.find(c => c.code === targetCode);
  return currency ? amountUSD * currency.exchangeRate : amountUSD;
}

// Helper: get currency symbol
export function getCurrencySymbol(code: string, currencies: Currency[]): string {
  if (code === 'USD') return '$';
  const currency = currencies.find(c => c.code === code);
  return currency?.symbol || '$';
}

// Format amount with currency symbol
export function formatWithCurrency(amount: number, code: string, currencies: Currency[]): string {
  const symbol = getCurrencySymbol(code, currencies);
  return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Get original amount from a transaction (before USD conversion)
export function getOriginalAmount(tx: { amount: number; currencyCode?: string; exchangeRate?: number }): { amount: number; code: string; rate: number } {
  const code = tx.currencyCode || 'USD';
  const rate = tx.exchangeRate || 1;
  if (code === 'USD' || rate === 1) return { amount: tx.amount, code: 'USD', rate: 1 };
  return { amount: tx.amount * rate, code, rate };
}

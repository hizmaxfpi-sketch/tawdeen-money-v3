import { motion } from 'framer-motion';
import { Wallet, TrendingUp, TrendingDown, ArrowDownRight } from 'lucide-react';
import { FinanceStats, Transaction } from '@/types/finance';
import { Currency } from '@/hooks/useCurrencies';
import { cn } from '@/lib/utils';
import { convertForDisplay, getCurrencySymbol } from '@/components/shared/CurrencyDisplaySelector';
import { useLanguage } from '@/i18n/LanguageContext';

interface SummaryCardsProps {
  stats: FinanceStats;
  transactions?: Transaction[];
  fundTransactions?: Transaction[];
  displayCurrency?: string;
  currencies?: Currency[];
}

export function SummaryCards({ stats, fundTransactions, displayCurrency = 'USD', currencies = [] }: SummaryCardsProps) {
  const { t } = useLanguage();
  const cashTxs = fundTransactions || [];
  const totalIncome = cashTxs.reduce((sum, tx) => tx.type === 'in' ? sum + tx.amount : sum, 0);
  const totalExpenses = cashTxs.reduce((sum, tx) => tx.type === 'out' ? sum + tx.amount : sum, 0);

  const conv = (v: number) => convertForDisplay(v, displayCurrency, currencies);
  const sym = getCurrencySymbol(displayCurrency, currencies);

  const cards = [
    { key: 'income', label: t('dashboard.totalIncome'), icon: TrendingUp, gradient: 'bg-gradient-income' },
    { key: 'expenses', label: t('dashboard.totalExpenses'), icon: TrendingDown, gradient: 'bg-gradient-expense' },
    { key: 'liquidity', label: t('dashboard.liquidity'), icon: Wallet, gradient: 'bg-gradient-primary' },
  ];

  const values: Record<string, { amount: number; change?: number }> = {
    income: { amount: conv(totalIncome) },
    expenses: { amount: conv(totalExpenses) },
    liquidity: { amount: conv(stats.totalLiquidity), change: stats.liquidityChange },
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((card, index) => {
        const { amount, change } = values[card.key];
        const Icon = card.icon;
        
        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="rounded-xl bg-card p-2.5 shadow-sm border border-border"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${card.gradient}`}>
                <Icon className="h-3 w-3 text-white" />
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight">{card.label}</span>
            </div>
            
            <p className={cn(
              "text-base font-bold",
              card.key === 'income' && 'text-income',
              card.key === 'expenses' && 'text-expense'
            )}>{sym}{amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
            
            {change !== undefined && (
              <div className="flex items-center gap-0.5 mt-1">
                {change >= 0 ? (
                  <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />
                ) : (
                  <ArrowDownRight className="h-2.5 w-2.5 text-rose-500" />
                )}
                <span className={`text-[9px] font-medium ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {change >= 0 ? '+' : ''}{change}%
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

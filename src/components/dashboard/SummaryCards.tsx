import { motion } from 'framer-motion';
import { BookOpen, TrendingUp, TrendingDown, Wallet, ArrowDownLeft, ArrowUpRight, DollarSign, Calculator, Package, ShoppingBag, Boxes } from 'lucide-react';
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
  ledgerDebit?: number;
  ledgerCredit?: number;
  ledgerNet?: number;
  projectProfit?: number;
  containerProfit?: number;
  directRevenue?: number;
  businessExpenses?: number;
  onExpensesClick?: () => void;
  showLedger?: boolean;
  showFunds?: boolean;
  showBusiness?: boolean;
  showProjects?: boolean;
  showShipping?: boolean;
  showProduction?: boolean;
  productionSales?: number;
  productionMaterialsValue?: number;
  productionProductsValue?: number;
}

export function SummaryCards({
  stats,
  displayCurrency = 'USD', currencies = [],
  ledgerDebit = 0, ledgerCredit = 0, ledgerNet = 0,
  projectProfit = 0, containerProfit = 0,
  onExpensesClick,
  showLedger = true, showFunds = true, showBusiness = true,
  showProjects = true, showShipping = true,
  showProduction = false, productionSales = 0, productionMaterialsValue = 0, productionProductsValue = 0,
}: SummaryCardsProps) {
  const { t } = useLanguage();

  const fundRemaining = stats.totalLiquidity;
  const totalIn = stats.totalIncome || 0;
  const totalOut = stats.totalOutcome || 0;
  const totalExpenses = stats.totalExpenses || 0;
  const netProfit = stats.netCompanyProfit || 0;

  const conv = (v: number) => convertForDisplay(v, displayCurrency, currencies);
  const sym = getCurrencySymbol(displayCurrency, currencies);

  const allRows = [
    showLedger && {
      label: t('nav.ledger'),
      cards: [
        { key: 'ledger-debit', label: t('tx.debit'), value: conv(ledgerDebit), icon: TrendingUp, colorClass: 'text-income', gradient: 'bg-gradient-income' },
        { key: 'ledger-credit', label: t('tx.credit'), value: conv(ledgerCredit), icon: TrendingDown, colorClass: 'text-expense', gradient: 'bg-gradient-expense' },
        { key: 'ledger-net', label: t('common.net'), value: conv(ledgerNet), icon: BookOpen, colorClass: 'text-primary', gradient: 'bg-gradient-primary' },
      ],
    },
    showFunds && {
      label: t('funds.title'),
      cards: [
        { key: 'fund-in', label: t('common.in'), value: conv(totalIn), icon: ArrowDownLeft, colorClass: 'text-income', gradient: 'bg-gradient-income' },
        { key: 'fund-out', label: t('common.out'), value: conv(totalOut), icon: ArrowUpRight, colorClass: 'text-expense', gradient: 'bg-gradient-expense' },
        { key: 'fund-remaining', label: t('common.net'), value: conv(fundRemaining), icon: Wallet, colorClass: 'text-primary', gradient: 'bg-gradient-primary' },
      ],
    },
    showBusiness && {
      label: t('nav.business'),
      cards: [
        { key: 'biz-revenue', label: t('common.revenue'), value: conv(totalIn), icon: DollarSign, colorClass: 'text-income', gradient: 'bg-gradient-income' },
        { key: 'biz-expenses', label: t('common.expenses'), value: conv(totalExpenses), icon: TrendingDown, colorClass: 'text-expense', gradient: 'bg-gradient-expense', onClick: onExpensesClick },
        { key: 'biz-profit', label: t('dashboard.netProfit'), value: conv(netProfit), icon: Calculator, colorClass: netProfit >= 0 ? 'text-income' : 'text-expense', gradient: 'bg-gradient-primary' },
      ],
    },
    showProduction && {
      label: t('nav.production'),
      cards: [
        { key: 'prod-materials', label: t('common.materials'), value: conv(productionMaterialsValue), icon: Boxes, colorClass: 'text-primary', gradient: 'bg-gradient-primary' },
        { key: 'prod-products', label: t('common.products'), value: conv(productionProductsValue), icon: Package, colorClass: 'text-primary', gradient: 'bg-gradient-primary' },
        { key: 'prod-sales', label: t('common.sales'), value: conv(productionSales), icon: ShoppingBag, colorClass: 'text-income', gradient: 'bg-gradient-income' },
      ],
    },
  ];
  const rows = allRows.filter(Boolean) as Array<{ label: string; cards: any[] }>;

  return (
    <div className="space-y-4">
      {rows.map((row, ri) => (
        <div key={row.label}>
          <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">{row.label}</p>
          <div className="grid grid-cols-3 gap-3">
            {row.cards.map((card, ci) => {
              const Icon = card.icon;
              const isClickable = !!(card as any).onClick;
              return (
                <motion.div
                  key={card.key}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (ri * 3 + ci) * 0.04 }}
                  onClick={(card as any).onClick}
                  className={cn(
                    "rounded-xl bg-card p-2.5 shadow-sm border border-border",
                    isClickable && "cursor-pointer hover:border-primary/40 transition-colors"
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${card.gradient}`}>
                      <Icon className="h-3 w-3 text-white" />
                    </div>
                    <span className="text-[10px] text-muted-foreground leading-tight">{card.label}</span>
                  </div>
                  <p className={cn("text-base font-bold", card.colorClass)}>
                    {sym}{card.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

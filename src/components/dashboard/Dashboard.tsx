import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, PieChart } from 'lucide-react';
import { SummaryCards } from './SummaryCards';
import { BalanceTrend } from './BalanceTrend';
import { ExpenseChart } from './ExpenseChart';
import { MarketRatesWidget } from './MarketRatesWidget';
import { UnifiedTransactionLog } from '@/components/shared/UnifiedTransactionLog';
import { Transaction, FinanceStats, TrendData, ChartData } from '@/types/finance';
import { Currency } from '@/hooks/useCurrencies';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';

interface DashboardProps {
  stats: FinanceStats;
  transactions: Transaction[];
  allTransactions?: Transaction[];
  monthlyTrend: TrendData[];
  expenseBreakdown: ChartData[];
  currencies?: Currency[];
  onUpdateRate?: (currencyId: string, rate: number) => void;
  onEditTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction?: (transactionId: string) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  ledgerDebit?: number;
  ledgerCredit?: number;
  ledgerNet?: number;
  projectRevenue?: number;
  shippingRevenue?: number;
  directRevenue?: number;
  assetRevenue?: number;
  businessExpenses?: number;
  onExpensesClick?: () => void;
}

export function Dashboard({
  stats, transactions, allTransactions, monthlyTrend, expenseBreakdown,
  currencies, onUpdateRate, onEditTransaction, onDeleteTransaction,
  hasMore, onLoadMore,
  ledgerDebit = 0, ledgerCredit = 0, ledgerNet = 0,
  projectRevenue = 0, shippingRevenue = 0, directRevenue = 0,
  assetRevenue = 0, businessExpenses = 0, onExpensesClick,
}: DashboardProps) {
  const [chartType, setChartType] = useState<'line' | 'pie'>('line');
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const { t } = useLanguage();

  return (
    <div className="space-y-3 py-3 animate-fade-in">
      <SummaryCards
        stats={stats}
        fundTransactions={transactions}
        displayCurrency={displayCurrency}
        currencies={currencies}
        ledgerDebit={ledgerDebit}
        ledgerCredit={ledgerCredit}
        ledgerNet={ledgerNet}
        projectRevenue={projectRevenue}
        shippingRevenue={shippingRevenue}
        directRevenue={directRevenue}
        assetRevenue={assetRevenue}
        businessExpenses={businessExpenses}
        onExpensesClick={onExpensesClick}
      />

      {currencies && currencies.length > 1 && onUpdateRate && (
        <MarketRatesWidget currencies={currencies} onUpdateRate={onUpdateRate} />
      )}
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl bg-card p-3 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">{t('dashboard.dataAnalysis')}</h3>
          <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
            <button
              onClick={() => setChartType('line')}
              className={cn(
                "p-1.5 rounded-md transition-all",
                chartType === 'line' 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setChartType('pie')}
              className={cn(
                "p-1.5 rounded-md transition-all",
                chartType === 'pie' 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <PieChart className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        
        {chartType === 'line' ? (
          <BalanceTrend data={monthlyTrend} />
        ) : (
          <ExpenseChart data={expenseBreakdown} />
        )}
      </motion.div>

      <UnifiedTransactionLog 
        transactions={transactions} 
        onEditTransaction={onEditTransaction}
        onDeleteTransaction={onDeleteTransaction}
        showDateRange={true}
        showPreviewButton={true}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        currencies={currencies}
        displayCurrencyCode={displayCurrency}
        onDisplayCurrencyChange={setDisplayCurrency}
      />
    </div>
  );
}

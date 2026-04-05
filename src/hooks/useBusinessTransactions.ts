import { useMemo } from 'react';
import { Transaction } from '@/types/finance';

// Categories that represent direct business revenue (not projects/shipping)
const DIRECT_REVENUE_CATEGORIES = ['direct_revenue', 'asset_revenue'];
const BUSINESS_EXPENSE_CATEGORIES = ['expense', 'business_expense', 'asset_depreciation'];

export function useBusinessTransactions(transactions: Transaction[]) {
  return useMemo(() => {
    let directRevenue = 0;
    let businessExpenses = 0;

    for (const tx of transactions) {
      if (DIRECT_REVENUE_CATEGORIES.includes(tx.category)) {
        directRevenue += tx.amount;
      }
      if (BUSINESS_EXPENSE_CATEGORIES.includes(tx.category) && tx.type === 'out' && !tx.projectId) {
        businessExpenses += tx.amount;
      }
    }

    return { directRevenue, businessExpenses };
  }, [transactions]);
}

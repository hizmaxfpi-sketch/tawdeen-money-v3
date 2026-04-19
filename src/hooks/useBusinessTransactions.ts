import { useMemo } from 'react';
import { Transaction } from '@/types/finance';

export const DIRECT_REVENUE_CATEGORIES = ['direct_revenue', 'asset_revenue', 'consulting_revenue', 'service_revenue', 'other_revenue'];
export const BUSINESS_EXPENSE_CATEGORIES = ['expense', 'business_expense', 'asset_depreciation', 'salary', 'rent', 'utilities', 'marketing', 'supplies', 'transport', 'maintenance', 'other_expense', 'asset_improvement'];

// إيرادات/مصاريف قسم الإنتاج تظهر تلقائياً ضمن قسم الأعمال
const PRODUCTION_REVENUE_CATEGORIES = ['production_sale'];
const PRODUCTION_EXPENSE_CATEGORIES = ['business_expense']; // مصاريف البيع المباشرة

export const REVENUE_CATEGORIES = [
  { value: 'direct_revenue', label: 'إيراد مباشر' },
  { value: 'consulting_revenue', label: 'استشارات' },
  { value: 'service_revenue', label: 'خدمات' },
  { value: 'asset_revenue', label: 'إيراد أصول' },
  { value: 'other_revenue', label: 'إيراد آخر' },
];

export const EXPENSE_CATEGORIES = [
  { value: 'salary', label: 'رواتب' },
  { value: 'rent', label: 'إيجار' },
  { value: 'utilities', label: 'مرافق' },
  { value: 'marketing', label: 'تسويق' },
  { value: 'supplies', label: 'مستلزمات' },
  { value: 'transport', label: 'نقل' },
  { value: 'maintenance', label: 'صيانة' },
  { value: 'asset_depreciation', label: 'إهلاك أصول' },
  { value: 'business_expense', label: 'مصروف عام' },
  { value: 'other_expense', label: 'مصروف آخر' },
];

export function useBusinessTransactions(transactions: Transaction[]) {
  return useMemo(() => {
    let directRevenue = 0;
    let businessExpenses = 0;

    for (const tx of transactions) {
      const isManual = !tx.sourceType || tx.sourceType === 'manual';
      const isProductionSource = tx.sourceType === 'production_sale';

      if (tx.projectId) continue;

      const isCustom = tx.category.startsWith('custom_');

      // الحركات اليدوية: قواعد عادية
      if (isManual) {
        if ((DIRECT_REVENUE_CATEGORIES.includes(tx.category) || isCustom) && tx.type === 'in') {
          directRevenue += tx.amount;
        }
        if ((BUSINESS_EXPENSE_CATEGORIES.includes(tx.category) || isCustom) && tx.type === 'out') {
          businessExpenses += tx.amount;
        }
      }

      // قيود الإنتاج: تُحتسب كإيرادات/مصاريف أعمال (مرة واحدة فقط)
      if (isProductionSource) {
        if (PRODUCTION_REVENUE_CATEGORIES.includes(tx.category) && tx.type === 'in') {
          directRevenue += tx.amount;
        }
        if (PRODUCTION_EXPENSE_CATEGORIES.includes(tx.category) && tx.type === 'out') {
          businessExpenses += tx.amount;
        }
      }
    }

    return { directRevenue, businessExpenses };
  }, [transactions]);
}

export function isBusinessTransaction(tx: Transaction): boolean {
  if (tx.projectId) return false;
  const isManual = !tx.sourceType || tx.sourceType === 'manual';
  const isProductionSource = tx.sourceType === 'production_sale';

  if (isManual) {
    if (tx.category.startsWith('custom_')) return true;
    const allBizCategories = [...DIRECT_REVENUE_CATEGORIES, ...BUSINESS_EXPENSE_CATEGORIES];
    return allBizCategories.includes(tx.category);
  }
  if (isProductionSource) {
    return [...PRODUCTION_REVENUE_CATEGORIES, ...PRODUCTION_EXPENSE_CATEGORIES].includes(tx.category);
  }
  return false;
}

import { useMemo } from 'react';
import { Transaction } from '@/types/finance';

export const DIRECT_REVENUE_CATEGORIES = ['direct_revenue', 'asset_revenue', 'consulting_revenue', 'service_revenue', 'other_revenue'];
export const BUSINESS_EXPENSE_CATEGORIES = ['expense', 'business_expense', 'asset_depreciation', 'salary', 'rent', 'utilities', 'marketing', 'supplies', 'transport', 'maintenance', 'other_expense', 'asset_improvement'];

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

interface Options {
  /** إيرادات إضافية مُحتسبة من خارج جدول transactions (مثل إجمالي مبيعات الإنتاج) */
  extraRevenue?: number;
  /** مصاريف إضافية (مثل تكلفة المواد الخام المستهلكة في مبيعات الإنتاج) */
  extraExpenses?: number;
}

export function useBusinessTransactions(transactions: Transaction[], options: Options = {}) {
  const { extraRevenue = 0, extraExpenses = 0 } = options;
  return useMemo(() => {
    let directRevenue = 0;
    let businessExpenses = 0;

    for (const tx of transactions) {
      const isManual = !tx.sourceType || tx.sourceType === 'manual';
      // نتجاهل قيود الإنتاج هنا — تأتي عبر extraRevenue/extraExpenses من useProduction
      // لتجنب العد المزدوج (الإيراد كاملاً + التكلفة كاملةً بدلاً من صافي الربح)
      if (tx.sourceType === 'production_sale') continue;

      if (tx.projectId) continue;

      const isCustom = tx.category.startsWith('custom_');

      if (isManual) {
        if ((DIRECT_REVENUE_CATEGORIES.includes(tx.category) || isCustom) && tx.type === 'in') {
          directRevenue += tx.amount;
        }
        if ((BUSINESS_EXPENSE_CATEGORIES.includes(tx.category) || isCustom) && tx.type === 'out') {
          businessExpenses += tx.amount;
        }
      }
    }

    return {
      directRevenue: directRevenue + extraRevenue,
      businessExpenses: businessExpenses + extraExpenses,
    };
  }, [transactions, extraRevenue, extraExpenses]);
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
    return ['production_sale', 'business_expense'].includes(tx.category);
  }
  return false;
}

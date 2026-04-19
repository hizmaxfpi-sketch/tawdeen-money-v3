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

    // أنواع المصادر الآلية الخاصة بالإنتاج — نستبعدها كاملاً من حسابات الأعمال اليدوية
    // ونعتمد على extraRevenue/extraExpenses القادمة من useProduction (مبيعات + تكلفة + مصاريف)
    // ملاحظة: production_cogs نستبعده هنا أيضاً لأن extraExpenses يحوي totalCost أصلاً
    const PRODUCTION_SOURCES = new Set([
      'production_sale', 'production_sale_payment',
      'production_purchase', 'production_purchase_payment',
      'production_cogs', 'production_sale_expense',
    ]);

    for (const tx of transactions) {
      const isManual = !tx.sourceType || tx.sourceType === 'manual';
      if (tx.sourceType && PRODUCTION_SOURCES.has(tx.sourceType)) continue;

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
  // استبعاد كافة قيود الإنتاج من سجل عمليات الأعمال (المبيعات/المشتريات/السداد)
  const PRODUCTION_SOURCES = new Set([
    'production_sale', 'production_sale_payment',
    'production_purchase', 'production_purchase_payment',
    'production_cogs', 'production_sale_expense',
  ]);
  if (tx.sourceType && PRODUCTION_SOURCES.has(tx.sourceType)) return false;

  const isManual = !tx.sourceType || tx.sourceType === 'manual';
  if (isManual) {
    if (tx.category.startsWith('custom_')) return true;
    const allBizCategories = [...DIRECT_REVENUE_CATEGORIES, ...BUSINESS_EXPENSE_CATEGORIES];
    return allBizCategories.includes(tx.category);
  }
  return false;
}

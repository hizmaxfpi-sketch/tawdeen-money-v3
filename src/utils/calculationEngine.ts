// ============= محرك الحسابات الموحد =============
// Centralized Calculation Engine - كافة المعادلات المحاسبية في مكان واحد

import { Transaction, TrendData, ChartData } from '@/types/finance';

// ============= 1. حساب الأرباح (يستثني التحويلات) =============
export function calculateNetProfit(transactions: Transaction[]): number {
  const operational = transactions.filter(t => t.category !== 'fund_transfer');
  const totalIn = operational.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0);
  const totalOut = operational.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);
  return totalIn - totalOut;
}

// ============= 2. حساب CBM =============
export function calculateCBM(length: number, width: number, height: number, quantity: number = 1): number {
  return length * width * height * quantity;
}

export function calculateContractPrice(cbm: number, pricePerMeter: number): number {
  return cbm * pricePerMeter;
}

// ============= 3. حساب ربح المشروع =============
export function calculateProjectProfit(contractValue: number, expenses: number, commission: number = 0, currencyDifference: number = 0): number {
  return contractValue - expenses + commission + currencyDifference;
}

// ============= 4. تحويل العملات =============
export interface CurrencyRate {
  code: string;
  rate: number; // سعر الصرف مقابل العملة الأساسية
}

export function convertAmount(amount: number, fromRate: number, toRate: number): number {
  if (fromRate <= 0 || toRate <= 0) return amount;
  return (amount / fromRate) * toRate;
}

export function toBaseCurrency(amount: number, exchangeRate: number): number {
  return exchangeRate > 0 ? amount / exchangeRate : amount;
}

export function fromBaseCurrency(amount: number, exchangeRate: number): number {
  return amount * exchangeRate;
}

// ============= 5. الاتجاه الشهري (يستثني التحويلات) =============
const MONTH_NAMES_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function calculateMonthlyTrend(transactions: Transaction[]): TrendData[] {
  const months: Record<string, { income: number; expense: number }> = {};

  transactions.forEach(t => {
    if (t.category === 'fund_transfer') return;
    const date = new Date(t.date);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
    if (!months[key]) months[key] = { income: 0, expense: 0 };
    if (t.type === 'in') months[key].income += t.amount;
    else months[key].expense += t.amount;
  });

  const sorted = Object.keys(months).sort().slice(-6);
  if (sorted.length === 0) return [{ month: 'يناير', income: 0, expense: 0, balance: 0 }];

  return sorted.map(key => {
    const [, m] = key.split('-').map(Number);
    const d = months[key];
    return { month: MONTH_NAMES_AR[m], income: d.income, expense: d.expense, balance: d.income - d.expense };
  });
}

// ============= 6. تفصيل المصروفات (يستثني التحويلات) =============
const CATEGORY_LABELS: Record<string, string> = {
  expense: 'مصروفات عامة', vendor_payment: 'دفعات موردين', partner_payment: 'دفعات شركاء',
  debt_payment: 'سداد ديون', other: 'أخرى',
};
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function calculateExpenseBreakdown(transactions: Transaction[]): ChartData[] {
  const cats: Record<string, number> = {};
  transactions.filter(t => t.type === 'out' && t.category !== 'fund_transfer').forEach(t => {
    const cat = t.category || 'other';
    cats[cat] = (cats[cat] || 0) + t.amount;
  });
  return Object.entries(cats).map(([key, value], i) => ({
    label: CATEGORY_LABELS[key] || key,
    value,
    color: COLORS[i % COLORS.length],
  }));
}

// ============= 7. حساب حالة الدفع =============
export function calculatePaymentStatus(contractPrice: number, amountPaid: number): 'paid' | 'partial' | 'unpaid' {
  const remaining = contractPrice - amountPaid;
  if (remaining <= 0) return 'paid';
  if (amountPaid > 0) return 'partial';
  return 'unpaid';
}

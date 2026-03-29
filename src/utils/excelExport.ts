import * as XLSX from 'xlsx';
import { Shipment, Container, Transaction, Debt, Fund, LedgerAccount } from '@/types/finance';
import { compareTransactionsByBusinessDateDesc } from '@/utils/transactionSort';

// تنسيق التاريخ
const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ar-SA');
};

// تنسيق المبلغ
const formatAmount = (amount: number): number => {
  return Math.round(amount * 100) / 100;
};

// تصدير الشحنات
export const exportShipmentsToExcel = (shipments: Shipment[], fileName?: string): void => {
  const data = shipments.map(s => ({
    'اسم العميل': s.clientName,
    'نوع البضاعة': s.goodsType,
    'الطول (م)': s.length,
    'العرض (م)': s.width,
    'الارتفاع (م)': s.height,
    'الكمية': s.quantity,
    'الحجم CBM': formatAmount(s.cbm),
    'سعر المتر': formatAmount(s.pricePerMeter),
    'قيمة المقاولة': formatAmount(s.contractPrice),
    'المدفوع': formatAmount(s.amountPaid),
    'المتبقي': formatAmount(s.remainingAmount),
    'حالة الدفع': getPaymentStatusLabel(s.paymentStatus),
    'رقم التتبع': s.trackingNumber || '',
    'التاريخ': formatDate(s.createdAt),
  }));

  const ws = XLSX.utils.json_to_sheet(data, { header: Object.keys(data[0] || {}) });
  const wb = XLSX.utils.book_new();
  
  // تنسيق عرض الأعمدة
  ws['!cols'] = [
    { wch: 20 }, // العميل
    { wch: 15 }, // البضاعة
    { wch: 10 }, // الطول
    { wch: 10 }, // العرض
    { wch: 10 }, // الارتفاع
    { wch: 8 },  // الكمية
    { wch: 12 }, // CBM
    { wch: 12 }, // سعر المتر
    { wch: 15 }, // المقاولة
    { wch: 12 }, // المدفوع
    { wch: 12 }, // المتبقي
    { wch: 12 }, // الحالة
    { wch: 15 }, // التتبع
    { wch: 12 }, // التاريخ
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'الشحنات');
  XLSX.writeFile(wb, fileName || `شحنات_${Date.now()}.xlsx`);
};

// تصدير الحاويات
export const exportContainersToExcel = (containers: Container[], shipments: Shipment[]): void => {
  // ورقة الحاويات
  const containersData = containers.map(c => {
    const containerShipments = shipments.filter(s => s.containerId === c.id);
    return {
      'رقم الحاوية': c.containerNumber,
      'النوع': c.type,
      'المسار': c.route,
      'الحالة': getContainerStatusLabel(c.status),
      'السعة': c.capacity,
      'المستخدم': formatAmount(c.usedCapacity),
      'المتبقي': formatAmount(c.capacity - c.usedCapacity),
      'نسبة الإشغال': `${Math.round((c.usedCapacity / c.capacity) * 100)}%`,
      'عدد الشحنات': containerShipments.length,
      'تكلفة الشحن': formatAmount(c.shippingCost),
      'تكلفة الجمارك': formatAmount(c.customsCost),
      'تكلفة الميناء': formatAmount(c.portCost),
      'تكاليف أخرى': formatAmount(c.otherCosts),
      'إجمالي التكاليف': formatAmount(c.totalCost),
      'إجمالي الإيرادات': formatAmount(c.totalRevenue),
      'صافي الربح': formatAmount(c.profit),
      'تاريخ المغادرة': c.departureDate || '',
      'تاريخ الوصول': c.arrivalDate || '',
    };
  });

  const wsContainers = XLSX.utils.json_to_sheet(containersData);
  
  // ورقة الشحنات
  const shipmentsData = shipments.map(s => {
    const container = containers.find(c => c.id === s.containerId);
    return {
      'رقم الحاوية': container?.containerNumber || '',
      'اسم العميل': s.clientName,
      'نوع البضاعة': s.goodsType,
      'الحجم CBM': formatAmount(s.cbm),
      'قيمة المقاولة': formatAmount(s.contractPrice),
      'المدفوع': formatAmount(s.amountPaid),
      'المتبقي': formatAmount(s.remainingAmount),
      'حالة الدفع': getPaymentStatusLabel(s.paymentStatus),
    };
  });

  const wsShipments = XLSX.utils.json_to_sheet(shipmentsData);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsContainers, 'الحاويات');
  XLSX.utils.book_append_sheet(wb, wsShipments, 'الشحنات');
  
  XLSX.writeFile(wb, `تقرير_الشحن_${Date.now()}.xlsx`);
};

// تصدير المديونيات
export const exportDebtsToExcel = (debts: Debt[]): void => {
  const data = debts.map(d => ({
    'النوع': d.type === 'receivable' ? 'مدين' : 'دائن',
    'الحساب': d.accountName,
    'المبلغ الأصلي': formatAmount(d.amount),
    'المتبقي': formatAmount(d.remainingAmount),
    'الحالة': getDebtStatusLabel(d.status),
    'الوصف': d.description,
    'تاريخ الاستحقاق': d.dueDate || '',
    'عدد الدفعات': d.payments.length,
    'التاريخ': formatDate(d.createdAt),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'المديونيات');
  XLSX.writeFile(wb, `مديونيات_${Date.now()}.xlsx`);
};

// تصدير العمليات المالية
export const exportTransactionsToExcel = (transactions: Transaction[], funds: Fund[], accounts: LedgerAccount[]): void => {
  const data = [...transactions]
    .sort(compareTransactionsByBusinessDateDesc)
    .map(t => {
      const fund = funds.find(f => f.id === t.fundId);
      const account = accounts.find(a => a.id === t.accountId);
      return {
        'النوع': t.type === 'in' ? 'إيراد' : 'مصروف',
        'التصنيف': getCategoryLabel(t.category),
        'المبلغ': formatAmount(t.amount),
        'الوصف': t.description,
        'الصندوق': fund?.name || '',
        'الحساب': account?.name || '',
        'التاريخ': t.date,
        'ملاحظات': t.notes || '',
      };
    });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'العمليات');
  XLSX.writeFile(wb, `عمليات_مالية_${Date.now()}.xlsx`);
};

// تصدير تقرير مالي شامل
export const exportFinancialReport = (
  funds: Fund[],
  accounts: LedgerAccount[],
  transactions: Transaction[],
  debts: Debt[]
): void => {
  const wb = XLSX.utils.book_new();

  // ورقة الصناديق
  const fundsData = funds.map(f => ({
    'اسم الصندوق': f.name,
    'النوع': getFundTypeLabel(f.type),
    'الرصيد': formatAmount(f.balance),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fundsData), 'الصناديق');

  // ورقة الحسابات
  const accountsData = accounts.map(a => ({
    'اسم الحساب': a.name,
    'النوع': getAccountTypeLabel(a.type),
    'مدين': formatAmount(a.debitBalance),
    'دائن': formatAmount(a.creditBalance),
    'الصافي': formatAmount(a.debitBalance - a.creditBalance),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accountsData), 'الحسابات');

  // ورقة العمليات
  const transData = [...transactions]
    .sort(compareTransactionsByBusinessDateDesc)
    .map(t => ({
      'النوع': t.type === 'in' ? 'إيراد' : 'مصروف',
      'المبلغ': formatAmount(t.amount),
      'الوصف': t.description,
      'التاريخ': t.date,
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transData), 'العمليات');

  // ورقة المديونيات
  const debtsData = debts.map(d => ({
    'النوع': d.type === 'receivable' ? 'مدين' : 'دائن',
    'الحساب': d.accountName,
    'المبلغ': formatAmount(d.amount),
    'المتبقي': formatAmount(d.remainingAmount),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(debtsData), 'المديونيات');

  // ملخص
  const totalIncome = transactions.filter(t => t.type === 'in').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'out').reduce((sum, t) => sum + t.amount, 0);
  const totalReceivables = debts.filter(d => d.type === 'receivable').reduce((sum, d) => sum + d.remainingAmount, 0);
  const totalPayables = debts.filter(d => d.type === 'payable').reduce((sum, d) => sum + d.remainingAmount, 0);

  const summaryData = [
    { 'البيان': 'إجمالي الإيرادات', 'القيمة': formatAmount(totalIncome) },
    { 'البيان': 'إجمالي المصروفات', 'القيمة': formatAmount(totalExpense) },
    { 'البيان': 'صافي الربح', 'القيمة': formatAmount(totalIncome - totalExpense) },
    { 'البيان': 'إجمالي السيولة', 'القيمة': formatAmount(funds.reduce((sum, f) => sum + f.balance, 0)) },
    { 'البيان': 'إجمالي مدين', 'القيمة': formatAmount(totalReceivables) },
    { 'البيان': 'إجمالي دائن', 'القيمة': formatAmount(totalPayables) },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'ملخص');

  XLSX.writeFile(wb, `تقرير_مالي_شامل_${Date.now()}.xlsx`);
};

// Helper functions
const getPaymentStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    paid: 'مدفوع',
    partial: 'جزئي',
    unpaid: 'غير مدفوع',
  };
  return labels[status] || status;
};

const getContainerStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    loading: 'قيد التحميل',
    shipped: 'تم الشحن',
    arrived: 'وصلت',
    delivered: 'تم التسليم',
  };
  return labels[status] || status;
};

const getDebtStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    pending: 'قيد الانتظار',
    partial: 'مدفوع جزئياً',
    paid: 'مدفوع',
  };
  return labels[status] || status;
};

const getCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    client_collection: 'تحصيل عميل',
    vendor_payment: 'دفع مورد',
    expense: 'مصروف',
    transfer: 'تحويل',
    other_income: 'إيراد آخر',
    other_expense: 'مصروف آخر',
  };
  return labels[category] || category;
};

const getFundTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    cash: 'نقدي',
    bank: 'بنكي',
    wallet: 'محفظة',
  };
  return labels[type] || type;
};

const getAccountTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    client: 'عميل',
    vendor: 'مورد',
    expense: 'مصروف',
    income: 'إيراد',
    other: 'أخرى',
  };
  return labels[type] || type;
};

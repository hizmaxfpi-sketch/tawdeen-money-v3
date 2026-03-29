import { useState, useCallback, useEffect } from 'react';
import { 
  Fund,
  LedgerAccount,
  Transaction, 
  Debt, 
  DebtPayment, 
  FinanceStats,
  FundOption,
  AccountOption,
  TrendData,
  ChartData,
  EntityOption,
  // للتوافقية
  Account,
  Individual,
} from '@/types/finance';

// ============= مفاتيح التخزين المحلي =============
const STORAGE_KEYS = {
  funds: 'finance_funds',
  accounts: 'finance_accounts',
  transactions: 'finance_transactions',
  debts: 'finance_debts',
};

// ============= البيانات الافتراضية (فارغة للبدء من الصفر) =============

const defaultFunds: Fund[] = [
  {
    id: 'fund-cash',
    name: 'الصندوق النقدي',
    type: 'cash',
    balance: 0,
    description: 'النقد في الخزنة',
    isDefault: true,
    createdAt: new Date(),
  },
];

const defaultAccounts: LedgerAccount[] = [
  {
    id: 'acc-expense',
    name: 'مصروفات عامة',
    type: 'expense',
    debitBalance: 0,
    creditBalance: 0,
    createdAt: new Date(),
  },
];

const defaultTransactions: Transaction[] = [];

const defaultDebts: Debt[] = [];

// ============= وظائف التخزين المحلي =============

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      // تحويل التواريخ النصية إلى كائنات Date
      return parsed.map((item: any) => ({
        ...item,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        payments: item.payments?.map((p: any) => ({
          ...p,
          date: p.date ? new Date(p.date) : new Date(),
        })),
      }));
    }
  } catch (error) {
    console.error(`Error loading ${key} from storage:`, error);
  }
  return defaultValue;
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error saving ${key} to storage:`, error);
  }
}

// ============= المخزن الرئيسي =============

export function useFinanceStore() {
  const [funds, setFunds] = useState<Fund[]>(() => 
    loadFromStorage(STORAGE_KEYS.funds, defaultFunds)
  );
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>(() => 
    loadFromStorage(STORAGE_KEYS.accounts, defaultAccounts)
  );
  const [transactions, setTransactions] = useState<Transaction[]>(() => 
    loadFromStorage(STORAGE_KEYS.transactions, defaultTransactions)
  );
  const [debts, setDebts] = useState<Debt[]>(() => 
    loadFromStorage(STORAGE_KEYS.debts, defaultDebts)
  );

  // ============= حفظ البيانات عند التغيير =============
  
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.funds, funds);
  }, [funds]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.accounts, ledgerAccounts);
  }, [ledgerAccounts]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.transactions, transactions);
  }, [transactions]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.debts, debts);
  }, [debts]);

  // ============= إدارة الصناديق =============

  const addFund = useCallback((fund: Omit<Fund, 'id' | 'createdAt' | 'balance'>) => {
    const newFund: Fund = {
      ...fund,
      id: `fund-${Date.now()}`,
      balance: 0,
      createdAt: new Date(),
    };
    setFunds(prev => [...prev, newFund]);
    return newFund;
  }, []);

  const updateFund = useCallback((id: string, updates: Partial<Fund>) => {
    setFunds(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const deleteFund = useCallback((id: string) => {
    setFunds(prev => prev.filter(f => f.id !== id));
  }, []);

  // ============= إدارة الحسابات الدفترية =============

  const addLedgerAccount = useCallback((account: Omit<LedgerAccount, 'id' | 'createdAt' | 'debitBalance' | 'creditBalance'>) => {
    const newAccount: LedgerAccount = {
      ...account,
      id: `acc-${Date.now()}`,
      debitBalance: 0,
      creditBalance: 0,
      createdAt: new Date(),
    };
    setLedgerAccounts(prev => [...prev, newAccount]);
    return newAccount;
  }, []);

  const updateLedgerAccount = useCallback((id: string, updates: Partial<LedgerAccount>) => {
    setLedgerAccounts(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  }, []);

  const deleteLedgerAccount = useCallback((id: string) => {
    setLedgerAccounts(prev => prev.filter(a => a.id !== id));
  }, []);

  // ============= إضافة عملية مالية (Double-Entry) =============

  const addTransaction = useCallback((transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: `t-${Date.now()}`,
      createdAt: new Date(),
    };
    setTransactions(prev => [newTransaction, ...prev]);

    const { type, category, amount, fundId, accountId, toFundId } = transaction;

    // 1. تحديث رصيد الصندوق
    if (type === 'in') {
      setFunds(prev => prev.map(f =>
        f.id === fundId ? { ...f, balance: f.balance + amount } : f
      ));
    } else {
      setFunds(prev => prev.map(f =>
        f.id === fundId ? { ...f, balance: f.balance - amount } : f
      ));
    }

    // 2. تحويل بين صناديق
    if (category === 'fund_transfer' && toFundId) {
      setFunds(prev => prev.map(f =>
        f.id === toFundId ? { ...f, balance: f.balance + amount } : f
      ));
      return;
    }

    // 3. تحديث رصيد الحساب الدفتري
    if (accountId) {
      if (category === 'client_collection') {
        // تحصيل من عميل: نقص في المدين (المستحق لنا)
        setLedgerAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, debitBalance: Math.max(0, a.debitBalance - amount) } : a
        ));
      } else if (category === 'vendor_payment') {
        // دفع لمورد: نقص في الدائن (المستحق علينا)
        setLedgerAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, creditBalance: Math.max(0, a.creditBalance - amount) } : a
        ));
      } else if (category === 'expense') {
        // مصروفات عامة: زيادة في المدين
        setLedgerAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, debitBalance: a.debitBalance + amount } : a
        ));
      } else if (category === 'partner_payment') {
        // دفع لشريك
        setLedgerAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, creditBalance: a.creditBalance + amount } : a
        ));
      } else if (category === 'partner_collection') {
        // تحصيل من شريك
        setLedgerAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, debitBalance: Math.max(0, a.debitBalance - amount) } : a
        ));
      }
    }
  }, []);

  const updateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const deleteTransaction = useCallback((transactionId: string) => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    // عكس تأثير العملية على الصندوق
    const { type, category, amount, fundId, accountId, toFundId } = transaction;

    if (type === 'in') {
      setFunds(prev => prev.map(f =>
        f.id === fundId ? { ...f, balance: f.balance - amount } : f
      ));
    } else {
      setFunds(prev => prev.map(f =>
        f.id === fundId ? { ...f, balance: f.balance + amount } : f
      ));
    }

    // عكس التحويل بين الصناديق
    if (category === 'fund_transfer' && toFundId) {
      setFunds(prev => prev.map(f =>
        f.id === toFundId ? { ...f, balance: f.balance - amount } : f
      ));
    }

    // عكس تأثير الحساب الدفتري
    if (accountId) {
      if (category === 'client_collection') {
        setLedgerAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, debitBalance: a.debitBalance + amount } : a
        ));
      } else if (category === 'vendor_payment') {
        setLedgerAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, creditBalance: a.creditBalance + amount } : a
        ));
      } else if (category === 'expense') {
        setLedgerAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, debitBalance: Math.max(0, a.debitBalance - amount) } : a
        ));
      } else if (category === 'partner_payment') {
        setLedgerAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, creditBalance: Math.max(0, a.creditBalance - amount) } : a
        ));
      } else if (category === 'partner_collection') {
        setLedgerAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, debitBalance: a.debitBalance + amount } : a
        ));
      }
    }

    // حذف العملية
    setTransactions(prev => prev.filter(t => t.id !== transactionId));
  }, [transactions]);

  // ============= إدارة المديونيات =============

  const addDebt = useCallback((debt: Omit<Debt, 'id' | 'createdAt' | 'payments' | 'status'>) => {
    const newDebt: Debt = {
      ...debt,
      id: `d-${Date.now()}`,
      status: 'pending',
      payments: [],
      createdAt: new Date(),
    };
    setDebts(prev => [...prev, newDebt]);
    return newDebt;
  }, []);

  const addDebtPayment = useCallback((debtId: string, amount: number, fundId: string, note?: string) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;

    const newPayment: DebtPayment = {
      id: `pay-${Date.now()}`,
      amount,
      date: new Date(),
      fundId,
      note,
    };

    const newRemaining = debt.remainingAmount - amount;
    const isFullyPaid = newRemaining <= 0;

    setDebts(prev => prev.map(d => {
      if (d.id === debtId) {
        return {
          ...d,
          remainingAmount: Math.max(0, newRemaining),
          payments: [...d.payments, newPayment],
          status: isFullyPaid ? 'paid' : 'partial',
        };
      }
      return d;
    }));

    // تحديث رصيد الصندوق
    if (debt.type === 'receivable') {
      // تحصيل = زيادة الصندوق
      setFunds(prev => prev.map(f =>
        f.id === fundId ? { ...f, balance: f.balance + amount } : f
      ));
      // تحديث الحساب الدفتري
      setLedgerAccounts(prev => prev.map(a =>
        a.id === debt.accountId ? { ...a, debitBalance: Math.max(0, a.debitBalance - amount) } : a
      ));
    } else {
      // دفع = نقص الصندوق
      setFunds(prev => prev.map(f =>
        f.id === fundId ? { ...f, balance: f.balance - amount } : f
      ));
      // تحديث الحساب الدفتري
      setLedgerAccounts(prev => prev.map(a =>
        a.id === debt.accountId ? { ...a, creditBalance: Math.max(0, a.creditBalance - amount) } : a
      ));
    }

    // إضافة عملية مالية للسجل
    const transactionType = debt.type === 'receivable' ? 'in' : 'out';
    const transactionCategory = debt.type === 'receivable' ? 'debt_collection' : 'debt_payment';
    
    const newTransaction: Transaction = {
      id: `t-debt-${Date.now()}`,
      type: transactionType,
      category: transactionCategory as any,
      amount,
      description: `${debt.type === 'receivable' ? 'تحصيل مديونية' : 'سداد مديونية'} - ${debt.accountName}`,
      date: new Date().toISOString().split('T')[0],
      fundId,
      accountId: debt.accountId,
      createdAt: new Date(),
    };
    setTransactions(prev => [newTransaction, ...prev]);
  }, [debts]);

  const deleteDebt = useCallback((id: string) => {
    setDebts(prev => prev.filter(d => d.id !== id));
  }, []);

  // ============= الإحصائيات =============

  const getStats = useCallback((): FinanceStats => {
    // السيولة الفعلية
    const totalLiquidity = funds.reduce((sum, f) => sum + f.balance, 0);

    // المصروفات العامة
    const expenseAccount = ledgerAccounts.find(a => a.type === 'expense');
    const totalExpenses = expenseAccount?.debitBalance || 0;

    // صافي ربح الشركة
    const totalIn = transactions.filter(t => t.type === 'in').reduce((sum, t) => sum + t.amount, 0);
    const totalOut = transactions.filter(t => t.type === 'out').reduce((sum, t) => sum + t.amount, 0);
    const netCompanyProfit = totalIn - totalOut;

    // المديونيات
    const totalReceivables = debts
      .filter(d => d.type === 'receivable')
      .reduce((sum, d) => sum + d.remainingAmount, 0);

    const totalPayables = debts
      .filter(d => d.type === 'payable')
      .reduce((sum, d) => sum + d.remainingAmount, 0);

    // حساب نسب التغيير من العمليات
    const thisMonth = transactions.filter(t => {
      const date = new Date(t.date);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });

    const lastMonth = transactions.filter(t => {
      const date = new Date(t.date);
      const now = new Date();
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return date.getMonth() === lastMonthDate.getMonth() && date.getFullYear() === lastMonthDate.getFullYear();
    });

    const thisMonthIncome = thisMonth.filter(t => t.type === 'in').reduce((sum, t) => sum + t.amount, 0);
    const lastMonthIncome = lastMonth.filter(t => t.type === 'in').reduce((sum, t) => sum + t.amount, 0);
    const liquidityChange = lastMonthIncome > 0 ? Math.round(((thisMonthIncome - lastMonthIncome) / lastMonthIncome) * 100) : 0;

    return {
      totalLiquidity,
      totalExpenses,
      netCompanyProfit,
      totalReceivables,
      totalPayables,
      liquidityChange,
      profitChange: 12,
    };
  }, [funds, ledgerAccounts, debts, transactions]);

  // ============= خيارات القوائم المنسدلة =============

  const getFundOptions = useCallback((): FundOption[] => {
    return funds.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      balance: f.balance,
    }));
  }, [funds]);

  const getAccountOptions = useCallback((): AccountOption[] => {
    return ledgerAccounts.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.debitBalance - a.creditBalance,
    }));
  }, [ledgerAccounts]);


  // للتوافق مع الكود القديم
  const getEntityOptions = useCallback((): EntityOption[] => {
    const fundOpts: EntityOption[] = funds.map(f => ({
      id: f.id,
      name: f.name,
      type: 'fund',
      balance: f.balance,
    }));
    const accountOpts: EntityOption[] = ledgerAccounts.map(a => ({
      id: a.id,
      name: a.name,
      type: 'ledger',
      balance: a.debitBalance - a.creditBalance,
    }));
    return [...fundOpts, ...accountOpts];
  }, [funds, ledgerAccounts]);

  // ============= بيانات المخططات =============

  const getMonthlyTrend = useCallback((): TrendData[] => {
    // حساب البيانات من العمليات الفعلية
    const months: Record<string, { income: number; expense: number }> = {};
    const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

    transactions.forEach(t => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      const monthName = monthNames[date.getMonth()];
      
      if (!months[monthKey]) {
        months[monthKey] = { income: 0, expense: 0 };
      }
      
      if (t.type === 'in') {
        months[monthKey].income += t.amount;
      } else {
        months[monthKey].expense += t.amount;
      }
    });

    // تحويل إلى مصفوفة مرتبة
    const sortedKeys = Object.keys(months).sort();
    const lastSixMonths = sortedKeys.slice(-6);

    if (lastSixMonths.length === 0) {
      // إرجاع بيانات افتراضية إذا لم توجد عمليات
      return [
        { month: 'يناير', income: 0, expense: 0, balance: 0 },
        { month: 'فبراير', income: 0, expense: 0, balance: 0 },
        { month: 'مارس', income: 0, expense: 0, balance: 0 },
      ];
    }

    return lastSixMonths.map(key => {
      const [year, monthIndex] = key.split('-').map(Number);
      const data = months[key];
      return {
        month: monthNames[monthIndex],
        income: data.income,
        expense: data.expense,
        balance: data.income - data.expense,
      };
    });
  }, [transactions]);

  const getExpenseBreakdown = useCallback((): ChartData[] => {
    const breakdown: Record<string, number> = {};
    
    transactions
      .filter(t => t.type === 'out')
      .forEach(t => {
        let key = 'أخرى';
        if (t.category === 'vendor_payment') key = 'موردين';
        else if (t.category === 'expense') key = 'مصروفات عامة';
        else if (t.category === 'partner_payment') key = 'شركاء';
        else if (t.category === 'debt_payment') key = 'سداد مديونيات';
        
        breakdown[key] = (breakdown[key] || 0) + t.amount;
      });

    const colors = ['hsl(0, 72%, 51%)', 'hsl(38, 92%, 50%)', 'hsl(270, 60%, 55%)', 'hsl(200, 80%, 50%)', 'hsl(150, 60%, 45%)'];
    
    return Object.entries(breakdown).map(([label, value], index) => ({
      label,
      value,
      color: colors[index % colors.length],
    }));
  }, [transactions]);

  // ============= تصدير البيانات =============

  const exportData = useCallback(() => {
    return {
      funds,
      accounts: ledgerAccounts,
      transactions,
      debts,
      exportedAt: new Date(),
      version: '2.0.0',
    };
  }, [funds, ledgerAccounts, transactions, debts]);

  // ============= استيراد البيانات =============

  const importData = useCallback((data: any) => {
    if (data.funds) setFunds(data.funds);
    if (data.accounts) setLedgerAccounts(data.accounts);
    if (data.transactions) setTransactions(data.transactions);
    if (data.debts) setDebts(data.debts);
  }, []);

  // ============= إعادة تعيين البيانات =============

  const resetData = useCallback(() => {
    // مسح البيانات من localStorage
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    // إعادة تعيين الحالة
    setFunds(defaultFunds);
    setLedgerAccounts(defaultAccounts);
    setTransactions(defaultTransactions);
    setDebts(defaultDebts);
  }, []);

  // مسح البيانات التجريبية القديمة عند أول تشغيل
  useEffect(() => {
    const isFirstRun = !localStorage.getItem('app_initialized_v2');
    if (isFirstRun) {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
      localStorage.setItem('app_initialized_v2', 'true');
      setFunds(defaultFunds);
      setLedgerAccounts(defaultAccounts);
      setTransactions(defaultTransactions);
      setDebts(defaultDebts);
    }
  }, []);

  // ============= للتوافقية مع الكود القديم =============

  const accounts: Account[] = funds.map(f => ({
    id: f.id,
    name: f.name,
    type: f.isDefault ? 'main' : 'general',
    totalIncome: f.balance,
    totalExpense: 0,
    linkedIndividuals: [],
    createdAt: f.createdAt,
  }));

  const individuals: Individual[] = ledgerAccounts
    .filter(a => a.type !== 'expense')
    .map(a => ({
      id: a.id,
      name: a.name,
      role: a.type === 'client' ? 'عميل' : a.type === 'vendor' ? 'مورد' : 'شريك',
      phone: a.phone,
      email: a.email,
      notes: a.notes,
      totalIncome: a.debitBalance,
      totalExpense: a.creditBalance,
      createdAt: a.createdAt,
    }));

  const addAccount = useCallback((account: Omit<Account, 'id' | 'createdAt' | 'totalIncome' | 'totalExpense'>) => {
    addFund({
      name: account.name,
      type: account.type === 'main' ? 'cash' : 'bank',
      description: '',
      isDefault: account.type === 'main',
    });
  }, [addFund]);

  const addIndividual = useCallback((individual: Omit<Individual, 'id' | 'createdAt' | 'totalIncome' | 'totalExpense'>) => {
    let type: 'client' | 'vendor' | 'partner' = 'client';
    if (individual.role === 'مورد') type = 'vendor';
    else if (individual.role === 'شريك') type = 'partner';
    
    addLedgerAccount({
      name: individual.name,
      type,
      phone: individual.phone,
      email: individual.email,
      notes: individual.notes,
    });
  }, [addLedgerAccount]);

  return {
    // البيانات الجديدة
    funds,
    ledgerAccounts,
    transactions,
    debts,
    // الإجراءات الجديدة
    addFund,
    updateFund,
    deleteFund,
    addLedgerAccount,
    updateLedgerAccount,
    deleteLedgerAccount,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addDebt,
    addDebtPayment,
    deleteDebt,
    // الاستعلامات
    getStats,
    getFundOptions,
    getAccountOptions,
    getEntityOptions,
    getMonthlyTrend,
    getExpenseBreakdown,
    exportData,
    importData,
    resetData,
    // للتوافقية
    accounts,
    individuals,
    addAccount,
    addIndividual,
    updateAccount: updateFund,
    updateIndividual: updateLedgerAccount,
  };
}

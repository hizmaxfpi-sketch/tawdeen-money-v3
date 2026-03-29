import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Fund, 
  FundType,
  LedgerAccount, 
  LedgerAccountType,
  Transaction, 
  TransactionType,
  TransactionCategory,
  Debt, 
  DebtType,
  DebtStatus,
  FundOption,
  AccountOption,
  FinanceStats,
  TrendData,
  ChartData,
  Project,
  ProjectStatus,
  ProjectStats,
} from '@/types/finance';

// ============= بيانات تجريبية ثابتة =============
const MOCK_FUNDS: Fund[] = [
  {
    id: 'fund-1',
    name: 'الصندوق الرئيسي',
    type: 'cash',
    balance: 50000,
    description: 'الصندوق الرئيسي للعمليات اليومية',
    createdAt: new Date('2024-01-01'),
  },
  {
    id: 'fund-2',
    name: 'حساب البنك',
    type: 'bank',
    balance: 125000,
    description: 'الحساب البنكي الرئيسي',
    createdAt: new Date('2024-01-01'),
  },
  {
    id: 'fund-3',
    name: 'محفظة إلكترونية',
    type: 'wallet',
    balance: 8500,
    description: 'محفظة الدفع الإلكتروني',
    createdAt: new Date('2024-02-15'),
  },
];

const MOCK_LEDGER_ACCOUNTS: LedgerAccount[] = [
  {
    id: 'acc-1',
    name: 'شركة الأمل للاستيراد',
    type: 'client',
    debitBalance: 35000,
    creditBalance: 0,
    phone: '0512345678',
    createdAt: new Date('2024-01-15'),
  },
  {
    id: 'acc-2',
    name: 'مؤسسة النور للتجارة',
    type: 'client',
    debitBalance: 22000,
    creditBalance: 0,
    phone: '0598765432',
    createdAt: new Date('2024-02-01'),
  },
  {
    id: 'acc-3',
    name: 'مصنع الجودة',
    type: 'vendor',
    debitBalance: 0,
    creditBalance: 18000,
    phone: '0501234567',
    createdAt: new Date('2024-01-20'),
  },
  {
    id: 'acc-4',
    name: 'مصروفات عامة',
    type: 'expense',
    debitBalance: 5000,
    creditBalance: 0,
    createdAt: new Date('2024-01-01'),
  },
];

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    type: 'in',
    category: 'client_collection',
    amount: 25000,
    description: 'دفعة من شركة الأمل',
    date: '2024-03-01',
    fundId: 'fund-2',
    accountId: 'acc-1',
    createdAt: new Date('2024-03-01'),
  },
  {
    id: 'tx-2',
    type: 'out',
    category: 'vendor_payment',
    amount: 30000,
    description: 'دفعة لمصنع الجودة',
    date: '2024-03-05',
    fundId: 'fund-2',
    accountId: 'acc-3',
    createdAt: new Date('2024-03-05'),
  },
  {
    id: 'tx-3',
    type: 'in',
    category: 'client_collection',
    amount: 20000,
    description: 'دفعة من مؤسسة النور',
    date: '2024-03-10',
    fundId: 'fund-1',
    accountId: 'acc-2',
    createdAt: new Date('2024-03-10'),
  },
  {
    id: 'tx-4',
    type: 'out',
    category: 'expense',
    amount: 2500,
    description: 'مصاريف نقل وشحن',
    date: '2024-03-12',
    fundId: 'fund-1',
    accountId: 'acc-4',
    createdAt: new Date('2024-03-12'),
  },
];

const MOCK_DEBTS: Debt[] = [
  {
    id: 'debt-1',
    type: 'receivable',
    accountId: 'acc-1',
    accountName: 'شركة الأمل للاستيراد',
    amount: 80000,
    remainingAmount: 35000,
    description: 'مستحقات استيراد',
    status: 'partial',
    payments: [],
    createdAt: new Date('2024-01-15'),
  },
  {
    id: 'debt-2',
    type: 'payable',
    accountId: 'acc-3',
    accountName: 'مصنع الجودة',
    amount: 55000,
    remainingAmount: 18000,
    description: 'مستحقات المصنع',
    status: 'partial',
    payments: [],
    createdAt: new Date('2024-01-20'),
  },
];

// ============= بيانات المشاريع التجريبية =============
const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: 'مشروع تجديد المكتب',
    description: 'تجديد وتأثيث المكتب الرئيسي',
    clientId: 'acc-1',
    clientName: 'شركة الأمل للاستيراد',
    vendorId: 'acc-3',
    vendorName: 'مصنع الجودة',
    contractValue: 50000,
    expenses: 35000,
    receivedAmount: 30000,
    commission: 2000,
    currencyDifference: 500,
    profit: 17500,
    status: 'active',
    startDate: '2024-02-01',
    notes: 'مشروع تجديد شامل للمكتب',
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-03-01'),
  },
  {
    id: 'proj-2',
    name: 'مشروع استيراد معدات',
    description: 'استيراد معدات صناعية من الصين',
    clientId: 'acc-2',
    clientName: 'مؤسسة النور للتجارة',
    contractValue: 120000,
    expenses: 90000,
    receivedAmount: 120000,
    commission: 5000,
    currencyDifference: -1000,
    profit: 34000,
    status: 'completed',
    startDate: '2024-01-15',
    endDate: '2024-03-10',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-03-10'),
  },
  {
    id: 'proj-3',
    name: 'مشروع التوريد الشهري',
    description: 'توريد مستلزمات شهرية',
    clientId: 'acc-1',
    clientName: 'شركة الأمل للاستيراد',
    contractValue: 25000,
    expenses: 20000,
    receivedAmount: 10000,
    commission: 0,
    currencyDifference: 0,
    profit: 5000,
    status: 'paused',
    startDate: '2024-03-01',
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-15'),
  },
];

// ============= Mock Hook =============
export function useMockFinance() {
  const [funds, setFunds] = useState<Fund[]>(MOCK_FUNDS);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>(MOCK_LEDGER_ACCOUNTS);
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [debts, setDebts] = useState<Debt[]>(MOCK_DEBTS);
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);

  // ============= إضافة صندوق =============
  const addFund = useCallback((fund: { name: string; type: FundType; description?: string }) => {
    const newFund: Fund = {
      id: `fund-${Date.now()}`,
      name: fund.name,
      type: fund.type,
      balance: 0,
      description: fund.description,
      createdAt: new Date(),
    };
    setFunds(prev => [...prev, newFund]);
    toast.success('تم إضافة الصندوق بنجاح (وضع تجريبي)');
    return newFund;
  }, []);

  const updateFund = useCallback((id: string, updates: Partial<Fund>) => {
    setFunds(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    toast.success('تم تحديث الصندوق (وضع تجريبي)');
  }, []);

  const deleteFund = useCallback((id: string) => {
    setFunds(prev => prev.filter(f => f.id !== id));
    toast.success('تم حذف الصندوق (وضع تجريبي)');
  }, []);

  // ============= إضافة حساب =============
  const addLedgerAccount = useCallback((account: { name: string; type: LedgerAccountType; phone?: string; email?: string; notes?: string }) => {
    const newAccount: LedgerAccount = {
      id: `acc-${Date.now()}`,
      name: account.name,
      type: account.type,
      debitBalance: 0,
      creditBalance: 0,
      phone: account.phone,
      email: account.email,
      notes: account.notes,
      createdAt: new Date(),
    };
    setLedgerAccounts(prev => [...prev, newAccount]);
    toast.success('تم إضافة الحساب بنجاح (وضع تجريبي)');
    return newAccount;
  }, []);

  const updateLedgerAccount = useCallback((id: string, updates: Partial<LedgerAccount>) => {
    setLedgerAccounts(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    toast.success('تم تحديث الحساب (وضع تجريبي)');
  }, []);

  const deleteLedgerAccount = useCallback((id: string) => {
    setLedgerAccounts(prev => prev.filter(a => a.id !== id));
    toast.success('تم حذف الحساب (وضع تجريبي)');
  }, []);

  // ============= إضافة عملية =============
  const addTransaction = useCallback((transaction: Omit<Transaction, 'id' | 'createdAt'> & { contactId?: string }) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: `tx-${Date.now()}`,
      createdAt: new Date(),
    };
    setTransactions(prev => [newTransaction, ...prev]);

    // تحديث رصيد الصندوق
    if (transaction.fundId) {
      setFunds(prev => prev.map(f => {
        if (f.id === transaction.fundId) {
          const newBalance = transaction.type === 'in' 
            ? f.balance + transaction.amount 
            : f.balance - transaction.amount;
          return { ...f, balance: newBalance };
        }
        return f;
      }));
    }

    toast.success('تم إضافة العملية بنجاح (وضع تجريبي)');
    return newTransaction;
  }, []);

  const deleteTransaction = useCallback((transactionId: string) => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (transaction && transaction.fundId) {
      setFunds(prev => prev.map(f => {
        if (f.id === transaction.fundId) {
          const newBalance = transaction.type === 'in' 
            ? f.balance - transaction.amount 
            : f.balance + transaction.amount;
          return { ...f, balance: newBalance };
        }
        return f;
      }));
    }
    setTransactions(prev => prev.filter(t => t.id !== transactionId));
    toast.success('تم حذف العملية (وضع تجريبي)');
  }, [transactions]);

  // ============= المديونيات =============
  const addDebt = useCallback((debt: Omit<Debt, 'id' | 'createdAt' | 'payments' | 'status'>) => {
    const newDebt: Debt = {
      ...debt,
      id: `debt-${Date.now()}`,
      status: 'pending',
      payments: [],
      createdAt: new Date(),
    };
    setDebts(prev => [...prev, newDebt]);
    toast.success('تم إضافة المديونية (وضع تجريبي)');
    return newDebt;
  }, []);

  const addDebtPayment = useCallback(({ debtId, amount, fundId, note }: { debtId: string; amount: number; fundId: string; note?: string }) => {
    setDebts(prev => prev.map(d => {
      if (d.id === debtId) {
        const newRemaining = Math.max(0, d.remainingAmount - amount);
        return {
          ...d,
          remainingAmount: newRemaining,
          status: newRemaining <= 0 ? 'paid' : 'partial' as DebtStatus,
          payments: [...d.payments, { id: `pay-${Date.now()}`, amount, date: new Date(), fundId, note }],
        };
      }
      return d;
    }));
    toast.success('تم تسجيل السداد (وضع تجريبي)');
  }, []);

  const deleteDebt = useCallback((id: string) => {
    setDebts(prev => prev.filter(d => d.id !== id));
    toast.success('تم حذف المديونية (وضع تجريبي)');
  }, []);

  // ============= التحويل بين الصناديق =============
  const transferFunds = useCallback((fromFundId: string, toFundId: string, amount: number, note?: string, currencyCode?: string) => {
    setFunds(prev => prev.map(f => {
      if (f.id === fromFundId) return { ...f, balance: f.balance - amount };
      if (f.id === toFundId) return { ...f, balance: f.balance + amount };
      return f;
    }));
    
    const newTransaction: Transaction = {
      id: `tx-transfer-${Date.now()}`,
      type: 'out',
      category: 'fund_transfer',
      amount,
      description: note || 'تحويل بين الصناديق',
      date: new Date().toISOString().split('T')[0],
      fundId: fromFundId,
      toFundId,
      createdAt: new Date(),
    };
    setTransactions(prev => [newTransaction, ...prev]);
    toast.success('تم التحويل بنجاح (وضع تجريبي)');
  }, []);

  // ============= الإحصائيات =============
  const getStats = useCallback((): FinanceStats => {
    const totalLiquidity = funds.reduce((sum, f) => sum + f.balance, 0);
    const totalReceivables = debts.filter(d => d.type === 'receivable' && d.status !== 'paid').reduce((sum, d) => sum + d.remainingAmount, 0);
    const totalPayables = debts.filter(d => d.type === 'payable' && d.status !== 'paid').reduce((sum, d) => sum + d.remainingAmount, 0);
    const totalIn = transactions.filter(t => t.type === 'in').reduce((sum, t) => sum + t.amount, 0);
    const totalOut = transactions.filter(t => t.type === 'out').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = transactions.filter(t => t.category === 'expense').reduce((sum, t) => sum + t.amount, 0);

    return { 
      totalLiquidity, 
      liquidityChange: 5.2, 
      profitChange: 8.5, 
      totalReceivables, 
      totalPayables, 
      totalExpenses,
      netCompanyProfit: totalIn - totalOut,
    };
  }, [funds, debts, transactions]);

  const getFundOptions = useCallback((): FundOption[] => 
    funds.map(f => ({ id: f.id, name: f.name, type: f.type, balance: f.balance })), 
  [funds]);

  const getAccountOptions = useCallback((): AccountOption[] => 
    ledgerAccounts.map(a => ({ id: a.id, name: a.name, type: a.type, balance: a.debitBalance - a.creditBalance })), 
  [ledgerAccounts]);

  const getMonthlyTrend = useCallback((): TrendData[] => [
    { month: 'يناير', income: 45000, expense: 32000, balance: 13000 },
    { month: 'فبراير', income: 52000, expense: 38000, balance: 14000 },
    { month: 'مارس', income: 48000, expense: 35000, balance: 13000 },
    { month: 'أبريل', income: 61000, expense: 42000, balance: 19000 },
    { month: 'مايو', income: 55000, expense: 40000, balance: 15000 },
    { month: 'يونيو', income: 68000, expense: 45000, balance: 23000 },
  ], []);

  const getExpenseBreakdown = useCallback((): ChartData[] => [
    { label: 'رواتب', value: 25000, color: '#3b82f6' },
    { label: 'إيجار', value: 12000, color: '#22c55e' },
    { label: 'نقل وشحن', value: 8500, color: '#f59e0b' },
    { label: 'خدمات', value: 5000, color: '#ef4444' },
    { label: 'أخرى', value: 3500, color: '#8b5cf6' },
  ], []);

  // ============= إدارة المشاريع =============
  const addProject = useCallback((project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'profit' | 'receivedAmount'>) => {
    const profit = project.contractValue - project.expenses + project.commission + project.currencyDifference;
    const newProject: Project = {
      ...project,
      id: `proj-${Date.now()}`,
      profit,
      receivedAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setProjects(prev => [...prev, newProject]);
    toast.success('تم إضافة المشروع بنجاح (وضع تجريبي)');
    return newProject;
  }, []);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, ...updates, updatedAt: new Date() };
        // إعادة حساب الربح
        updated.profit = updated.contractValue - updated.expenses + updated.commission + updated.currencyDifference;
        return updated;
      }
      return p;
    }));
    toast.success('تم تحديث المشروع (وضع تجريبي)');
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    toast.success('تم حذف المشروع (وضع تجريبي)');
  }, []);

  const getProjectStats = useCallback((): ProjectStats => {
    const activeProjects = projects.filter(p => p.status === 'active').length;
    const completedProjects = projects.filter(p => p.status === 'completed').length;
    const expectedProfit = projects.filter(p => p.status === 'active').reduce((sum, p) => sum + p.profit, 0);
    const realizedProfit = projects.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.profit, 0);
    
    return {
      totalProjects: projects.length,
      activeProjects,
      completedProjects,
      expectedProfit,
      realizedProfit,
    };
  }, [projects]);

  const exportData = useCallback(() => ({
    funds, 
    ledgerAccounts, 
    transactions, 
    debts,
    projects,
    exportedAt: new Date().toISOString() 
  }), [funds, ledgerAccounts, transactions, debts, projects]);

  return {
    // البيانات
    funds,
    ledgerAccounts,
    transactions,
    debts,
    projects,
    
    // حالات التحميل (ثابتة لأنها بيانات محلية)
    fundsLoading: false,
    accountsLoading: false,
    transactionsLoading: false,
    debtsLoading: false,
    projectsLoading: false,
    
    // إدارة الصناديق
    addFund,
    updateFund,
    deleteFund,
    transferFunds,
    
    // إدارة الحسابات
    addLedgerAccount,
    updateLedgerAccount,
    deleteLedgerAccount,
    
    // إدارة العمليات
    addTransaction,
    deleteTransaction,
    
    // إدارة المديونيات
    addDebt,
    addDebtPayment,
    deleteDebt,
    
    // إدارة المشاريع
    addProject,
    updateProject,
    deleteProject,
    getProjectStats,
    
    // الإحصائيات والخيارات
    getStats,
    getFundOptions,
    getAccountOptions,
    getMonthlyTrend,
    getExpenseBreakdown,
    exportData,
  };
}

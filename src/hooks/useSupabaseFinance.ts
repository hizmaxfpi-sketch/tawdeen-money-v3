// ============= Thin Composer Hook =============
// يجمع كل الـ hooks المتخصصة في واجهة واحدة للتوافقية

import { useFunds } from './useFunds';
import { useTransactions } from './useTransactions';
import { useProjects } from './useProjects';
import { useDebts } from './useDebts';
import { useCallback, useState, useEffect, useRef } from 'react';
import { FinanceStats, AccountOption } from '@/types/finance';
import { useSupabaseContacts } from './useSupabaseContacts';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateMonthlyTrend, calculateExpenseBreakdown } from '@/utils/calculationEngine';

export function useSupabaseFinance() {
  const { user } = useAuth();
  const fundsHook = useFunds();
  const txHook = useTransactions();
  const projectsHook = useProjects();
  const debtsHook = useDebts();
  const contactsHook = useSupabaseContacts();

  // إحصائيات من DB مباشرة (مصدر الحقيقة الوحيد)
  const [dbStats, setDbStats] = useState<FinanceStats>({
    totalLiquidity: 0, netCompanyProfit: 0, totalExpenses: 0,
    totalReceivables: 0, totalPayables: 0, liquidityChange: 0, profitChange: 0,
  });

  const fetchStats = useCallback(async () => {
    if (!user) return;
    const { data, error } = await (supabase.rpc as any)('get_financial_summary');
    if (!error && data) {
      const d = data as any;
      setDbStats({
        totalLiquidity: Number(d.totalLiquidity) || 0,
        netCompanyProfit: Number(d.netCompanyProfit) || 0,
        totalExpenses: Number(d.totalExpenses) || 0,
        totalReceivables: Number(d.totalReceivables) || 0,
        totalPayables: Number(d.totalPayables) || 0,
        liquidityChange: 0,
        profitChange: 0,
      });
    }
  }, [user]);

  // جلب الإحصائيات عند تغير البيانات
  // Debounce stats fetching to avoid cascade of RPC calls
  const statsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user) return;
    if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
    statsTimerRef.current = setTimeout(() => {
      fetchStats();
      statsTimerRef.current = null;
    }, 800);
    return () => { if (statsTimerRef.current) clearTimeout(statsTimerRef.current); };
  }, [user, fundsHook.funds, txHook.transactions, debtsHook.debts]);

  const getStats = useCallback((): FinanceStats => dbStats, [dbStats]);

  // خيارات الحسابات من جهات الاتصال (التوحيد)
  const getAccountOptions = useCallback((): AccountOption[] =>
    contactsHook.contacts
      .filter(c => c.status === 'active')
      .map(c => ({ 
        id: c.id, 
        name: c.name, 
        type: c.type as any, 
        balance: c.balance 
      })),
  [contactsHook.contacts]);

  const fetchAllRows = useCallback(async (table: 'funds' | 'transactions' | 'debts' | 'projects' | 'contacts' | 'debt_payments') => {
    if (!user) return [] as any[];

    const pageSize = 1000;
    let from = 0;
    const rows: any[] = [];

    while (true) {
      const { data, error } = await (supabase.from(table as any).select('*').range(from, from + pageSize - 1) as any);
      if (error) throw error;

      rows.push(...(data || []));

      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    return rows;
  }, [user]);

  const exportData = useCallback(async () => {
    if (!user) {
      return {
        contacts: [],
        funds: [],
        transactions: [],
        debts: [],
        projects: [],
        exportedAt: new Date().toISOString(),
        backupVersion: 2,
      };
    }

    const [contacts, funds, transactions, debts, projects, debtPayments] = await Promise.all([
      fetchAllRows('contacts'),
      fetchAllRows('funds'),
      fetchAllRows('transactions'),
      fetchAllRows('debts'),
      fetchAllRows('projects'),
      fetchAllRows('debt_payments'),
    ]);

    // Fetch additional tables for complete backup
    let containers: any[] = [], shipments: any[] = [], shipmentPayments: any[] = [];
    let currencies: any[] = [], companySettings: any[] = [], ledgerAccounts: any[] = [];
    try {
      [containers, shipments, shipmentPayments, currencies, companySettings, ledgerAccounts] = await Promise.all([
        supabase.from('containers').select('*').then(r => r.data || []),
        supabase.from('shipments').select('*').then(r => r.data || []),
        supabase.from('shipment_payments').select('*').then(r => r.data || []),
        supabase.from('currencies').select('*').then(r => r.data || []),
        supabase.from('company_settings').select('*').then(r => r.data || []),
        supabase.from('ledger_accounts').select('*').then(r => r.data || []),
      ]);
    } catch (e) {
      console.warn('Error fetching additional tables for backup:', e);
    }

    const paymentsByDebt = new Map<string, any[]>();
    for (const payment of debtPayments) {
      const debtId = payment.debt_id;
      if (!debtId) continue;
      const existing = paymentsByDebt.get(debtId) || [];
      existing.push(payment);
      paymentsByDebt.set(debtId, existing);
    }

    return {
      contacts,
      funds,
      transactions,
      debts: debts.map((debt: any) => ({
        ...debt,
        payments: paymentsByDebt.get(debt.id) || [],
      })),
      projects,
      containers,
      shipments,
      shipment_payments: shipmentPayments,
      currencies,
      company_settings: companySettings,
      ledger_accounts: ledgerAccounts,
      exportedAt: new Date().toISOString(),
      backupVersion: 3,
    };
  }, [fetchAllRows, user]);

  // مزامنة أرصدة الحسابات بعد أي عملية مالية
  const syncContactBalances = useCallback(async () => {
    if (!user) return;
    await (supabase.rpc as any)('sync_contact_balances');
    await contactsHook.syncBalances?.();
  }, [user, contactsHook]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fundsHook.fetchFunds(),
      txHook.fetchTransactions(true),
      projectsHook.fetchProjects(),
      debtsHook.fetchDebts(),
    ]);
    // مزامنة أرصدة الحسابات من الدفتر الموحد
    await syncContactBalances();
  }, [fundsHook.fetchFunds, txHook.fetchTransactions, projectsHook.fetchProjects, debtsHook.fetchDebts, syncContactBalances]);

  const importData = useCallback(async (data: any) => {
    if (!user) return;
    const { data: result, error } = await supabase.functions.invoke('restore-backup', {
      body: data,
    });
    if (error) throw error;
    await refreshAll();
    return result;
  }, [user, refreshAll]);

  return {
    // Funds
    funds: fundsHook.funds,
    fundsLoading: fundsHook.loading,
    addFund: fundsHook.addFund,
    updateFund: fundsHook.updateFund,
    deleteFund: fundsHook.deleteFund,
    transferFunds: fundsHook.transferFunds,
    getFundOptions: fundsHook.getFundOptions,

    // Transactions
    transactions: txHook.transactions,
    transactionsLoading: txHook.loading,
    hasMoreTransactions: txHook.hasMore,
    addTransaction: txHook.addTransaction,
    updateTransaction: txHook.updateTransaction,
    deleteTransaction: txHook.deleteTransaction,
    loadMoreTransactions: txHook.loadMore,
    getMonthlyTrend: txHook.getMonthlyTrend,
    getExpenseBreakdown: txHook.getExpenseBreakdown,

    // Projects
    projects: projectsHook.projects,
    projectsLoading: projectsHook.loading,
    projectsHasMore: projectsHook.hasMore,
    projectsLoadingMore: projectsHook.loadingMore,
    loadMoreProjects: projectsHook.loadMore,
    addProject: projectsHook.addProject,
    updateProject: projectsHook.updateProject,
    deleteProject: projectsHook.deleteProject,
    getProjectStats: projectsHook.getProjectStats,

    // Debts
    debts: debtsHook.debts,
    debtsLoading: debtsHook.loading,
    addDebt: debtsHook.addDebt,
    addDebtPayment: debtsHook.addDebtPayment,
    deleteDebt: debtsHook.deleteDebt,

    // Unified
    ledgerAccounts: [], // deprecated - use contacts
    accountsLoading: false,
    addLedgerAccount: async () => {},
    updateLedgerAccount: async () => {},
    deleteLedgerAccount: async () => {},
    getStats,
    getAccountOptions,
    exportData,
    importData,
    refreshAll,
  };
}

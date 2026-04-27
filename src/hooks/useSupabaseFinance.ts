// ============= Thin Composer Hook =============
// يجمع كل الـ hooks المتخصصة في واجهة واحدة للتوافقية

import { useFunds } from './useFunds';
import { useTransactions } from './useTransactions';
import { useProjects } from './useProjects';
import { useDebts } from './useDebts';
import { useCallback } from 'react';
import { FinanceStats, AccountOption } from '@/types/finance';
import { useSupabaseContacts } from './useSupabaseContacts';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export function useSupabaseFinance() {
  const { user } = useAuth();
  const fundsHook = useFunds();
  const txHook = useTransactions();
  const projectsHook = useProjects();
  const debtsHook = useDebts();
  const contactsHook = useSupabaseContacts();

  // ⚠️ DEPRECATED: getStats() always returns zeros here.
  // The single source of truth for dashboard numbers is useDashboardSnapshot.
  // This shim prevents N redundant get_dashboard_snapshot RPC calls
  // (one per consumer of useSupabaseFinance) which was the main lag source.
  const getStats = useCallback((): FinanceStats => ({
    totalLiquidity: 0, netCompanyProfit: 0, totalExpenses: 0,
    totalReceivables: 0, totalPayables: 0, liquidityChange: 0, profitChange: 0,
  }), []);

  // خيارات الحسابات من جهات الاتصال (التوحيد)
  const getAccountOptions = useCallback((): AccountOption[] =>
    contactsHook.contacts
      .filter(c => c.status === 'active')
      .map(c => ({ 
        id: c.id, 
        name: c.name, 
        type: c.type as any, 
        balance: c.balance,
        phone: c.phone,
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
    let currencies: any[] = [], companySettings: any[] = [];
    let ledgerAccounts: any[] = [], containerExpenses: any[] = [];
    let productionMaterials: any[] = [], productionProducts: any[] = [], productionServices: any[] = [];
    let materialPurchases: any[] = [], productionRuns: any[] = [], productionSales: any[] = [];
    let productBom: any[] = [], productionSaleServices: any[] = [], productionSaleExpenses: any[] = [];
    let assets: any[] = [], assetPayments: any[] = [], assetImprovements: any[] = [];
    let recurringObligations: any[] = [], obligationItems: any[] = [];
    let obligationDrafts: any[] = [], obligationDraftItems: any[] = [];
    try {
      [
        containers, shipments, shipmentPayments, currencies, companySettings,
        ledgerAccounts, containerExpenses,
        productionMaterials, productionProducts, productionServices,
        materialPurchases, productionRuns, productionSales,
        productBom, productionSaleServices, productionSaleExpenses,
        assets, assetPayments, assetImprovements,
        recurringObligations, obligationItems, obligationDrafts, obligationDraftItems,
      ] = await Promise.all([
        supabase.from('containers').select('*').then(r => r.data || []),
        supabase.from('shipments').select('*').then(r => r.data || []),
        supabase.from('shipment_payments').select('*').then(r => r.data || []),
        supabase.from('currencies').select('*').then(r => r.data || []),
        supabase.from('company_settings').select('*').then(r => r.data || []),
        supabase.from('ledger_accounts').select('*').then(r => r.data || []),
        supabase.from('container_expenses').select('*').then(r => r.data || []),
        supabase.from('production_materials').select('*').then(r => r.data || []),
        supabase.from('production_products').select('*').then(r => r.data || []),
        (supabase as any).from('production_services').select('*').then((r: any) => r.data || []),
        supabase.from('material_purchases').select('*').then(r => r.data || []),
        supabase.from('production_runs').select('*').then(r => r.data || []),
        supabase.from('production_sales').select('*').then(r => r.data || []),
        supabase.from('product_bom').select('*').then(r => r.data || []),
        supabase.from('production_sale_services').select('*').then(r => r.data || []),
        supabase.from('production_sale_expenses').select('*').then(r => r.data || []),
        supabase.from('assets').select('*').then(r => r.data || []),
        supabase.from('asset_payments').select('*').then(r => r.data || []),
        supabase.from('asset_improvements').select('*').then(r => r.data || []),
        supabase.from('recurring_obligations').select('*').then(r => r.data || []),
        supabase.from('obligation_items').select('*').then(r => r.data || []),
        supabase.from('obligation_drafts').select('*').then(r => r.data || []),
        supabase.from('obligation_draft_items').select('*').then(r => r.data || []),
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

    const { data: activeRole } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

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
      container_expenses: containerExpenses,
      production_materials: productionMaterials,
      production_products: productionProducts,
      production_services: productionServices,
      material_purchases: materialPurchases,
      production_runs: productionRuns,
      production_sales: productionSales,
      product_bom: productBom,
      production_sale_services: productionSaleServices,
      production_sale_expenses: productionSaleExpenses,
      assets,
      asset_payments: assetPayments,
      asset_improvements: assetImprovements,
      recurring_obligations: recurringObligations,
      obligation_items: obligationItems,
      obligation_drafts: obligationDrafts,
      obligation_draft_items: obligationDraftItems,
      backupMeta: {
        companyId: activeRole?.company_id || null,
        exportedByUserId: user.id,
      },
      exportedAt: new Date().toISOString(),
      backupVersion: 6,
    };
  }, [fetchAllRows, user]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fundsHook.fetchFunds(),
      txHook.fetchTransactions(true),
      projectsHook.fetchProjects(),
      debtsHook.fetchDebts(),
    ]);
  }, [fundsHook.fetchFunds, txHook.fetchTransactions, projectsHook.fetchProjects, debtsHook.fetchDebts]);

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

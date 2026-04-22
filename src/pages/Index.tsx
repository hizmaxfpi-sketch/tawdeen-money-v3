import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { FloatingAddButton } from '@/components/layout/FloatingAddButton';
import { Dashboard } from '@/components/dashboard/Dashboard';
// ✅ Lazy-load heavy module pages — they are only fetched when the user navigates to them
const FundsPage = lazy(() => import('@/components/funds/FundsPage').then(m => ({ default: m.FundsPage })));
const LedgerAccountsPage = lazy(() => import('@/components/ledger/LedgerAccountsPage').then(m => ({ default: m.LedgerAccountsPage })));
const ReportsPage = lazy(() => import('@/components/reports/ReportsPage').then(m => ({ default: m.ReportsPage })));
const ShippingPage = lazy(() => import('@/components/shipping/ShippingPage').then(m => ({ default: m.ShippingPage })));
const ProjectsPage = lazy(() => import('@/components/projects/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const BusinessPage = lazy(() => import('@/components/business/BusinessPage').then(m => ({ default: m.BusinessPage })));
const ProductionPage = lazy(() => import('@/components/production/ProductionPage').then(m => ({ default: m.ProductionPage })));
import { useProduction } from '@/hooks/useProduction';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { CoachMarks } from '@/components/onboarding/CoachMarks';
import { useSupabaseFinance } from '@/hooks/useSupabaseFinance';
import { useSupabaseShipping } from '@/hooks/useSupabaseShipping';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { useCurrencies } from '@/hooks/useCurrencies';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { useUserRole } from '@/hooks/useUserRole';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useBusinessTransactions } from '@/hooks/useBusinessTransactions';
import { useDashboardSnapshot } from '@/hooks/useDashboardSnapshot';
import { useEnabledModules, ModuleKey } from '@/hooks/useEnabledModules';
import { TransactionType, Transaction } from '@/types/finance';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';

type PageType = 'home' | 'funds' | 'accounts' | 'projects' | 'reports' | 'shipping' | 'business' | 'production';

function StatsSkeleton() {
  return (
    <div className="space-y-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 py-2">
      {[1, 2, 3].map(i => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

const Index = () => {
  const { user } = useAuth();
  const { dir, t } = useLanguage();
  const { canEdit: roleCanEdit, isViewer } = useUserRole();
  const perms = useUserPermissions();
  const { isEnabled, enabled: enabledModules, loading: modulesLoading } = useEnabledModules();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const pageFromUrl = searchParams.get('page') as PageType | null;
  const [currentPage, setCurrentPage] = useState<PageType>(pageFromUrl || 'home');
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [defaultTransactionType, setDefaultTransactionType] = useState<TransactionType>('in');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (pageFromUrl && pageFromUrl !== currentPage) {
      setCurrentPage(pageFromUrl);
    }
  }, [pageFromUrl]);

  // إذا كانت الصفحة الحالية معطّلة، نرجع للصفحة الرئيسية (بعد انتهاء التحميل)
  useEffect(() => {
    if (modulesLoading) return;
    if (!isEnabled(currentPage as ModuleKey) && currentPage !== 'home') {
      setCurrentPage('home');
      setSearchParams({ page: 'home' });
    }
  }, [enabledModules, currentPage, isEnabled, setSearchParams, modulesLoading]);

  useScrollToTop(currentPage);

  useEffect(() => {
    if (sessionStorage.getItem('tawdeen-show-update-toast') === 'true') {
      sessionStorage.removeItem('tawdeen-show-update-toast');
      setTimeout(() => {
        toast.success(t('system.updateToast3'), { duration: 5000 });
      }, 1500);
    }
  }, [t]);

  const {
    funds, fundsLoading, transactions, transactionsLoading,
    hasMoreTransactions, projects, projectsLoading, projectsHasMore,
    projectsLoadingMore, loadMoreProjects,
    addTransaction, updateTransaction, deleteTransaction, loadMoreTransactions,
    addFund, addProject, updateProject, deleteProject,
    getFundOptions, getAccountOptions, getProjectStats,
    getMonthlyTrend, getExpenseBreakdown, exportData, importData, transferFunds, refreshAll,
  } = useSupabaseFinance();

  const { currencies, updateExchangeRate } = useCurrencies();
  const { containers, shipments } = useSupabaseShipping();
  const { contacts } = useSupabaseContacts();
  const { summary: productionSummary } = useProduction();
  const productionEnabled = isEnabled('production');

  // ✅ المصدر الموحد للأرقام: نداء RPC واحد محسوب في الخادم
  const { snapshot } = useDashboardSnapshot();

  // الإيرادات/المصاريف من العمليات النقدية فقط (للـ business view)
  const { directRevenue, businessExpenses } = useBusinessTransactions(transactions, {
    extraRevenue: productionEnabled ? productionSummary.totalSales : 0,
    extraExpenses: productionEnabled ? (productionSummary.totalCost + productionSummary.totalExpenses) : 0,
  });

  const fundLinkedTransactions = transactions.filter(t => t.fundId && t.fundId !== '');

  const handleOpenForm = (type: TransactionType = 'in') => {
    setDefaultTransactionType(type);
    setEditingTransaction(null);
    setShowTransactionForm(true);
  };

  const handleNavigate = (page: PageType) => {
    if (page !== currentPage) {
      setCurrentPage(page);
      setSearchParams({ page });
    }
  };

  // ✅ كل الإحصائيات من snapshot — مصدر واحد، أرقام موحدة في كل الشاشات
  const stats = useMemo(() => ({
    totalLiquidity: snapshot.totalLiquidity,
    netCompanyProfit: snapshot.netCompanyProfit,
    totalExpenses: snapshot.totalExpenses,
    totalReceivables: snapshot.totalReceivables,
    totalPayables: snapshot.totalPayables,
    liquidityChange: 0,
    profitChange: 0,
  }), [snapshot]);

  const fundOptions = useMemo(() => getFundOptions(), [getFundOptions]);
  const accountOptions = useMemo(() => getAccountOptions(), [getAccountOptions]);
  const projectStats = useMemo(() => getProjectStats(), [getProjectStats]);
  const monthlyTrend = useMemo(() => getMonthlyTrend(), [getMonthlyTrend]);
  const expenseBreakdown = useMemo(() => getExpenseBreakdown(), [getExpenseBreakdown]);

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setDefaultTransactionType(transaction.type);
    setShowTransactionForm(true);
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    const tx = transactions.find(t => t.id === transactionId);
    if (tx && user) {
      await supabase.from('activity_log').insert({
        user_id: user.id,
        event_type: 'transaction_deleted',
        entity_type: 'transaction',
        entity_id: transactionId,
        entity_name: tx.description || 'عملية مالية',
        details: { amount: tx.amount, type: tx.type, category: tx.category, date: tx.date },
        status: 'deleted',
      } as any);
    }
    await deleteTransaction(transactionId);
  };

  const renderPage = () => {
    // حماية إضافية: إن كان القسم معطّلاً، اعرض الرئيسية
    if (currentPage !== 'home' && !isEnabled(currentPage as ModuleKey)) {
      return (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {t('system.moduleDisabled')}
        </div>
      );
    }
    switch (currentPage) {
      case 'home':
        if (fundsLoading && transactionsLoading) return <StatsSkeleton />;
        return (
          <Dashboard 
            stats={stats} 
            transactions={fundLinkedTransactions}
            allTransactions={transactions}
            monthlyTrend={monthlyTrend} 
            expenseBreakdown={expenseBreakdown}
            currencies={currencies}
            onUpdateRate={updateExchangeRate}
            onEditTransaction={perms.canEdit('transactions') ? handleEditTransaction : undefined}
            onDeleteTransaction={perms.canDelete('transactions') ? handleDeleteTransaction : undefined}
            hasMore={hasMoreTransactions}
            onLoadMore={loadMoreTransactions}
            ledgerDebit={snapshot.ledgerDebit}
            ledgerCredit={snapshot.ledgerCredit}
            ledgerNet={snapshot.ledgerNet}
            projectProfit={snapshot.projectProfit}
            containerProfit={snapshot.containerProfit}
            directRevenue={directRevenue}
            businessExpenses={businessExpenses}
            onExpensesClick={() => handleNavigate('business')}
            showLedger={isEnabled('accounts')}
            showProjects={isEnabled('projects')}
            showShipping={isEnabled('shipping')}
            showBusiness={isEnabled('business')}
            showFunds={isEnabled('funds')}
            showProduction={isEnabled('production')}
            productionSales={snapshot.productionSales}
            productionMaterialsValue={snapshot.productionMaterialsValue}
            productionProductsValue={snapshot.productionProductsValue}
          />
        );
      case 'funds':
        if (fundsLoading) return <ListSkeleton />;
        return <FundsPage funds={funds} onAddFund={perms.canCreate('funds') ? addFund : undefined} onTransferFunds={perms.canEdit('funds') ? transferFunds : undefined} onRefresh={refreshAll} />;
      case 'accounts':
        return <LedgerAccountsPage />;
      case 'business':
        return (
          <BusinessPage
            transactions={transactions}
            fundOptions={fundOptions}
            accountOptions={accountOptions}
            currencies={currencies}
            onAddTransaction={perms.canCreate('transactions') ? addTransaction : undefined}
            onEditTransaction={perms.canEdit('transactions') ? handleEditTransaction : undefined}
            onDeleteTransaction={perms.canDelete('transactions') ? handleDeleteTransaction : undefined}
          />
        );
      case 'projects':
        if (projectsLoading) return <><StatsSkeleton /><ListSkeleton /></>;
        return (
          <ProjectsPage 
            projects={projects} 
            accountOptions={accountOptions}
            stats={projectStats}
            currencies={currencies}
            transactions={transactions}
            onAddProject={perms.canCreate('projects') ? addProject : undefined}
            onUpdateProject={perms.canEdit('projects') ? updateProject : undefined}
            onDeleteProject={perms.canDelete('projects') ? deleteProject : undefined}
            onRefresh={refreshAll}
            hasMore={projectsHasMore}
            loadingMore={projectsLoadingMore}
            onLoadMore={loadMoreProjects}
          />
        );
      case 'reports':
        return (
          <ReportsPage
            transactions={transactions}
            funds={funds}
            contacts={accountOptions}
            exportData={exportData}
            importData={importData}
            containers={containers}
            shipments={shipments}
            projects={projects}
            projectStats={projectStats}
            stats={stats}
            currencies={currencies}
          />
        );
      case 'shipping':
        return <ShippingPage />;
      case 'production':
        return <ProductionPage />;
      default:
        return <Dashboard stats={stats} transactions={fundLinkedTransactions} monthlyTrend={monthlyTrend} expenseBreakdown={expenseBreakdown} />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Sidebar currentPage={currentPage} onNavigate={handleNavigate} />

      <div className={cn(
        "flex-1 flex flex-col min-h-screen transition-all duration-300",
        dir === 'rtl' ? "md:mr-64" : "md:ml-64"
      )}>
        <Header />
        <main className="container max-w-lg mx-auto px-3 py-3 pb-24 md:max-w-4xl lg:max-w-5xl">
          {renderPage()}
        </main>
        {!showTransactionForm && perms.canCreate('transactions') && <FloatingAddButton onClick={() => handleOpenForm('in')} />}
        <div className="md:hidden">
          <BottomNav currentPage={currentPage} onNavigate={handleNavigate} />
        </div>
      </div>

      <AnimatePresence>
        {showTransactionForm && perms.canCreate('transactions') && (
          <TransactionForm
            fundOptions={fundOptions}
            accountOptions={accountOptions}
            onSubmit={editingTransaction 
              ? async (data) => { await updateTransaction(editingTransaction.id, data); }
              : addTransaction
            }
            onClose={() => { setShowTransactionForm(false); setEditingTransaction(null); }}
            defaultType={defaultTransactionType}
            currencies={currencies}
            editTransaction={editingTransaction}
          />
        )}
      </AnimatePresence>

      <CoachMarks />
    </div>
  );
};

export default Index;

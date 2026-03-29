import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { FloatingAddButton } from '@/components/layout/FloatingAddButton';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { FundsPage } from '@/components/funds/FundsPage';
import { LedgerAccountsPage } from '@/components/ledger/LedgerAccountsPage';
import { ReportsPage } from '@/components/reports/ReportsPage';
import { ShippingPage } from '@/components/shipping/ShippingPage';
import { ProjectsPage } from '@/components/projects/ProjectsPage';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { CoachMarks } from '@/components/onboarding/CoachMarks';
import { useSupabaseFinance } from '@/hooks/useSupabaseFinance';
import { useSupabaseShipping } from '@/hooks/useSupabaseShipping';
import { useCurrencies } from '@/hooks/useCurrencies';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { useUserRole } from '@/hooks/useUserRole';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { TransactionType, Transaction } from '@/types/finance';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

type PageType = 'home' | 'funds' | 'accounts' | 'projects' | 'reports' | 'shipping';

// Skeleton loader for stats cards
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

// Skeleton for list items
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
  const { canEdit: roleCanEdit, isViewer } = useUserRole();
  const perms = useUserPermissions();
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

  useScrollToTop(currentPage);

  // إشعار التحديث
  useEffect(() => {
    if (sessionStorage.getItem('tawdeen-show-update-toast') === 'true') {
      sessionStorage.removeItem('tawdeen-show-update-toast');
      setTimeout(() => {
        toast.success('تم تحديث توطين للنسخة 2.8 - حماية القيود المحاسبية + حذف عمليات الصندوق + تحسينات شاملة', { duration: 5000 });
      }, 1500);
    }
  }, []);

  const {
    funds,
    fundsLoading,
    transactions,
    transactionsLoading,
    hasMoreTransactions,
    projects,
    projectsLoading,
    projectsHasMore,
    projectsLoadingMore,
    loadMoreProjects,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    loadMoreTransactions,
    addFund,
    addProject,
    updateProject,
    deleteProject,
    getStats,
    getFundOptions,
    getAccountOptions,
    getProjectStats,
    getMonthlyTrend,
    getExpenseBreakdown,
    exportData,
    importData,
    transferFunds,
    refreshAll,
  } = useSupabaseFinance();

  const { currencies, updateExchangeRate } = useCurrencies();
  const { containers, shipments } = useSupabaseShipping();

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

  const stats = getStats();
  const fundOptions = getFundOptions();
  const accountOptions = getAccountOptions();
  const projectStats = getProjectStats();
  const monthlyTrend = getMonthlyTrend();
  const expenseBreakdown = getExpenseBreakdown();

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setDefaultTransactionType(transaction.type);
    setShowTransactionForm(true);
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    // Log deletion to activity log before deleting
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
          />
        );
      case 'funds':
        if (fundsLoading) return <ListSkeleton />;
        return <FundsPage funds={funds} onAddFund={perms.canCreate('funds') ? addFund : undefined} onTransferFunds={perms.canEdit('funds') ? transferFunds : undefined} onRefresh={refreshAll} />;
      case 'accounts':
        return <LedgerAccountsPage />;
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
      default:
        return <Dashboard stats={stats} transactions={fundLinkedTransactions} monthlyTrend={monthlyTrend} expenseBreakdown={expenseBreakdown} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-lg mx-auto px-3 py-3 pb-24">
        {renderPage()}
      </main>
      {!showTransactionForm && perms.canCreate('transactions') && <FloatingAddButton onClick={() => handleOpenForm('in')} />}
      <BottomNav currentPage={currentPage} onNavigate={handleNavigate} />

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

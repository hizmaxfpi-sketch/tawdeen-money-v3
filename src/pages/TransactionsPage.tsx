import { useTransactions } from "@/hooks/useTransactions";
import { UnifiedTransactionLog } from "@/components/shared/UnifiedTransactionLog";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { useLanguage } from "@/i18n/LanguageContext";
import { cn } from "@/lib/utils";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useNavigate } from "react-router-dom";
import { Transaction } from "@/types/finance";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { useSupabaseFinance } from "@/hooks/useSupabaseFinance";
import { useUserPermissions } from "@/hooks/useUserPermissions";

const TransactionsPage = () => {
  const { dir, t } = useLanguage();
  const navigate = useNavigate();
  const {
    transactions,
    loading,
    hasMore,
    loadMore,
    updateTransaction,
    deleteTransaction
  } = useTransactions();
  const { currencies } = useCurrencies();
  const { getFundOptions, getAccountOptions } = useSupabaseFinance();
  const perms = useUserPermissions();

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleEdit = (tx: Transaction) => {
    setEditingTransaction(tx);
    setShowForm(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Sidebar currentPage="home" onNavigate={(page) => navigate(`/?page=${page}`)} />

      <div className={cn(
        "flex-1 flex flex-col min-h-screen transition-all duration-300",
        dir === 'rtl' ? "md:mr-64" : "md:ml-64"
      )}>
        <Header />
        <main className="container max-w-lg mx-auto px-3 py-3 pb-24 md:max-w-4xl lg:max-w-5xl">
          <div className="space-y-4">
            <h1 className="text-xl font-bold">{t('finance.transactions')}</h1>

            <UnifiedTransactionLog
              transactions={transactions}
              loading={loading}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onEditTransaction={perms.canEdit('transactions') ? handleEdit : undefined}
              onDeleteTransaction={perms.canDelete('transactions') ? deleteTransaction : undefined}
              currencies={currencies}
              showDateRange={true}
              storageKey="all_transactions"
            />
          </div>
        </main>
        <div className="md:hidden">
          <BottomNav currentPage="home" onNavigate={(page) => navigate(`/?page=${page}`)} />
        </div>
      </div>

      <AnimatePresence>
        {showForm && editingTransaction && (
          <TransactionForm
            fundOptions={getFundOptions()}
            accountOptions={getAccountOptions()}
            editTransaction={editingTransaction}
            onSubmit={async (data) => {
              await updateTransaction(editingTransaction.id, data);
              setShowForm(false);
              setEditingTransaction(null);
            }}
            onClose={() => {
              setShowForm(false);
              setEditingTransaction(null);
            }}
            currencies={currencies}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default TransactionsPage;

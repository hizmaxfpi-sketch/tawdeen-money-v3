import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpCircle, ArrowDownCircle, Filter, Search, ChevronDown, Edit3, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Transaction } from '@/types/finance';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TransactionLogProps {
  transactions: Transaction[];
  onEditTransaction?: (transaction: Transaction) => void;
}

export function TransactionLog({ transactions, onEditTransaction }: TransactionLogProps) {
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredTransactions = transactions.filter(t => {
    const matchesType = filter === 'all' || t.type === filter;
    const matchesSearch = t.description.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Auto-collapse on scroll or click outside
  useEffect(() => {
    const handleScroll = () => {
      if (expandedId) setExpandedId(null);
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (expandedId && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpandedId(null);
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedId]);

  const handleTransactionClick = (transaction: Transaction) => {
    if (expandedId === transaction.id) {
      // Second click on expanded item - open edit modal
      setEditingTransaction(transaction);
    } else {
      // First click - expand
      setExpandedId(transaction.id);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      client_collection: 'تحصيل عميل',
      vendor_payment: 'دفع مورد',
      expense: 'مصروفات',
      partner_payment: 'دفع شريك',
      partner_collection: 'تحصيل شريك',
      fund_transfer: 'تحويل',
      production_expense: 'مصروف بيع إنتاج',
      other: 'أخرى',
    };
    return labels[category] || category;
  };

  return (
    <div ref={containerRef} className="rounded-xl bg-card p-3 shadow-sm border border-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold">سجل العمليات</h3>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn("p-1.5 rounded-md transition-colors", showFilters ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          <Filter className="h-4 w-4" />
        </button>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="h-9 text-sm pr-9" />
              </div>
              <div className="flex gap-1.5">
                {(['all', 'in', 'out'] as const).map((type) => (
                  <button key={type} onClick={() => setFilter(type)} className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-colors", filter === type ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80")}>
                    {type === 'all' ? 'الكل' : type === 'in' ? 'مدين' : 'دائن'}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-1.5 max-h-[320px] overflow-y-auto scrollbar-hide">
        {filteredTransactions.length === 0 ? (
          <p className="text-center py-6 text-sm text-muted-foreground">لا توجد عمليات</p>
        ) : (
          filteredTransactions.slice(0, 15).map((transaction, index) => {
            const isExpanded = expandedId === transaction.id;
            return (
              <motion.div
                key={transaction.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => handleTransactionClick(transaction)}
                className={cn(
                  "cursor-pointer rounded-lg transition-all duration-300 border",
                  isExpanded 
                    ? "bg-accent/50 border-primary/30 shadow-md" 
                    : "bg-transparent border-transparent hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2.5 p-2">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-full shrink-0", transaction.type === 'in' ? "bg-income-light" : "bg-expense-light")}>
                    {transaction.type === 'in' ? <ArrowUpCircle className="h-4 w-4 text-income" /> : <ArrowDownCircle className="h-4 w-4 text-expense" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{transaction.description}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{getCategoryLabel(transaction.category)}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{formatDate(transaction.date)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold", transaction.type === 'in' ? "text-income" : "text-expense")}>
                      {transaction.type === 'in' ? '+' : '-'}${transaction.amount.toLocaleString()}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </div>
                
                {/* Expanded Content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">التاريخ:</span>
                            <span className="mr-1 font-medium">{new Date(transaction.date).toLocaleDateString('ar-SA')}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">النوع:</span>
                            <span className="mr-1 font-medium">{transaction.type === 'in' ? 'مدين' : 'دائن'}</span>
                          </div>
                        </div>
                        {transaction.notes && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">ملاحظات:</span>
                            <p className="mt-0.5 text-foreground bg-muted/50 p-2 rounded">{transaction.notes}</p>
                          </div>
                        )}
                        <div className="flex items-center justify-center pt-1">
                          <span className="text-xs text-primary flex items-center gap-1">
                            <Edit3 className="h-3 w-3" />
                            اضغط مرة أخرى للتعديل
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editingTransaction} onOpenChange={(open) => !open && setEditingTransaction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تعديل العملية</DialogTitle>
          </DialogHeader>
          {editingTransaction && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", editingTransaction.type === 'in' ? "bg-income-light" : "bg-expense-light")}>
                    {editingTransaction.type === 'in' ? <ArrowUpCircle className="h-5 w-5 text-income" /> : <ArrowDownCircle className="h-5 w-5 text-expense" />}
                  </div>
                  <div>
                    <p className="font-medium">{editingTransaction.description}</p>
                    <p className={cn("text-lg font-bold", editingTransaction.type === 'in' ? "text-income" : "text-expense")}>
                      {editingTransaction.type === 'in' ? '+' : '-'}${editingTransaction.amount.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">التصنيف:</span>
                    <span>{getCategoryLabel(editingTransaction.category)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">التاريخ:</span>
                    <span>{new Date(editingTransaction.date).toLocaleDateString('ar-SA')}</span>
                  </div>
                  {editingTransaction.notes && (
                    <div>
                      <span className="text-muted-foreground">ملاحظات:</span>
                      <p className="mt-1 p-2 bg-background rounded text-xs">{editingTransaction.notes}</p>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                خاصية التعديل الكامل قيد التطوير
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
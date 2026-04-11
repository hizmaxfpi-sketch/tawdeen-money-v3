import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowRight, Edit2, Trash2, TrendingUp, TrendingDown, 
  Briefcase, User, Building, Clock, CheckCircle, AlertCircle,
  Calendar, Plus, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BottomNav } from '@/components/layout/BottomNav';
import { UnifiedTransactionLog } from '@/components/shared/UnifiedTransactionLog';
import { useSupabaseFinance } from '@/hooks/useSupabaseFinance';
import { useCurrencies, CURRENCY_FLAGS, DEFAULT_APP_CURRENCY } from '@/hooks/useCurrencies';
import { Project, ProjectStatus, Transaction } from '@/types/finance';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const statusConfig: Record<ProjectStatus, { label: string; color: string; icon: typeof Clock }> = {
  active: { label: 'قيد التنفيذ', color: 'bg-blue-500 text-white', icon: Clock },
  completed: { label: 'منجز', color: 'bg-emerald-500 text-white', icon: CheckCircle },
  paused: { label: 'متوقف', color: 'bg-amber-500 text-white', icon: AlertCircle },
  cancelled: { label: 'ملغي', color: 'bg-red-500 text-white', icon: X },
};

export function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { 
    projects, 
    transactions, 
    funds, 
    addTransaction, 
    deleteTransaction,
    updateProject,
    deleteProject,
    getFundOptions 
  } = useSupabaseFinance();
  const { currencies } = useCurrencies();
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionType, setTransactionType] = useState<'credit' | 'debit'>('credit');

  // حقول نموذج العملية المالية
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [txDescription, setTxDescription] = useState('');
  const [txFundId, setTxFundId] = useState<string>('');
  const [txCurrencyCode, setTxCurrencyCode] = useState('USD');
  const [txManualExchangeRate, setTxManualExchangeRate] = useState('');

  const project = useMemo(() => projects.find(p => p.id === id), [projects, id]);
  
  const fundOptions = getFundOptions();

  // العمليات المالية المرتبطة بهذا المشروع (عبر projectId)
  const projectTransactions = useMemo(() => {
    if (!project) return [];
    return transactions.filter(t => (t as any).projectId === project.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [project, transactions]);

  // الإحصائيات
  const stats = useMemo(() => {
    const totalCredit = projectTransactions
      .filter(t => t.type === 'in')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalDebit = projectTransactions
      .filter(t => t.type === 'out')
      .reduce((sum, t) => sum + t.amount, 0);
    return { 
      totalCredit, // مدين للمشروع
      totalDebit,  // دائن من المشروع
      transactionCount: projectTransactions.length,
      balance: totalCredit - totalDebit
    };
  }, [projectTransactions]);

  // حساب معامل الصرف الفعلي
  const centralizedRate = useMemo(() => {
    if (txCurrencyCode === 'USD') return 1;
    const currency = currencies.find(c => c.code === txCurrencyCode);
    return currency?.exchangeRate || 1;
  }, [txCurrencyCode, currencies]);

  const effectiveRate = useMemo(() => {
    if (txManualExchangeRate) {
      const parsed = parseFloat(txManualExchangeRate);
      return parsed > 0 ? parsed : centralizedRate;
    }
    return centralizedRate;
  }, [txManualExchangeRate, centralizedRate]);

  const usdEquivalent = useMemo(() => {
    const amt = parseFloat(txAmount);
    if (!amt || txCurrencyCode === 'USD') return null;
    return amt / effectiveRate;
  }, [txAmount, txCurrencyCode, effectiveRate]);

  const selectedCurrency = currencies.find(c => c.code === txCurrencyCode) || DEFAULT_APP_CURRENCY;

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">المشروع المطلوب غير موجود</p>
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>
        </div>
      </div>
    );
  }

  const StatusIcon = statusConfig[project.status].icon;

  const handleDelete = async () => {
    await deleteProject(project.id);
    navigate('/?page=projects');
    setShowDeleteDialog(false);
  };

  const handleOpenTransactionForm = (type: 'credit' | 'debit') => {
    setTransactionType(type);
    setTxAmount('');
    const now = new Date();
    setTxDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
    setTxDescription('');
    setTxFundId('');
    setTxCurrencyCode('USD');
    setTxManualExchangeRate('');
    setShowTransactionForm(true);
  };

  const handleAddTransaction = async () => {
    const amount = parseFloat(txAmount);
    if (!amount || amount <= 0 || !txDescription.trim()) return;

    const txType = transactionType === 'credit' ? 'in' : 'out';
    const category = transactionType === 'credit' ? 'client_collection' : 'expense';
    
    const finalAmount = txCurrencyCode === 'USD' ? amount : amount / effectiveRate;
    
    await addTransaction({
      type: txType,
      amount: Number(finalAmount.toFixed(4)),
      date: txDate,
      category: category,
      description: txDescription.trim(),
      fundId: txFundId || '',
      projectId: project.id,
      currencyCode: txCurrencyCode,
      exchangeRate: effectiveRate,
    } as any);

    setShowTransactionForm(false);
  };

  const handleDeleteTransaction = (transactionId: string) => {
    deleteTransaction(transactionId);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-primary text-primary-foreground shadow-lg">
        <div className="container flex h-14 items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-primary-foreground/10">
            <ArrowRight className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-bold flex-1">السجل المالي للمشروع</h1>
        </div>
      </header>

      <main className="container max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Project Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-card p-4 shadow-sm border border-border"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full",
              statusConfig[project.status].color
            )}>
              <Briefcase className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold">{project.name}</h2>
              <Badge variant="outline" className={cn("text-[10px] mt-1", statusConfig[project.status].color, "border-0")}>
                {statusConfig[project.status].label}
              </Badge>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                {project.clientName && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {project.clientName}
                  </span>
                )}
                {project.vendorName && (
                  <span className="flex items-center gap-1">
                    <Building className="h-3 w-3" />
                    {project.vendorName}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Balance Display */}
          <div className="text-center py-4 border-y border-border">
            <p className="text-xs text-muted-foreground mb-1">الربح الحالي</p>
            <p className={cn("text-2xl font-bold", project.profit >= 0 ? "text-emerald-600" : "text-rose-600")}>
              ${project.profit.toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              قيمة العقد: ${project.contractValue.toLocaleString()}
            </p>
          </div>

          {/* Project Details */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-muted/50 p-2 rounded-lg">
              <span className="text-muted-foreground">التكاليف</span>
              <p className="font-medium">${project.expenses.toLocaleString()}</p>
            </div>
            <div className="bg-muted/50 p-2 rounded-lg">
              <span className="text-muted-foreground">المستلم</span>
              <p className="font-medium">${project.receivedAmount.toLocaleString()}</p>
            </div>
            {project.commission > 0 && (
              <div className="bg-muted/50 p-2 rounded-lg">
                <span className="text-muted-foreground">العمولة</span>
                <p className="font-medium text-emerald-600">+${project.commission.toLocaleString()}</p>
              </div>
            )}
            {project.startDate && (
              <div className="bg-muted/50 p-2 rounded-lg">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  تاريخ البدء
                </span>
                <p className="font-medium">{project.startDate}</p>
              </div>
            )}
          </div>

          {project.notes && (
            <p className="mt-3 text-sm text-muted-foreground bg-muted p-3 rounded-lg">{project.notes}</p>
          )}
        </motion.div>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl bg-card p-3 shadow-sm border border-border text-center"
          >
            <div className="flex justify-center mb-2">
              <TrendingUp className="h-4 w-4 text-income" />
            </div>
            <p className="text-base font-bold text-income">${stats.totalCredit.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">إجمالي مدين</p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-xl bg-card p-3 shadow-sm border border-border text-center"
          >
            <div className="flex justify-center mb-2">
              <TrendingDown className="h-4 w-4 text-expense" />
            </div>
            <p className="text-base font-bold text-expense">${stats.totalDebit.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">إجمالي دائن</p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl bg-card p-3 shadow-sm border border-border text-center"
          >
            <p className="text-base font-bold mt-2">{stats.transactionCount}</p>
            <p className="text-[11px] text-muted-foreground">عدد العمليات</p>
          </motion.div>
        </div>

        {/* Transaction Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex gap-3"
        >
          <Button 
            onClick={() => handleOpenTransactionForm('credit')}
            className="flex-1 gap-1.5 h-9 text-xs bg-green-600 hover:bg-green-700 text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            إيراد للمشروع
          </Button>
          <Button 
            onClick={() => handleOpenTransactionForm('debit')}
            className="flex-1 gap-1.5 h-9 text-xs bg-rose-600 hover:bg-rose-700 text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            مصروف من المشروع
          </Button>
        </motion.div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowDeleteDialog(true)} className="flex-1 gap-2 h-9 text-xs text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            حذف المشروع
          </Button>
        </div>

        {/* Transaction History */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <UnifiedTransactionLog 
            transactions={projectTransactions}
            title="سجل العمليات المالية للمشروع"
            showExport={true}
            maxHeight="400px"
            onDeleteTransaction={handleDeleteTransaction}
            currencies={currencies}
          />
        </motion.div>
      </main>

      {/* Bottom Nav */}
      <BottomNav currentPage="projects" onNavigate={(page) => navigate(`/?page=${page}`)} />

      {/* Transaction Form Dialog */}
      <Dialog open={showTransactionForm} onOpenChange={setShowTransactionForm}>
        <DialogContent className="max-w-sm z-[100]">
          <DialogHeader>
            <DialogTitle className={transactionType === 'credit' ? 'text-green-600' : 'text-rose-600'}>
              {transactionType === 'credit' ? 'إضافة إيراد للمشروع' : 'إضافة مصروف من المشروع'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* العملة والمبلغ */}
            <div className="flex gap-2">
              {currencies.length > 0 && (
                <div className="w-[100px]">
                  <label className="block text-sm text-muted-foreground mb-1">العملة</label>
                  <Select value={txCurrencyCode} onValueChange={(val) => { setTxCurrencyCode(val); setTxManualExchangeRate(''); }}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[110] bg-popover">
                      {currencies.map(c => (
                        <SelectItem key={c.code} value={c.code} className="text-xs">
                          <span className="flex items-center gap-1">
                            <span>{CURRENCY_FLAGS[c.code] || '💱'}</span>
                            <span className="font-medium">{c.code}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex-1">
                <label className="block text-sm text-muted-foreground mb-1">المبلغ ({selectedCurrency.symbol}) *</label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-bold">
                    {selectedCurrency.symbol}
                  </span>
                  <Input 
                    type="number" 
                    value={txAmount} 
                    onChange={(e) => setTxAmount(e.target.value)} 
                    placeholder="0.00"
                    className="text-lg pr-9"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* معامل الصرف */}
            {txCurrencyCode !== 'USD' && (
              <div className="rounded-lg bg-muted/40 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">معامل الصرف</span>
                  <span className="text-[10px] text-primary">
                    المركزي: {centralizedRate.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={txManualExchangeRate || centralizedRate.toString()}
                    onChange={(e) => setTxManualExchangeRate(e.target.value)}
                    className="h-8 text-xs flex-1"
                    dir="ltr"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {selectedCurrency.symbol} = $1
                  </span>
                </div>
                {usdEquivalent !== null && (
                  <p className="text-xs text-primary font-medium text-center">
                    ≈ ${usdEquivalent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm text-muted-foreground mb-1">التاريخ *</label>
              <Input 
                type="date" 
                value={txDate} 
                onChange={(e) => setTxDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">الوصف *</label>
              <Textarea 
                value={txDescription} 
                onChange={(e) => setTxDescription(e.target.value)}
                placeholder="وصف العملية المالية..."
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">الصندوق (اختياري)</label>
              <Select value={txFundId || 'none'} onValueChange={(val) => setTxFundId(val === 'none' ? '' : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="-- بدون صندوق (قيد فقط) --" />
                </SelectTrigger>
                <SelectContent className="z-[110] bg-popover">
                  <SelectItem value="none">-- بدون صندوق (قيد فقط) --</SelectItem>
                  {fundOptions.map(fund => (
                    <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {txFundId 
                  ? 'سيتم التأثير على رصيد الصندوق والمشروع معاً' 
                  : 'سيتم تسجيل قيد في المشروع فقط'}
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowTransactionForm(false)}>إلغاء</Button>
            <Button 
              onClick={handleAddTransaction}
              disabled={!txAmount || parseFloat(txAmount) <= 0 || !txDescription.trim()}
              className={transactionType === 'credit' ? 'bg-green-600 hover:bg-green-700' : 'bg-rose-600 hover:bg-rose-700'}
            >
              إضافة العملية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف المشروع "{project.name}" نهائياً. هذا الإجراء لا يمكن التراجع عنه.
              {projectTransactions.length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  ⚠️ يوجد {projectTransactions.length} عملية مالية مرتبطة بهذا المشروع
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

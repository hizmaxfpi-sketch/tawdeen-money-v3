import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { ArrowUpRight, ArrowDownRight, Plus, CheckCircle2, Clock, AlertCircle, Wallet, Download, FileText, FileSpreadsheet, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Debt, AccountOption, FundOption } from '@/types/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface DebtsPageProps {
  debts: Debt[];
  accountOptions: AccountOption[];
  fundOptions: FundOption[];
  onAddDebt: (debt: Omit<Debt, 'id' | 'createdAt' | 'payments' | 'status'>) => void;
  onPayDebt: (debtId: string, amount: number, fundId: string, note?: string) => void;
  onUpdateDebt?: (id: string, updates: { type?: 'receivable' | 'payable'; accountId?: string; amount?: number; description?: string; dueDate?: string }) => void;
  onDeleteDebt?: (id: string) => void;
}

export function DebtsPage({ debts, accountOptions, fundOptions, onAddDebt, onPayDebt, onUpdateDebt, onDeleteDebt }: DebtsPageProps) {
  const perms = useUserPermissions();
  const canEdit = perms.canEdit('debts');
  const canDelete = perms.canDelete('debts');
  const canCreate = perms.canCreate('debts');
  const [activeTab, setActiveTab] = useState<'receivable' | 'payable'>('receivable');
  const [showAddForm, setShowAddForm] = useState(false);
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payFundId, setPayFundId] = useState('');
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);

  // حالات التعديل والحذف
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [deleteConfirmDebt, setDeleteConfirmDebt] = useState<Debt | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editAccountId, setEditAccountId] = useState('');

  const [newType, setNewType] = useState<'receivable' | 'payable'>('receivable');
  const [newFundId, setNewFundId] = useState(''); // الصندوق الذي ستسجل فيه العملية
  const [newFromAccountId, setNewFromAccountId] = useState(''); // من حساب (للتحويلات الداخلية)
  const [newToAccountId, setNewToAccountId] = useState(''); // إلى حساب (للتحويلات الداخلية)
  const [newAmount, setNewAmount] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  const receivables = debts.filter(d => d.type === 'receivable' && d.status !== 'paid');
  const payables = debts.filter(d => d.type === 'payable' && d.status !== 'paid');

  const totalReceivables = receivables.reduce((sum, d) => sum + d.remainingAmount, 0);
  const totalPayables = payables.reduce((sum, d) => sum + d.remainingAmount, 0);
  const netBalance = totalReceivables - totalPayables;

  const getStatusConfig = (debt: Debt) => {
    if (debt.status === 'paid') return { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', label: 'مسدد' };
    if (debt.status === 'partial') return { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', label: 'جزئي' };
    return { icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30', label: 'معلق' };
  };

  const handleAddDebt = () => {
    if (!newFundId || !newAmount || !newDescription) return;
    const fund = fundOptions.find(f => f.id === newFundId);
    const fromAccount = accountOptions.find(a => a.id === newFromAccountId && newFromAccountId !== 'none');
    const toAccount = accountOptions.find(a => a.id === newToAccountId && newToAccountId !== 'none');
    
    // اسم الحساب يكون من الحساب المصدر أو الحساب الهدف
    const accountName = fromAccount?.name || toAccount?.name || fund?.name || '';
    const accountId = fromAccount?.id || toAccount?.id || undefined;
    
    onAddDebt({
      type: newType,
      accountId: accountId,
      accountName: accountName,
      amount: parseFloat(newAmount),
      remainingAmount: parseFloat(newAmount),
      description: newDescription,
      dueDate: newDueDate || undefined,
    });

    resetForm();
  };

  const handlePay = (debtId: string) => {
    if (!payAmount || !payFundId) return;
    onPayDebt(debtId, parseFloat(payAmount), payFundId);
    setPayingDebtId(null);
    setPayAmount('');
    setPayFundId('');
    toast.success('تم تسجيل عملية السداد بنجاح');
  };

  const resetForm = () => {
    setShowAddForm(false);
    setNewFundId('');
    setNewFromAccountId('');
    setNewToAccountId('');
    setNewAmount('');
    setNewDescription('');
    setNewDueDate('');
  };

  const handleDebtClick = (debt: Debt) => {
    if (expandedDebtId === debt.id) {
      setSelectedDebt(debt);
    } else {
      setExpandedDebtId(debt.id);
    }
  };

  const handleExportPayments = (format: 'pdf' | 'excel') => {
    toast.success(`جاري تصدير سجل السداد كـ ${format.toUpperCase()}...`);
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // فتح نموذج التعديل
  const handleEditClick = (e: React.MouseEvent, debt: Debt) => {
    e.stopPropagation();
    setEditingDebt(debt);
    setEditAmount(debt.amount.toString());
    setEditDescription(debt.description);
    setEditDueDate(debt.dueDate || '');
    setEditAccountId(debt.accountId || '');
  };

  // تأكيد التعديل
  const handleUpdateDebt = () => {
    if (!editingDebt || !onUpdateDebt) return;
    onUpdateDebt(editingDebt.id, {
      amount: parseFloat(editAmount),
      description: editDescription,
      dueDate: editDueDate || undefined,
      accountId: editAccountId || undefined,
    });
    setEditingDebt(null);
  };

  // فتح تأكيد الحذف
  const handleDeleteClick = (e: React.MouseEvent, debt: Debt) => {
    e.stopPropagation();
    setDeleteConfirmDebt(debt);
  };

  // تأكيد الحذف
  const handleConfirmDelete = () => {
    if (!deleteConfirmDebt || !onDeleteDebt) return;
    onDeleteDebt(deleteConfirmDebt.id);
    setDeleteConfirmDebt(null);
    setExpandedDebtId(null);
  };

  const activeDebts = activeTab === 'receivable' ? receivables : payables;

  return (
    <div className="space-y-3">
      {/* Summary Card */}
      <div className="rounded-xl bg-card p-3 shadow-sm border border-border">
        <div className="text-center mb-3">
          <p className="text-xs text-muted-foreground mb-0.5">صافي العمليات الجارية</p>
          <p className={cn("text-xl font-bold", netBalance >= 0 ? "text-emerald-600" : "text-rose-600")}>
            ${Math.abs(netBalance).toLocaleString()}
            <span className="text-xs mr-1 font-normal">{netBalance >= 0 ? 'لنا' : 'علينا'}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-2 text-center">
            <ArrowUpRight className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">مدين (Debit)</p>
            <p className="text-sm font-bold text-emerald-600">${totalReceivables.toLocaleString()}</p>
          </div>
          <div className="flex-1 bg-rose-50 dark:bg-rose-950/30 rounded-lg p-2 text-center">
            <ArrowDownRight className="h-4 w-4 text-rose-500 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">دائن (Credit)</p>
            <p className="text-sm font-bold text-rose-600">${totalPayables.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Tabs & Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg bg-muted p-0.5">
          <button
            onClick={() => setActiveTab('receivable')}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", activeTab === 'receivable' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            لنا ({receivables.length})
          </button>
          <button
            onClick={() => setActiveTab('payable')}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", activeTab === 'payable' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            علينا ({payables.length})
          </button>
        </div>

        {canCreate && (
          <Button size="sm" onClick={() => { setNewType(activeTab); setShowAddForm(true); }} className="gap-1 h-7 text-xs">
            <Plus className="h-3.5 w-3.5" />
            إضافة
          </Button>
        )}
      </div>

      {/* Debts List */}
      <div className="space-y-2">
        {activeDebts.map((debt, index) => {
          const status = getStatusConfig(debt);
          const progress = ((debt.amount - debt.remainingAmount) / debt.amount) * 100;
          const StatusIcon = status.icon;
          const isExpanded = expandedDebtId === debt.id;

          return (
            <motion.div
              key={debt.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleDebtClick(debt)}
              className={cn(
                "rounded-xl bg-card p-3 shadow-sm border transition-all cursor-pointer",
                isExpanded ? "border-primary/30 shadow-md" : "border-border hover:border-primary/20"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{debt.accountName}</p>
                  <p className="text-xs text-muted-foreground truncate">{debt.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-full", status.bg)}>
                    <StatusIcon className={cn("h-3 w-3", status.color)} />
                    <span className={cn("text-xs font-medium", status.color)}>{status.label}</span>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs text-muted-foreground">المبلغ الكلي: </span>
                  <span className="text-sm font-medium">${debt.amount.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">المتبقي: </span>
                  <span className={cn("text-sm font-bold", activeTab === 'receivable' ? "text-emerald-600" : "text-rose-600")}>
                    ${debt.remainingAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Progress Bar - Different colors based on type */}
              <Progress 
                value={progress} 
                className={cn(
                  "h-2 mb-2",
                  activeTab === 'receivable' 
                    ? "[&>div]:bg-emerald-500" 
                    : "[&>div]:bg-rose-500"
                )} 
              />
              <p className="text-xs text-muted-foreground text-center">{Math.round(progress)}% مكتمل</p>

              {/* Expanded Payment Section */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="pt-3 mt-3 border-t border-border space-y-3">
                      {/* Payment History Summary */}
                      {debt.payments && debt.payments.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          <span>عدد عمليات السداد: {debt.payments.length}</span>
                        </div>
                      )}

                      {payingDebtId === debt.id ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input 
                              type="number" 
                              value={payAmount} 
                              onChange={(e) => setPayAmount(e.target.value)} 
                              placeholder="المبلغ" 
                              className="h-8 text-xs flex-1" 
                            />
                            <Select value={payFundId} onValueChange={setPayFundId}>
                              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="الصندوق" /></SelectTrigger>
                              <SelectContent>{fundOptions.map(f => <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPayingDebtId(null)} className="flex-1 h-8 text-xs">إلغاء</Button>
                            <Button size="sm" onClick={() => handlePay(debt.id)} disabled={!payAmount || !payFundId} className="flex-1 h-8 text-xs">تأكيد</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* صف أزرار السداد والسجل */}
                          <div className="flex gap-2">
                            {canEdit && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={(e) => { 
                                  e.stopPropagation();
                                  setPayingDebtId(debt.id); 
                                  setPayFundId(fundOptions[0]?.id || ''); 
                                }} 
                                className="flex-1 h-8 text-xs gap-1"
                              >
                                <Wallet className="h-3.5 w-3.5" />
                                {activeTab === 'receivable' ? 'تسجيل تحصيل' : 'تسجيل سداد'}
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDebt(debt);
                              }}
                              className="h-8 text-xs"
                            >
                              عرض السجل
                            </Button>
                          </div>
                          
                          {/* صف أزرار التعديل والحذف */}
                          {(canEdit || canDelete) && (
                            <div className="flex gap-2 pt-1 border-t border-border/50">
                              {canEdit && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={(e) => handleEditClick(e, debt)}
                                  className="flex-1 h-8 text-xs gap-1"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  تعديل
                                </Button>
                              )}
                              {canDelete && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={(e) => handleDeleteClick(e, debt)}
                                  className="flex-1 h-8 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  حذف
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}

        {activeDebts.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <div className="h-12 w-12 mx-auto mb-2 rounded-full bg-muted flex items-center justify-center">
              {activeTab === 'receivable' ? <ArrowUpRight className="h-6 w-6 opacity-30" /> : <ArrowDownRight className="h-6 w-6 opacity-30" />}
            </div>
            <p className="text-sm">لا توجد {activeTab === 'receivable' ? 'مديونيات' : 'التزامات'} حالياً</p>
          </div>
        )}
      </div>

      {/* Payment History Modal */}
      <Dialog open={!!selectedDebt} onOpenChange={(open) => !open && setSelectedDebt(null)}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>سجل {selectedDebt?.type === 'receivable' ? 'التحصيل' : 'السداد'}</DialogTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8">
                    <Download className="h-3.5 w-3.5" />
                    تصدير
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border-border">
                  <DropdownMenuItem onClick={() => handleExportPayments('pdf')} className="gap-2 cursor-pointer">
                    <FileText className="h-4 w-4" />
                    تصدير PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportPayments('excel')} className="gap-2 cursor-pointer">
                    <FileSpreadsheet className="h-4 w-4" />
                    تصدير Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </DialogHeader>
          
          {selectedDebt && (
            <div className="space-y-4">
              {/* Debt Summary */}
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{selectedDebt.accountName}</span>
                  <span className={cn("text-sm font-bold", selectedDebt.type === 'receivable' ? "text-emerald-600" : "text-rose-600")}>
                    ${selectedDebt.remainingAmount.toLocaleString()} متبقي
                  </span>
                </div>
                <Progress 
                  value={((selectedDebt.amount - selectedDebt.remainingAmount) / selectedDebt.amount) * 100} 
                  className={cn(
                    "h-2",
                    selectedDebt.type === 'receivable' 
                      ? "[&>div]:bg-emerald-500" 
                      : "[&>div]:bg-rose-500"
                  )} 
                />
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>المحصّل: ${(selectedDebt.amount - selectedDebt.remainingAmount).toLocaleString()}</span>
                  <span>الإجمالي: ${selectedDebt.amount.toLocaleString()}</span>
                </div>
              </div>

              {/* Payments List */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">عمليات {selectedDebt.type === 'receivable' ? 'التحصيل' : 'السداد'}</h4>
                {selectedDebt.payments && selectedDebt.payments.length > 0 ? (
                  selectedDebt.payments.map((payment, index) => (
                    <motion.div
                      key={payment.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center justify-between p-3 rounded-lg bg-card border border-border"
                    >
                      <div>
                        <p className="text-sm font-medium">${payment.amount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(payment.date)}</p>
                        {payment.note && <p className="text-xs text-muted-foreground mt-1">{payment.note}</p>}
                      </div>
                      <div className={cn(
                        "flex items-center justify-center h-8 w-8 rounded-full",
                        selectedDebt.type === 'receivable' ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-rose-50 dark:bg-rose-950/30"
                      )}>
                        {selectedDebt.type === 'receivable' ? (
                          <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-rose-500" />
                        )}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <p className="text-center py-6 text-sm text-muted-foreground">لا توجد عمليات بعد</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Debt Modal - Using Dialog for proper z-index handling */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              إضافة {newType === 'receivable' ? 'مدين' : 'دائن'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2.5">
            {/* الصندوق - الحقل الأول والإلزامي */}
            <div>
              <label className="block text-xs text-muted-foreground mb-0.5">الصندوق *</label>
              <Select value={newFundId} onValueChange={setNewFundId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                <SelectContent>
                  {fundOptions.map(fund => (
                    <SelectItem key={fund.id} value={fund.id} className="text-sm">
                      {fund.name} ({fund.type === 'cash' ? 'نقد' : fund.type === 'bank' ? 'بنك' : 'محفظة'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* التحويلات الداخلية - من حساب / إلى حساب */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-0.5">من حساب (اختياري)</label>
                <Select value={newFromAccountId} onValueChange={setNewFromAccountId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-sm">-- بدون --</SelectItem>
                    {accountOptions.map(acc => (
                      <SelectItem key={acc.id} value={acc.id} className="text-sm">{acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-0.5">إلى حساب (اختياري)</label>
                <Select value={newToAccountId} onValueChange={setNewToAccountId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-sm">-- بدون --</SelectItem>
                    {accountOptions.map(acc => (
                      <SelectItem key={acc.id} value={acc.id} className="text-sm">{acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-0.5">المبلغ *</label>
              <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0.00" className="h-9 text-sm" />
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-0.5">الوصف *</label>
              <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="وصف العملية..." className="h-9 text-sm" />
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-0.5">تاريخ الاستحقاق</label>
              <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="h-9 text-sm" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={resetForm} className="flex-1 h-9 text-sm">إلغاء</Button>
              <Button onClick={handleAddDebt} disabled={!newFundId || !newAmount || !newDescription} className="flex-1 h-9 text-sm">إضافة</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Debt Modal */}
      <Dialog open={!!editingDebt} onOpenChange={(open) => !open && setEditingDebt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              تعديل {editingDebt?.type === 'receivable' ? 'مدين' : 'دائن'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-0.5">الحساب</label>
              <Select value={editAccountId} onValueChange={setEditAccountId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-sm">-- بدون --</SelectItem>
                  {accountOptions.map(acc => (
                    <SelectItem key={acc.id} value={acc.id} className="text-sm">{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-0.5">المبلغ *</label>
              <Input 
                type="number" 
                value={editAmount} 
                onChange={(e) => setEditAmount(e.target.value)} 
                placeholder="0.00" 
                className="h-9 text-sm" 
              />
              {editingDebt && editingDebt.amount !== editingDebt.remainingAmount && (
                <p className="text-xs text-amber-600 mt-1">
                  ملاحظة: تم سداد ${(editingDebt.amount - editingDebt.remainingAmount).toLocaleString()} من هذه العملية
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-0.5">الوصف *</label>
              <Input 
                value={editDescription} 
                onChange={(e) => setEditDescription(e.target.value)} 
                placeholder="وصف العملية..." 
                className="h-9 text-sm" 
              />
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-0.5">تاريخ الاستحقاق</label>
              <Input 
                type="date" 
                value={editDueDate} 
                onChange={(e) => setEditDueDate(e.target.value)} 
                className="h-9 text-sm" 
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingDebt(null)} className="flex-1 h-9 text-sm">إلغاء</Button>
              <Button onClick={handleUpdateDebt} disabled={!editAmount || !editDescription} className="flex-1 h-9 text-sm">حفظ التعديلات</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmDebt} onOpenChange={(open) => !open && setDeleteConfirmDebt(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذه العملية؟
              {deleteConfirmDebt && (
                <span className="block mt-2 font-medium text-foreground">
                  {deleteConfirmDebt.description} - ${deleteConfirmDebt.amount.toLocaleString()}
                </span>
              )}
              {deleteConfirmDebt?.payments && deleteConfirmDebt.payments.length > 0 && (
                <span className="block mt-1 text-amber-600">
                  تنبيه: سيتم حذف {deleteConfirmDebt.payments.length} عملية سداد مرتبطة
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
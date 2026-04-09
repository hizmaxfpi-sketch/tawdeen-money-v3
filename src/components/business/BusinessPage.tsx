import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, DollarSign, TrendingDown, Package, ChevronLeft, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useAssets, Asset } from '@/hooks/useAssets';
import { useBusinessTransactions, isBusinessTransaction, REVENUE_CATEGORIES, EXPENSE_CATEGORIES } from '@/hooks/useBusinessTransactions';
import { Transaction, FundOption, AccountOption } from '@/types/finance';
import { Currency } from '@/hooks/useCurrencies';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UnifiedTransactionLog } from '@/components/shared/UnifiedTransactionLog';
import { Textarea } from '@/components/ui/textarea';
import { BusinessTransactionForm } from './BusinessTransactionForm';
import { AssetDetailsSheet } from './AssetDetailsSheet';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { cn } from '@/lib/utils';

const CUSTOM_CATEGORIES_KEY = 'tawdeen_custom_categories';

interface BusinessPageProps {
  transactions: Transaction[];
  fundOptions: FundOption[];
  accountOptions: AccountOption[];
  currencies?: Currency[];
  onAddTransaction?: (data: any) => Promise<any>;
  onEditTransaction?: (tx: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
}

export function BusinessPage({
  transactions, fundOptions, accountOptions, currencies,
  onAddTransaction, onEditTransaction, onDeleteTransaction,
}: BusinessPageProps) {
  const { assets, addAsset, updateAsset, deleteAsset, totalAssetValue, totalDepreciation,
    payments, improvements, payInstallment, addImprovement,
    getAssetPayments, getAssetImprovements } = useAssets();
  const { directRevenue, businessExpenses } = useBusinessTransactions(transactions);
  const { contacts } = useSupabaseContacts();

  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'revenue' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [assetForm, setAssetForm] = useState({
    name: '', value: '', purchaseDate: new Date().toISOString().slice(0, 10),
    depreciationRate: '', notes: '', fundId: '', vendorId: '',
    paymentType: 'full', installmentCount: '1', depreciationFundId: '',
  });

  // Filter business transactions
  const businessTxs = useMemo(() => {
    let filtered = transactions.filter(isBusinessTransaction);
    if (filterType === 'revenue') filtered = filtered.filter(t => t.type === 'in');
    if (filterType === 'expense') filtered = filtered.filter(t => t.type === 'out');
    if (filterCategory !== 'all') filtered = filtered.filter(t => t.category === filterCategory);
    return filtered;
  }, [transactions, filterType, filterCategory]);

  const handleAddAsset = async () => {
    if (!assetForm.name || !assetForm.value) return;
    await addAsset({
      name: assetForm.name,
      value: Number(assetForm.value),
      purchaseDate: assetForm.purchaseDate,
      depreciationRate: Number(assetForm.depreciationRate) || 0,
      notes: assetForm.notes || undefined,
      fundId: assetForm.fundId || undefined,
      vendorId: assetForm.vendorId || undefined,
      paymentType: assetForm.paymentType,
      installmentCount: Number(assetForm.installmentCount) || 1,
      depreciationFundId: assetForm.depreciationFundId || undefined,
    });
    setAssetForm({
      name: '', value: '', purchaseDate: new Date().toISOString().slice(0, 10),
      depreciationRate: '', notes: '', fundId: '', vendorId: '',
      paymentType: 'full', installmentCount: '1', depreciationFundId: '',
    });
    setShowAddAsset(false);
  };

  const activeContacts = contacts.filter(c => c.status === 'active');
  const allCategories = [...REVENUE_CATEGORIES, ...EXPENSE_CATEGORIES];

  return (
    <div className="space-y-3 py-3 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-card p-2.5 shadow-sm border border-border">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-income">
              <DollarSign className="h-3 w-3 text-white" />
            </div>
            <span className="text-[10px] text-muted-foreground leading-tight">الإيرادات</span>
          </div>
          <p className="text-base font-bold text-income">${directRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-xl bg-card p-2.5 shadow-sm border border-border">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-expense">
              <TrendingDown className="h-3 w-3 text-white" />
            </div>
            <span className="text-[10px] text-muted-foreground leading-tight">المصاريف</span>
          </div>
          <p className="text-base font-bold text-expense">${businessExpenses.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="rounded-xl bg-card p-2.5 shadow-sm border border-border">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-primary">
              <Package className="h-3 w-3 text-white" />
            </div>
            <span className="text-[10px] text-muted-foreground leading-tight">الأصول</span>
          </div>
          <p className="text-base font-bold text-primary">${totalAssetValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
        </motion.div>
      </div>

      <Tabs defaultValue="transactions" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="transactions">العمليات</TabsTrigger>
          <TabsTrigger value="assets">الأصول</TabsTrigger>
        </TabsList>

        {/* Operations Tab */}
        <TabsContent value="transactions" className="space-y-3 mt-3">
          {/* Add button */}
          {onAddTransaction && (
            <Button size="sm" className="gap-1 w-full" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3.5 w-3.5" /> إضافة عملية
            </Button>
          )}

          {/* Filters */}
          <div className="flex gap-2">
            <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
              <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-[50]">
                <SelectItem value="all" className="text-xs">الكل</SelectItem>
                <SelectItem value="revenue" className="text-xs">إيرادات</SelectItem>
                <SelectItem value="expense" className="text-xs">مصاريف</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-[50]">
                <SelectItem value="all" className="text-xs">كل الفئات</SelectItem>
                {allCategories.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <UnifiedTransactionLog
            transactions={businessTxs}
            onEditTransaction={onEditTransaction}
            onDeleteTransaction={onDeleteTransaction}
            showDateRange={true}
            currencies={currencies}
          />
        </TabsContent>

        {/* Assets Tab */}
        <TabsContent value="assets" className="space-y-3 mt-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold">الأصول</h3>
            <Dialog open={showAddAsset} onOpenChange={setShowAddAsset}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> إضافة أصل
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>إضافة أصل جديد</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>اسم الأصل *</Label>
                    <Input value={assetForm.name} onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))} placeholder="مثل: سيارة، معدات..." />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>القيمة *</Label>
                      <Input type="number" value={assetForm.value} onChange={e => setAssetForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
                    </div>
                    <div>
                      <Label>تاريخ الشراء</Label>
                      <Input type="date" value={assetForm.purchaseDate} onChange={e => setAssetForm(f => ({ ...f, purchaseDate: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label>نسبة الإهلاك السنوية %</Label>
                    <Input type="number" value={assetForm.depreciationRate} onChange={e => setAssetForm(f => ({ ...f, depreciationRate: e.target.value }))} placeholder="مثل: 20" />
                  </div>

                  {/* Fund */}
                  <div>
                    <Label>الصندوق (مصدر الدفع)</Label>
                    <Select value={assetForm.fundId} onValueChange={v => setAssetForm(f => ({ ...f, fundId: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                      <SelectContent>
                        {fundOptions.map(f => (
                          <SelectItem key={f.id} value={f.id} className="text-xs">
                            {f.name} (${f.balance.toLocaleString('en-US')})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Vendor */}
                  <div>
                    <Label>المورد</Label>
                    <Select value={assetForm.vendorId} onValueChange={v => setAssetForm(f => ({ ...f, vendorId: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                      <SelectContent>
                        {activeContacts.map(c => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment Type */}
                  <div>
                    <Label>نوع الدفع</Label>
                    <Select value={assetForm.paymentType} onValueChange={v => setAssetForm(f => ({ ...f, paymentType: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full" className="text-xs">دفعة واحدة</SelectItem>
                        <SelectItem value="installment" className="text-xs">تقسيط</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {assetForm.paymentType === 'installment' && (
                    <div>
                      <Label>عدد الأقساط</Label>
                      <Input type="number" min="2" value={assetForm.installmentCount} onChange={e => setAssetForm(f => ({ ...f, installmentCount: e.target.value }))} placeholder="12" />
                    </div>
                  )}

                  {/* Depreciation Fund */}
                  <div>
                    <Label>صندوق التطوير (للإهلاك)</Label>
                    <Select value={assetForm.depreciationFundId} onValueChange={v => setAssetForm(f => ({ ...f, depreciationFundId: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                      <SelectContent>
                        {fundOptions.map(f => (
                          <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>ملاحظات</Label>
                    <Textarea value={assetForm.notes} onChange={e => setAssetForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات..." />
                  </div>
                  <Button className="w-full" onClick={handleAddAsset}>حفظ</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Depreciation Summary */}
          <Card>
            <CardContent className="py-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">إجمالي قيمة الأصول</span>
                <span className="font-bold">${assets.reduce((s, a) => s + a.value, 0).toLocaleString('en-US')}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">إجمالي الإهلاك</span>
                <span className="font-bold text-expense">${totalDepreciation.toLocaleString('en-US')}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">القيمة الحالية</span>
                <span className="font-bold text-primary">${totalAssetValue.toLocaleString('en-US')}</span>
              </div>
            </CardContent>
          </Card>

          {assets.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">لا توجد أصول</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {assets.map(asset => (
                <Card key={asset.id} className="cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => setSelectedAsset(asset)}>
                  <CardContent className="py-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold">{asset.name}</p>
                          {asset.paymentType === 'installment' && (
                            <Badge variant="secondary" className="text-[9px]">تقسيط</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          القيمة: ${asset.value.toLocaleString('en-US')} | الحالية: ${asset.currentValue.toLocaleString('en-US')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {asset.purchaseDate} | إهلاك: {asset.depreciationRate}%
                        </p>
                      </div>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground mt-1" />
                    </div>
                    <div className="w-full bg-muted rounded-full h-1 mt-2">
                      <div className="bg-expense h-1 rounded-full" style={{ width: `${Math.min(100, (asset.totalDepreciation / (asset.value || 1)) * 100)}%` }} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Business Transaction Form */}
      <AnimatePresence>
        {showAddForm && onAddTransaction && (
          <BusinessTransactionForm
            fundOptions={fundOptions}
            onSubmit={onAddTransaction}
            onClose={() => setShowAddForm(false)}
          />
        )}
      </AnimatePresence>

      {/* Asset Details Sheet */}
      <AssetDetailsSheet
        asset={selectedAsset}
        open={!!selectedAsset}
        onOpenChange={(open) => { if (!open) setSelectedAsset(null); }}
        payments={selectedAsset ? getAssetPayments(selectedAsset.id) : []}
        improvements={selectedAsset ? getAssetImprovements(selectedAsset.id) : []}
        fundOptions={fundOptions}
        onPayInstallment={payInstallment}
        onAddImprovement={addImprovement}
        onUpdateAsset={updateAsset}
        onDeleteAsset={(id) => { deleteAsset(id); setSelectedAsset(null); }}
      />
    </div>
  );
}

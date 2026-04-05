import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, DollarSign, TrendingDown, Package, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssets, Asset } from '@/hooks/useAssets';
import { AssetLedger } from './AssetLedger';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { useBusinessTransactions } from '@/hooks/useBusinessTransactions';
import { Transaction, FundOption, AccountOption } from '@/types/finance';
import { Currency } from '@/hooks/useCurrencies';
import { useLanguage } from '@/i18n/LanguageContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UnifiedTransactionLog } from '@/components/shared/UnifiedTransactionLog';
import { Textarea } from '@/components/ui/textarea';
import { CategoryManagerModal } from '@/components/transactions/CategoryManagerModal';
import { QuickTransactionModal } from '@/components/transactions/QuickTransactionModal';

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
  transactions,
  fundOptions,
  accountOptions,
  currencies,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
}: BusinessPageProps) {
  const { t } = useLanguage();
  const { assets, addAsset, deleteAsset, totalAssetValue, totalDepreciation } = useAssets();
  const { directRevenue, businessExpenses } = useBusinessTransactions(transactions);
  const { contacts } = useSupabaseContacts();

  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showQuickTransaction, setShowQuickTransaction] = useState(false);
  const [assetForm, setAssetForm] = useState({
    name: '', value: '', purchaseDate: new Date().toISOString().slice(0, 10),
    depreciationRate: '', notes: '', supplierId: 'none', isInstallment: false, totalInstallment: ''
  });

  const [selectedAssetForLedger, setSelectedAssetForLedger] = useState<Asset | null>(null);

  // Advanced Filters State
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const suppliers = contacts.filter(c => c.type === 'vendor' || c.type === 'other');

  // Filter business transactions (direct revenue + expenses, excluding project/shipping auto-generated)
  const businessTxs = transactions.filter(tx => {
    if (tx.sourceType && tx.sourceType !== 'manual' && tx.sourceType !== 'general_ledger') return false;
    const cat = tx.category;
    const matchesCategory = filterCategory === 'all' || cat === filterCategory;
    const matchesDate = (!filterDateFrom || tx.date >= filterDateFrom) && (!filterDateTo || tx.date <= filterDateTo);

    // Business categories include direct, asset revenue, common expenses, and ANY category marked as 'general_ledger'
    const isBusinessCategory = ['direct_revenue', 'asset_revenue', 'expense', 'business_expense', 'asset_depreciation'].includes(cat) || tx.sourceType === 'general_ledger';

    return isBusinessCategory && !tx.projectId && matchesCategory && matchesDate;
  });

  const handleAddAsset = async () => {
    if (!assetForm.name || !assetForm.value) return;
    await addAsset({
      name: assetForm.name,
      value: Number(assetForm.value),
      purchaseDate: assetForm.purchaseDate,
      depreciationRate: Number(assetForm.depreciationRate) || 0,
      notes: assetForm.notes || undefined,
      // @ts-ignore - Added in migration
      supplier_id: assetForm.supplierId !== 'none' ? assetForm.supplierId : null,
      is_installment: assetForm.isInstallment,
      installment_total_amount: Number(assetForm.totalInstallment) || 0
    });
    setAssetForm({
      name: '', value: '', purchaseDate: new Date().toISOString().slice(0, 10),
      depreciationRate: '', notes: '', supplierId: 'none', isInstallment: false, totalInstallment: ''
    });
    setShowAddAsset(false);
  };

  return (
    <div className="space-y-3 py-3 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-2.5 shadow-sm border border-border">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-income">
              <DollarSign className="h-3 w-3 text-white" />
            </div>
            <span className="text-[10px] text-muted-foreground leading-tight">الإيرادات المباشرة</span>
          </div>
          <p className="text-base font-bold text-income">${directRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="rounded-xl bg-card p-2.5 shadow-sm border border-border">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-expense">
              <TrendingDown className="h-3 w-3 text-white" />
            </div>
            <span className="text-[10px] text-muted-foreground leading-tight">المصاريف</span>
          </div>
          <p className="text-base font-bold text-expense">${businessExpenses.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="rounded-xl bg-card p-2.5 shadow-sm border border-border">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-primary">
              <Package className="h-3 w-3 text-white" />
            </div>
            <span className="text-[10px] text-muted-foreground leading-tight">الأصول</span>
          </div>
          <p className="text-base font-bold text-primary">${totalAssetValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
        </motion.div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="transactions" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="transactions">العمليات</TabsTrigger>
          <TabsTrigger value="assets">الأصول</TabsTrigger>
          <TabsTrigger value="depreciation">الإهلاك</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-3 mt-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 gap-1.5 border-primary/20 hover:bg-primary/5"
              onClick={() => setShowCategoryManager(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              إدارة أنواع العمليات
            </Button>

            <Button
              variant="default"
              size="sm"
              className="text-xs h-8 gap-1.5 shadow-sm"
              onClick={() => setShowQuickTransaction(true)}
            >
              <DollarSign className="h-3.5 w-3.5" />
              إضافة عملية سريعة
            </Button>
          </div>

          <div className="flex gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
            <div className="flex-1 min-w-[120px]">
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 text-[10px]" />
            </div>
            <div className="flex-1 min-w-[120px]">
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 text-[10px]" />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-8 text-[10px] w-[100px]"><SelectValue placeholder="الفئة" /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all" className="text-[10px]">الكل</SelectItem>
                <SelectItem value="direct_revenue" className="text-[10px]">إيراد مباشر</SelectItem>
                <SelectItem value="asset_revenue" className="text-[10px]">إيراد أصول</SelectItem>
                <SelectItem value="expense" className="text-[10px]">مصروف عام</SelectItem>
                <SelectItem value="business_expense" className="text-[10px]">مصروف عمل</SelectItem>
                <SelectItem value="asset_depreciation" className="text-[10px]">إهلاك</SelectItem>
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

        <TabsContent value="assets" className="space-y-3 mt-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold">الأصول</h3>
            <Dialog open={showAddAsset} onOpenChange={setShowAddAsset}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  إضافة أصل
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>إضافة أصل جديد</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>اسم الأصل *</Label>
                    <Input value={assetForm.name} onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))} placeholder="مثل: سيارة، معدات..." />
                  </div>
                  <div>
                    <Label>القيمة *</Label>
                    <Input type="number" value={assetForm.value} onChange={e => setAssetForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
                  </div>
                  <div>
                    <Label>تاريخ الشراء</Label>
                    <Input type="date" value={assetForm.purchaseDate} onChange={e => setAssetForm(f => ({ ...f, purchaseDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>نسبة الإهلاك السنوية %</Label>
                    <Input type="number" value={assetForm.depreciationRate} onChange={e => setAssetForm(f => ({ ...f, depreciationRate: e.target.value }))} placeholder="مثل: 20" />
                  </div>
                  <div>
                    <Label>المورد / البائع</Label>
                    <Select value={assetForm.supplierId} onValueChange={val => setAssetForm(f => ({ ...f, supplierId: val }))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        <SelectItem value="none" className="text-xs">بدون مورد</SelectItem>
                        {suppliers.map(s => (
                          <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      id="isInstallment"
                      checked={assetForm.isInstallment}
                      onChange={e => setAssetForm(f => ({ ...f, isInstallment: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <Label htmlFor="isInstallment" className="text-xs cursor-pointer">شراء بالتقسيط</Label>
                  </div>
                  {assetForm.isInstallment && (
                    <div>
                      <Label>إجمالي قيمة التقسيط</Label>
                      <Input type="number" value={assetForm.totalInstallment} onChange={e => setAssetForm(f => ({ ...f, totalInstallment: e.target.value }))} placeholder="0" />
                    </div>
                  )}
                  <div>
                    <Label>ملاحظات</Label>
                    <Textarea value={assetForm.notes} onChange={e => setAssetForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات..." />
                  </div>
                  <Button className="w-full" onClick={handleAddAsset}>حفظ</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {assets.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">لا توجد أصول</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {assets.map(asset => (
                <AssetCard key={asset.id} asset={asset} onDelete={deleteAsset} onShowLedger={() => setSelectedAssetForLedger(asset)} />
              ))}
            </div>
          )}
        </TabsContent>

        <Dialog open={!!selectedAssetForLedger} onOpenChange={(open) => !open && setSelectedAssetForLedger(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>سجل الأصل</DialogTitle>
            </DialogHeader>
            {selectedAssetForLedger && (
              <AssetLedger asset={selectedAssetForLedger} transactions={transactions} />
            )}
          </DialogContent>
        </Dialog>

        <TabsContent value="depreciation" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">ملخص الإهلاك</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">إجمالي قيمة الأصول</span>
                <span className="font-bold">${assets.reduce((s, a) => s + a.value, 0).toLocaleString('en-US')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">إجمالي الإهلاك</span>
                <span className="font-bold text-expense">${totalDepreciation.toLocaleString('en-US')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">القيمة الحالية</span>
                <span className="font-bold text-primary">${totalAssetValue.toLocaleString('en-US')}</span>
              </div>
            </CardContent>
          </Card>

          {assets.map(asset => (
            <Card key={asset.id}>
              <CardContent className="py-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{asset.name}</span>
                  <span className="text-xs text-muted-foreground">{asset.depreciationRate}% سنوياً</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>الإهلاك الشهري: ${asset.monthlyDepreciation.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                  <span>المجمع: ${asset.totalDepreciation.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                  <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.min(100, (asset.totalDepreciation / asset.value) * 100)}%` }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <CategoryManagerModal open={showCategoryManager} onOpenChange={setShowCategoryManager} />

      {onAddTransaction && (
        <QuickTransactionModal
          open={showQuickTransaction}
          onOpenChange={setShowQuickTransaction}
          fundOptions={fundOptions}
          onAddTransaction={onAddTransaction}
        />
      )}
    </div>
  );
}

function AssetCard({ asset, onDelete, onShowLedger }: { asset: Asset; onDelete: (id: string) => void; onShowLedger: () => void }) {
  return (
    <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={onShowLedger}>
      <CardContent className="py-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-bold">{asset.name}</p>
            <p className="text-xs text-muted-foreground">القيمة: ${asset.value.toLocaleString('en-US')} | الحالية: ${asset.currentValue.toLocaleString('en-US')}</p>
            <p className="text-xs text-muted-foreground">تاريخ الشراء: {asset.purchaseDate} | إهلاك: {asset.depreciationRate}%</p>
            {asset.notes && <p className="text-xs text-muted-foreground mt-1">{asset.notes}</p>}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

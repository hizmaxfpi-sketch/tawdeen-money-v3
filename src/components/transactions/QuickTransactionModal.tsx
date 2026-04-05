import { useState } from 'react';
import { Plus, DollarSign, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTransactionCategories } from '@/hooks/useTransactionCategories';
import { FundOption } from '@/types/finance';
import { toast } from 'sonner';

interface QuickTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fundOptions: FundOption[];
  onAddTransaction: (data: any) => Promise<any>;
}

export function QuickTransactionModal({
  open,
  onOpenChange,
  fundOptions,
  onAddTransaction
}: QuickTransactionModalProps) {
  const { categories } = useTransactionCategories();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    category: '',
    fundId: '',
    amount: '',
    description: ''
  });

  const handleSave = async () => {
    if (!formData.category || !formData.fundId || !formData.amount) {
      toast.error('يرجى إكمال جميع الحقول الإلزامية');
      return;
    }

    const selectedCategory = categories.find(c => c.name === formData.category);
    if (!selectedCategory) {
      toast.error('يرجى اختيار نوع صحيح');
      return;
    }

    setLoading(true);
    try {
      await onAddTransaction({
        type: selectedCategory.type,
        category: selectedCategory.name, // Using category name as the category ID for flexibility
        amount: Number(formData.amount),
        description: formData.description || selectedCategory.name,
        date: new Date().toISOString().slice(0, 10),
        fundId: formData.fundId,
        sourceType: 'general_ledger'
      });
      onOpenChange(false);
      setFormData({ category: '', fundId: '', amount: '', description: '' });
    } catch (error) {
      console.error('Error adding quick transaction:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-4">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            إضافة عملية سريعة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">نوع العملية</Label>
            <Select
              value={formData.category}
              onValueChange={(val) => setFormData(f => ({ ...f, category: val }))}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="اختر نوع العملية..." />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {categories.length === 0 ? (
                  <p className="p-2 text-[10px] text-muted-foreground text-center">لا توجد أنواع معرفة</p>
                ) : (
                  categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.name} className="text-xs">
                      <span className={cat.type === 'in' ? "text-income" : "text-expense"}>
                        {cat.name} ({cat.type === 'in' ? 'إيراد' : 'مصروف'})
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">الصندوق / الخزنة</Label>
            <Select
              value={formData.fundId}
              onValueChange={(val) => setFormData(f => ({ ...f, fundId: val }))}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="اختر الصندوق المتأثر..." />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {fundOptions.map(fund => (
                  <SelectItem key={fund.id} value={fund.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <Wallet className="h-3 w-3 text-muted-foreground" />
                      <span>{fund.name} (${fund.balance.toLocaleString()})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">المبلغ</Label>
            <div className="relative">
              <DollarSign className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="h-9 pr-8 text-sm font-bold"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">البيان (اختياري)</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
              placeholder="وصف مختصر للعملية..."
              className="h-9 text-xs"
            />
          </div>

          <Button
            className="w-full h-10 font-bold"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'جاري الحفظ...' : 'حفظ العملية الآن'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

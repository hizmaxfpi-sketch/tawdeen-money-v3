import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FundOption } from '@/types/finance';
import { REVENUE_CATEGORIES, EXPENSE_CATEGORIES } from '@/hooks/useBusinessTransactions';

interface LineItem {
  name: string;
  amount: string;
}

interface BusinessTransactionFormProps {
  fundOptions: FundOption[];
  onSubmit: (data: any) => Promise<any>;
  onClose: () => void;
}

export function BusinessTransactionForm({ fundOptions, onSubmit, onClose }: BusinessTransactionFormProps) {
  const [type, setType] = useState<'revenue' | 'expense'>('expense');
  const [category, setCategory] = useState('');
  const [fundId, setFundId] = useState(fundOptions[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [notes, setNotes] = useState('');
  const [useLineItems, setUseLineItems] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([{ name: '', amount: '' }]);

  const categories = type === 'revenue' ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;

  const totalFromItems = lineItems.reduce((s, item) => s + (parseFloat(item.amount) || 0), 0);
  const effectiveAmount = useLineItems ? totalFromItems : parseFloat(amount) || 0;

  const handleSubmit = async () => {
    if (!effectiveAmount || !fundId || !category) return;

    if (useLineItems && lineItems.length > 0) {
      // Create individual transactions per line item
      const catLabel = categories.find(c => c.value === category)?.label || category;
      for (const item of lineItems) {
        const itemAmount = parseFloat(item.amount);
        if (!itemAmount || !item.name) continue;
        await onSubmit({
          type: type === 'revenue' ? 'in' : 'out',
          category,
          amount: itemAmount,
          description: `${catLabel} - ${item.name}`,
          date, fundId,
          notes: notes || undefined,
        });
      }
    } else {
      await onSubmit({
        type: type === 'revenue' ? 'in' : 'out',
        category,
        amount: effectiveAmount,
        description: description || categories.find(c => c.value === category)?.label || '',
        date, fundId,
        notes: notes || undefined,
      });
    }
    onClose();
  };

  const addLineItem = () => setLineItems([...lineItems, { name: '', amount: '' }]);
  const removeLineItem = (i: number) => setLineItems(lineItems.filter((_, idx) => idx !== i));
  const updateLineItem = (i: number, field: keyof LineItem, val: string) => {
    const updated = [...lineItems];
    updated[i] = { ...updated[i], [field]: val };
    setLineItems(updated);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()} className="w-full max-w-md bg-card rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        
        <div className="flex items-center justify-between p-3 border-b border-border sticky top-0 bg-card z-10">
          <h3 className="text-sm font-bold">عملية جديدة</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-3 space-y-3">
          {/* Type Toggle */}
          <div className="flex rounded-lg bg-muted p-0.5">
            <button onClick={() => { setType('revenue'); setCategory(''); }}
              className={cn("flex-1 py-2 rounded-md text-xs font-medium transition-all",
                type === 'revenue' ? "bg-gradient-income text-white shadow-sm" : "text-muted-foreground")}>
              إيراد
            </button>
            <button onClick={() => { setType('expense'); setCategory(''); }}
              className={cn("flex-1 py-2 rounded-md text-xs font-medium transition-all",
                type === 'expense' ? "bg-gradient-expense text-white shadow-sm" : "text-muted-foreground")}>
              مصروف
            </button>
          </div>

          {/* Category */}
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">الفئة</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
              <SelectContent className="bg-popover z-[110]">
                {categories.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fund */}
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">الصندوق</label>
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-[110]">
                {fundOptions.map(f => (
                  <SelectItem key={f.id} value={f.id} className="text-xs">
                    {f.name} (${f.balance.toLocaleString('en-US')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Build expense toggle */}
          {category && (
            <div className="flex items-center gap-2">
              <button onClick={() => setUseLineItems(!useLineItems)}
                className={cn("text-[10px] px-2 py-1 rounded-md border", useLineItems ? "bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                {type === 'expense' ? 'بناء مصروف (بنود)' : 'بناء إيراد (بنود)'}
              </button>
            </div>
          )}

          {useLineItems ? (
            <div className="space-y-2 rounded-lg bg-muted/40 p-2">
              <p className="text-[10px] text-muted-foreground font-medium">البنود</p>
              {lineItems.map((item, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <Input value={item.name} onChange={e => updateLineItem(i, 'name', e.target.value)}
                    placeholder="الاسم" className="h-7 text-xs flex-1" />
                  <Input type="number" value={item.amount} onChange={e => updateLineItem(i, 'amount', e.target.value)}
                    placeholder="المبلغ" className="h-7 text-xs w-24" dir="ltr" />
                  {lineItems.length > 1 && (
                    <button onClick={() => removeLineItem(i)} className="text-destructive p-0.5">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addLineItem} className="h-6 text-[10px] gap-1 w-full">
                <Plus className="h-3 w-3" />إضافة بند
              </Button>
              <p className="text-xs font-bold text-center">الإجمالي: ${totalFromItems.toLocaleString('en-US')}</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-muted-foreground mb-1">المبلغ</label>
                  <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="h-8 text-xs" dir="ltr" />
                </div>
                <div className="w-[110px]">
                  <label className="block text-[10px] text-muted-foreground mb-1">التاريخ</label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-[10px]" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">الوصف</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف العملية" className="h-8 text-xs" />
              </div>
            </>
          )}

          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">ملاحظات</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات..." rows={2} className="text-xs min-h-[40px] resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 h-9 text-xs">إلغاء</Button>
            <Button onClick={handleSubmit} disabled={!effectiveAmount || !fundId || !category}
              className={cn("flex-1 h-9 text-xs", type === 'revenue' ? "bg-gradient-income" : "bg-gradient-expense")}>
              حفظ
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

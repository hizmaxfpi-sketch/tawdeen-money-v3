import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Pencil } from 'lucide-react';
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

const STORAGE_KEY = 'tawdeen_custom_categories';

function getCustomCategories(): { value: string; label: string; type: 'revenue' | 'expense' }[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveCustomCategories(cats: { value: string; label: string; type: 'revenue' | 'expense' }[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
}

function addCustomCategory(cat: { value: string; label: string; type: 'revenue' | 'expense' }) {
  const existing = getCustomCategories();
  if (!existing.find(c => c.value === cat.value)) {
    existing.push(cat);
    saveCustomCategories(existing);
  }
}

function deleteCustomCategory(value: string) {
  const existing = getCustomCategories().filter(c => c.value !== value);
  saveCustomCategories(existing);
}

function renameCustomCategory(value: string, newLabel: string) {
  const existing = getCustomCategories();
  const idx = existing.findIndex(c => c.value === value);
  if (idx >= 0) {
    existing[idx].label = newLabel;
    saveCustomCategories(existing);
  }
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
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [customCategories, setCustomCategories] = useState(getCustomCategories);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const baseCategories = type === 'revenue' ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;
  const userCustom = customCategories.filter(c => c.type === type);
  const categories = [...baseCategories, ...userCustom];

  const totalFromItems = lineItems.reduce((s, item) => s + (parseFloat(item.amount) || 0), 0);
  const effectiveAmount = useLineItems ? totalFromItems : parseFloat(amount) || 0;

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    const value = 'custom_' + newCategoryName.trim().replace(/\s+/g, '_').toLowerCase();
    const newCat = { value, label: newCategoryName.trim(), type };
    addCustomCategory(newCat);
    setCustomCategories(getCustomCategories());
    setCategory(value);
    setNewCategoryName('');
    setShowAddCategory(false);
  };

  const handleDeleteCategory = (value: string) => {
    deleteCustomCategory(value);
    setCustomCategories(getCustomCategories());
    if (category === value) setCategory('');
  };

  const handleStartEdit = (value: string, label: string) => {
    setEditingCategory(value);
    setEditCategoryName(label);
  };

  const handleSaveEdit = (value: string) => {
    if (editCategoryName.trim()) {
      renameCustomCategory(value, editCategoryName.trim());
      setCustomCategories(getCustomCategories());
    }
    setEditingCategory(null);
  };

  const handleSubmit = async () => {
    if (!effectiveAmount || !fundId || !category || isSaving) return;
    setIsSaving(true);

    try {
      if (useLineItems && lineItems.length > 0) {
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
    } finally {
      setIsSaving(false);
    }
  };

  const addLineItem = () => setLineItems([...lineItems, { name: '', amount: '' }]);
  const removeLineItem = (i: number) => setLineItems(lineItems.filter((_, idx) => idx !== i));
  const updateLineItem = (i: number, field: keyof LineItem, val: string) => {
    const updated = [...lineItems];
    updated[i] = { ...updated[i], [field]: val };
    setLineItems(updated);
  };

  const isCustom = (value: string) => value.startsWith('custom_');

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
            <div className="flex gap-1.5">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
                <SelectContent className="bg-popover z-[110]">
                  {categories.map(c => (
                    <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => setShowAddCategory(!showAddCategory)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Add new category */}
            {showAddCategory && (
              <div className="flex gap-1.5 mt-1.5">
                <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="اسم الفئة الجديدة" className="h-7 text-xs flex-1" />
                <Button size="sm" className="h-7 text-[10px] px-2" onClick={handleAddCategory}>إضافة</Button>
              </div>
            )}

            {/* Custom categories management */}
            {userCustom.length > 0 && (
              <div className="mt-2 space-y-1 rounded-lg bg-muted/40 p-2">
                <p className="text-[10px] text-muted-foreground font-medium mb-1">الفئات المخصصة</p>
                {userCustom.map(c => (
                  <div key={c.value} className="flex items-center justify-between gap-1 bg-card rounded px-2 py-1">
                    {editingCategory === c.value ? (
                      <div className="flex gap-1 flex-1">
                        <Input value={editCategoryName} onChange={e => setEditCategoryName(e.target.value)}
                          className="h-6 text-[10px] flex-1" />
                        <Button size="sm" className="h-6 text-[9px] px-1.5" onClick={() => handleSaveEdit(c.value)}>حفظ</Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-[11px]">{c.label}</span>
                        <div className="flex gap-0.5">
                          <button onClick={() => handleStartEdit(c.value, c.label)} className="p-0.5 hover:bg-muted rounded">
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                          <button onClick={() => handleDeleteCategory(c.value)} className="p-0.5 hover:bg-muted rounded">
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
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
            <Button onClick={handleSubmit} disabled={!effectiveAmount || !fundId || !category || isSaving}
              className={cn("flex-1 h-9 text-xs", type === 'revenue' ? "bg-gradient-income" : "bg-gradient-expense")}>
              {isSaving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

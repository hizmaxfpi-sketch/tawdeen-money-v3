import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCustomCategories, customCategoriesStore } from '@/lib/customCategories';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CategoryManagerDialog({ open, onOpenChange }: Props) {
  const categories = useCustomCategories();
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const startEdit = (value: string, label: string) => {
    setEditingValue(value);
    setEditLabel(label);
  };

  const saveEdit = (value: string) => {
    if (!editLabel.trim()) return;
    customCategoriesStore.update(value, { label: editLabel.trim() });
    setEditingValue(null);
    toast.success('تم تعديل الفئة');
  };

  const remove = (value: string, label: string) => {
    if (!confirm(`حذف الفئة "${label}"؟ لن تتأثر العمليات السابقة.`)) return;
    customCategoriesStore.remove(value);
    toast.success('تم حذف الفئة');
  };

  const revenue = categories.filter(c => c.type === 'revenue');
  const expense = categories.filter(c => c.type === 'expense');

  const renderRow = (c: { value: string; label: string }) => (
    <div key={c.value} className="flex items-center gap-2 p-2 border border-border rounded-md">
      {editingValue === c.value ? (
        <>
          <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="h-7 text-xs flex-1" autoFocus />
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveEdit(c.value)}>
            <Check className="h-3.5 w-3.5 text-green-600" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingValue(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <>
          <span className="text-xs flex-1">{c.label}</span>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(c.value, c.label)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => remove(c.value, c.label)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إدارة الفئات المخصصة</DialogTitle>
        </DialogHeader>

        {categories.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            لا توجد فئات مخصصة بعد. أضف فئة من نافذة العملية الجديدة.
          </p>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {revenue.length > 0 && (
              <div className="space-y-1.5">
                <Badge variant="secondary" className="text-[10px]">إيرادات ({revenue.length})</Badge>
                {revenue.map(renderRow)}
              </div>
            )}
            {expense.length > 0 && (
              <div className="space-y-1.5">
                <Badge variant="secondary" className="text-[10px]">مصروفات ({expense.length})</Badge>
                {expense.map(renderRow)}
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          ملاحظة: حذف الفئة لا يحذف العمليات المرتبطة بها.
        </p>
      </DialogContent>
    </Dialog>
  );
}

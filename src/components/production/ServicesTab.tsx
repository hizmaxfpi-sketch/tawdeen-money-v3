import { useState } from 'react';
import { Plus, Wrench, Trash2, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { ProductionService } from '@/hooks/useProduction';

interface Props {
  services: ProductionService[];
  onAdd: (data: { name: string; code?: string; default_price: number; notes?: string }) => Promise<void>;
  onUpdate: (id: string, patch: Partial<ProductionService>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ServicesTab({ services, onAdd, onUpdate, onDelete }: Props) {
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState<ProductionService | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => { setName(''); setCode(''); setPrice(''); setNotes(''); };

  const handleAdd = async () => {
    if (!name.trim()) return;
    await onAdd({ name: name.trim(), code: code.trim() || undefined, default_price: parseFloat(price) || 0, notes: notes.trim() || undefined });
    reset();
    setOpenAdd(false);
  };

  return (
    <div className="space-y-2">
      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogTrigger asChild>
          <Button size="sm" className="w-full gap-1 h-9">
            <Plus className="h-4 w-4" /> إضافة خدمة
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">خدمة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label className="text-xs">اسم الخدمة *</Label><Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm" placeholder="قص، تركيب، نقل..." /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">الكود</Label><Input value={code} onChange={e => setCode(e.target.value)} className="h-9 text-sm" /></div>
              <div><Label className="text-xs">السعر الافتراضي</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} className="h-9 text-sm" /></div>
            </div>
            <div><Label className="text-xs">ملاحظات</Label><Input value={notes} onChange={e => setNotes(e.target.value)} className="h-9 text-sm" /></div>
            <Button onClick={handleAdd} className="w-full h-9">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      {services.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
          لا توجد خدمات بعد
          <p className="mt-1 text-[10px]">أضف الخدمات التي تقدمها (قص، تركيب، اجور...)</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {services.map(s => (
            <div key={s.id} className="rounded-lg bg-card border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm font-semibold truncate">{s.name}</span>
                    {s.code && <span className="text-[10px] text-muted-foreground">[{s.code}]</span>}
                  </div>
                  <div className="flex gap-3 mt-1 text-[11px]">
                    <span className="text-income">السعر الافتراضي: <strong>${s.default_price.toFixed(2)}</strong></span>
                    {s.notes && <span className="text-muted-foreground truncate">{s.notes}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setOpenEdit(s)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { if (confirm('حذف هذه الخدمة؟')) onDelete(s.id); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!openEdit} onOpenChange={(o) => !o && setOpenEdit(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">تعديل: {openEdit?.name}</DialogTitle></DialogHeader>
          {openEdit && (
            <div className="space-y-2">
              <div><Label className="text-xs">الاسم</Label><Input defaultValue={openEdit.name} onBlur={e => onUpdate(openEdit.id, { name: e.target.value })} className="h-9 text-sm" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">الكود</Label><Input defaultValue={openEdit.code || ''} onBlur={e => onUpdate(openEdit.id, { code: e.target.value })} className="h-9 text-sm" /></div>
                <div><Label className="text-xs">السعر</Label><Input type="number" defaultValue={openEdit.default_price} onBlur={e => onUpdate(openEdit.id, { default_price: parseFloat(e.target.value) || 0 })} className="h-9 text-sm" /></div>
              </div>
              <div><Label className="text-xs">ملاحظات</Label><Input defaultValue={openEdit.notes || ''} onBlur={e => onUpdate(openEdit.id, { notes: e.target.value })} className="h-9 text-sm" /></div>
              <Button size="sm" variant="secondary" className="w-full h-9" onClick={() => setOpenEdit(null)}>إغلاق</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

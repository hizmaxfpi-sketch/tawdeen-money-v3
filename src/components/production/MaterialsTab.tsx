import { useState, useMemo } from 'react';
import { Plus, Package, Trash2, ShoppingCart, Edit2, Eye, Search, X } from 'lucide-react';
import { ProductionPreviewDialog } from './ProductionPreviewDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProductionMaterial } from '@/hooks/useProduction';
import type { FundOption } from '@/types/finance';
import type { Contact } from '@/types/contacts';

interface Props {
  materials: ProductionMaterial[];
  fundOptions: FundOption[];
  contacts: Contact[];
  onAdd: (data: { name: string; code?: string; unit: string; notes?: string }) => Promise<void>;
  onUpdate: (id: string, patch: Partial<ProductionMaterial>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPurchase: (params: any) => Promise<boolean>;
}

export function MaterialsTab({ materials, fundOptions, contacts, onAdd, onUpdate, onDelete, onPurchase }: Props) {
  const [openAdd, setOpenAdd] = useState(false);
  const [openPurchase, setOpenPurchase] = useState<ProductionMaterial | null>(null);
  const [openEdit, setOpenEdit] = useState<ProductionMaterial | null>(null);
  const [openPreview, setOpenPreview] = useState(false);

  // Search & filter state
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'qty_desc' | 'qty_asc' | 'value_desc'>('name');

  // Add form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [notes, setNotes] = useState('');

  // Purchase form
  const [pQty, setPQty] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pContact, setPContact] = useState('');
  const [pFund, setPFund] = useState('');
  const [pPaid, setPPaid] = useState('');

  const reset = () => { setName(''); setCode(''); setUnit('pcs'); setNotes(''); };
  const resetP = () => { setPQty(''); setPPrice(''); setPContact(''); setPFund(''); setPPaid(''); };

  const filteredMaterials = useMemo(() => {
    let list = materials;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.code || '').toLowerCase().includes(q) ||
        (m.notes || '').toLowerCase().includes(q)
      );
    }
    if (stockFilter === 'in') list = list.filter(m => m.quantity > 0);
    else if (stockFilter === 'out') list = list.filter(m => m.quantity <= 0);
    const sorted = [...list];
    if (sortBy === 'qty_desc') sorted.sort((a, b) => b.quantity - a.quantity);
    else if (sortBy === 'qty_asc') sorted.sort((a, b) => a.quantity - b.quantity);
    else if (sortBy === 'value_desc') sorted.sort((a, b) => (b.quantity * b.avg_cost) - (a.quantity * a.avg_cost));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [materials, search, stockFilter, sortBy]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    await onAdd({ name: name.trim(), code: code.trim() || undefined, unit, notes: notes.trim() || undefined });
    reset();
    setOpenAdd(false);
  };

  const handlePurchase = async () => {
    if (!openPurchase) return;
    const qty = parseFloat(pQty);
    const price = parseFloat(pPrice);
    if (!qty || qty <= 0 || price < 0) return;
    const ok = await onPurchase({
      material_id: openPurchase.id,
      quantity: qty,
      unit_price: price,
      contact_id: pContact || undefined,
      fund_id: pFund || undefined,
      paid_amount: parseFloat(pPaid) || 0,
    });
    if (ok) { resetP(); setOpenPurchase(null); }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <Button size="sm" className="w-full gap-1 h-9">
              <Plus className="h-4 w-4" /> إضافة مادة خام
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-sm">مادة خام جديدة</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div><Label className="text-xs">الاسم *</Label><Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">الكود</Label><Input value={code} onChange={e => setCode(e.target.value)} className="h-9 text-sm" /></div>
                <div><Label className="text-xs">الوحدة *</Label><Input value={unit} onChange={e => setUnit(e.target.value)} className="h-9 text-sm" placeholder="kg, pcs, m..." /></div>
              </div>
              <div><Label className="text-xs">ملاحظات</Label><Input value={notes} onChange={e => setNotes(e.target.value)} className="h-9 text-sm" /></div>
              <Button onClick={handleAdd} className="w-full h-9">حفظ</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="outline" className="w-full gap-1 h-9" onClick={() => setOpenPreview(true)} disabled={materials.length === 0}>
          <Eye className="h-4 w-4" /> معاينة
        </Button>
      </div>

      <ProductionPreviewDialog open={openPreview} onOpenChange={setOpenPreview} kind="materials" materials={materials} />

      {/* Search & Filters */}
      {materials.length > 0 && (
        <div className="space-y-1.5 bg-muted/30 rounded-lg p-2">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الكود..."
              className="h-8 text-xs pr-7"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="مسح"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Select value={stockFilter} onValueChange={(v: any) => setStockFilter(v)}>
              <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">الكل ({materials.length})</SelectItem>
                <SelectItem value="in" className="text-xs">متوفر</SelectItem>
                <SelectItem value="out" className="text-xs">نافد</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name" className="text-xs">حسب الاسم</SelectItem>
                <SelectItem value="qty_desc" className="text-xs">الكمية (الأعلى)</SelectItem>
                <SelectItem value="qty_asc" className="text-xs">الكمية (الأقل)</SelectItem>
                <SelectItem value="value_desc" className="text-xs">القيمة (الأعلى)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(search || stockFilter !== 'all') && (
            <p className="text-[10px] text-muted-foreground text-center">
              عرض {filteredMaterials.length} من {materials.length}
            </p>
          )}
        </div>
      )}

      {materials.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          لا توجد مواد خام بعد
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground">
          <Search className="h-7 w-7 mx-auto mb-2 opacity-30" />
          لا توجد نتائج مطابقة
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredMaterials.map(m => (
            <div key={m.id} className="rounded-lg bg-card border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm font-semibold truncate">{m.name}</span>
                    {m.code && <span className="text-[10px] text-muted-foreground">[{m.code}]</span>}
                    {m.quantity <= 0 && (
                      <span className="text-[9px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded">نافد</span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1 text-[11px]">
                    <span className="text-foreground">المتوفر: <strong>{m.quantity}</strong> {m.unit}</span>
                    <span className="text-muted-foreground">متوسط: ${m.avg_cost.toFixed(2)}</span>
                    <span className="text-income">قيمة: ${(m.quantity * m.avg_cost).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setOpenPurchase(m)} title="شراء">
                    <ShoppingCart className="h-3.5 w-3.5 text-income" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setOpenEdit(m)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { if (confirm('حذف هذه المادة؟')) onDelete(m.id); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Purchase Dialog */}
      <Dialog open={!!openPurchase} onOpenChange={(o) => !o && setOpenPurchase(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">شراء: {openPurchase?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">الكمية *</Label><Input type="number" value={pQty} onChange={e => setPQty(e.target.value)} className="h-9 text-sm" /></div>
              <div><Label className="text-xs">سعر الوحدة *</Label><Input type="number" value={pPrice} onChange={e => setPPrice(e.target.value)} className="h-9 text-sm" /></div>
            </div>
            <div>
              <Label className="text-xs">المورد</Label>
              <Select value={pContact} onValueChange={setPContact}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">الصندوق (للسداد)</Label>
                <Select value={pFund} onValueChange={setPFund}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختياري" /></SelectTrigger>
                  <SelectContent>{fundOptions.map(f => <SelectItem key={f.id} value={f.id} className="text-sm">{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">المدفوع</Label><Input type="number" value={pPaid} onChange={e => setPPaid(e.target.value)} className="h-9 text-sm" /></div>
            </div>
            {pQty && pPrice && (
              <div className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded">
                الإجمالي: <strong className="text-foreground">${(parseFloat(pQty) * parseFloat(pPrice)).toFixed(2)}</strong>
              </div>
            )}
            <Button onClick={handlePurchase} className="w-full h-9">تنفيذ الشراء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!openEdit} onOpenChange={(o) => !o && setOpenEdit(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">تعديل: {openEdit?.name}</DialogTitle></DialogHeader>
          {openEdit && (
            <div className="space-y-2">
              <div><Label className="text-xs">الاسم</Label><Input defaultValue={openEdit.name} onBlur={e => onUpdate(openEdit.id, { name: e.target.value })} className="h-9 text-sm" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">الكود</Label><Input defaultValue={openEdit.code || ''} onBlur={e => onUpdate(openEdit.id, { code: e.target.value })} className="h-9 text-sm" /></div>
                <div><Label className="text-xs">الوحدة</Label><Input defaultValue={openEdit.unit} onBlur={e => onUpdate(openEdit.id, { unit: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <Button size="sm" variant="secondary" className="w-full h-9" onClick={() => setOpenEdit(null)}>إغلاق</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

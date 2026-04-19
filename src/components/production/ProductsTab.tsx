import { useState, useMemo } from 'react';
import { Plus, Factory, Trash2, Edit2, Layers, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProductionMaterial, ProductionProduct, BomEntry } from '@/hooks/useProduction';

interface Props {
  products: ProductionProduct[];
  materials: ProductionMaterial[];
  bom: BomEntry[];
  onAdd: (data: { name: string; code?: string; unit: string; sell_price: number; notes?: string }) => Promise<void>;
  onUpdate: (id: string, patch: Partial<ProductionProduct>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetBom: (productId: string, entries: { material_id: string; qty_per_unit: number }[]) => Promise<void>;
}

export function ProductsTab({ products, materials, bom, onAdd, onUpdate, onDelete, onSetBom }: Props) {
  const [openAdd, setOpenAdd] = useState(false);
  const [openBom, setOpenBom] = useState<ProductionProduct | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [sellPrice, setSellPrice] = useState('');

  const handleAdd = async () => {
    if (!name.trim()) return;
    await onAdd({ name: name.trim(), code: code.trim() || undefined, unit, sell_price: parseFloat(sellPrice) || 0 });
    setName(''); setCode(''); setUnit('pcs'); setSellPrice('');
    setOpenAdd(false);
  };

  return (
    <div className="space-y-2">
      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogTrigger asChild>
          <Button size="sm" className="w-full gap-1 h-9">
            <Plus className="h-4 w-4" /> إضافة منتج
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">منتج جديد</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label className="text-xs">الاسم *</Label><Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">الكود</Label><Input value={code} onChange={e => setCode(e.target.value)} className="h-9 text-sm" /></div>
              <div><Label className="text-xs">الوحدة *</Label><Input value={unit} onChange={e => setUnit(e.target.value)} className="h-9 text-sm" /></div>
            </div>
            <div><Label className="text-xs">سعر البيع</Label><Input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} className="h-9 text-sm" /></div>
            <Button onClick={handleAdd} className="w-full h-9">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      {products.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          <Factory className="h-8 w-8 mx-auto mb-2 opacity-30" />
          لا توجد منتجات بعد
        </div>
      ) : (
        <div className="space-y-1.5">
          {products.map(p => {
            const productBom = bom.filter(b => b.product_id === p.id);
            return (
              <div key={p.id} className="rounded-lg bg-card border border-border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Factory className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-sm font-semibold truncate">{p.name}</span>
                      {p.code && <span className="text-[10px] text-muted-foreground">[{p.code}]</span>}
                    </div>
                    <div className="flex gap-3 mt-1 text-[11px] flex-wrap">
                      <span>المخزون: <strong>{p.quantity}</strong> {p.unit}</span>
                      <span className="text-muted-foreground">تكلفة: ${p.unit_cost.toFixed(2)}</span>
                      <span className="text-income">بيع: ${p.sell_price.toFixed(2)}</span>
                      <span className="text-primary">{productBom.length} مكون</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setOpenBom(p)} title="المكونات">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { if (confirm('حذف هذا المنتج؟')) onDelete(p.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BomEditor product={openBom} materials={materials} bom={bom} onSave={onSetBom} onClose={() => setOpenBom(null)} />
    </div>
  );
}

function BomEditor({ product, materials, bom, onSave, onClose }: {
  product: ProductionProduct | null;
  materials: ProductionMaterial[];
  bom: BomEntry[];
  onSave: (productId: string, entries: { material_id: string; qty_per_unit: number }[]) => Promise<void>;
  onClose: () => void;
}) {
  const initial = useMemo(() => product ? bom.filter(b => b.product_id === product.id).map(b => ({ material_id: b.material_id, qty_per_unit: b.qty_per_unit })) : [], [product, bom]);
  const [rows, setRows] = useState(initial);

  // Reset when product changes
  useMemo(() => setRows(initial), [initial]);

  if (!product) return null;

  const add = () => setRows([...rows, { material_id: '', qty_per_unit: 0 }]);
  const update = (i: number, patch: Partial<{ material_id: string; qty_per_unit: number }>) => {
    setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };
  const remove = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const valid = rows.filter(r => r.material_id && r.qty_per_unit > 0);
    await onSave(product.id, valid);
    onClose();
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-sm">مكونات: {product.name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">المواد اللازمة لإنتاج <strong>وحدة واحدة</strong> من المنتج</p>
          {rows.map((r, i) => (
            <div key={i} className="flex gap-1.5 items-end">
              <div className="flex-1">
                <Select value={r.material_id} onValueChange={(v) => update(i, { material_id: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر مادة" /></SelectTrigger>
                  <SelectContent>
                    {materials.map(m => <SelectItem key={m.id} value={m.id} className="text-sm">{m.name} ({m.unit})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input type="number" value={r.qty_per_unit || ''} onChange={e => update(i, { qty_per_unit: parseFloat(e.target.value) || 0 })} className="h-9 text-sm w-20" placeholder="كمية" />
              <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => remove(i)}>
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1" onClick={add}>
            <Plus className="h-3 w-3" /> مكون
          </Button>
          <Button onClick={handleSave} className="w-full h-9">حفظ المكونات</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { Factory, ShoppingCart, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProductionMaterial, ProductionProduct, BomEntry } from '@/hooks/useProduction';
import type { FundOption } from '@/types/finance';
import type { Contact } from '@/types/contacts';

interface Props {
  products: ProductionProduct[];
  bom: BomEntry[];
  materials: ProductionMaterial[];
  fundOptions: FundOption[];
  contacts: Contact[];
  onProduce: (params: { product_id: string; quantity: number; notes?: string }) => Promise<boolean>;
  onSell: (params: any) => Promise<boolean>;
}

export function ProductionRunsTab({ products, bom, materials, fundOptions, contacts, onProduce, onSell }: Props) {
  const [openProd, setOpenProd] = useState(false);
  const [openSell, setOpenSell] = useState(false);

  // Production form
  const [prodPid, setProdPid] = useState('');
  const [prodQty, setProdQty] = useState('');

  // Sell form
  const [sellPid, setSellPid] = useState('');
  const [sellQty, setSellQty] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellContact, setSellContact] = useState('');
  const [sellFund, setSellFund] = useState('');
  const [sellPaid, setSellPaid] = useState('');

  const selectedProductForProd = products.find(p => p.id === prodPid);
  const productBom = bom.filter(b => b.product_id === prodPid);

  // Compute material requirement & shortage
  const requirements = productBom.map(b => {
    const mat = materials.find(m => m.id === b.material_id);
    const required = b.qty_per_unit * (parseFloat(prodQty) || 0);
    const available = mat?.quantity || 0;
    return { material: mat, required, available, shortage: Math.max(0, required - available) };
  });
  const hasShortage = requirements.some(r => r.shortage > 0);

  const selectedSellProduct = products.find(p => p.id === sellPid);

  const handleProduce = async () => {
    if (!prodPid || !parseFloat(prodQty)) return;
    const ok = await onProduce({ product_id: prodPid, quantity: parseFloat(prodQty) });
    if (ok) { setProdPid(''); setProdQty(''); setOpenProd(false); }
  };

  const handleSell = async () => {
    if (!sellPid || !parseFloat(sellQty) || !parseFloat(sellPrice)) return;
    const ok = await onSell({
      product_id: sellPid,
      quantity: parseFloat(sellQty),
      unit_price: parseFloat(sellPrice),
      contact_id: sellContact || undefined,
      fund_id: sellFund || undefined,
      paid_amount: parseFloat(sellPaid) || 0,
    });
    if (ok) {
      setSellPid(''); setSellQty(''); setSellPrice(''); setSellContact(''); setSellFund(''); setSellPaid('');
      setOpenSell(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Dialog open={openProd} onOpenChange={setOpenProd}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-10 gap-1" variant="default">
              <Factory className="h-4 w-4" /> تصنيع منتج
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-sm">عملية إنتاج جديدة</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">المنتج *</Label>
                <Select value={prodPid} onValueChange={(v) => { setProdPid(v); setSellPrice(products.find(p => p.id === v)?.sell_price.toString() || ''); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id} className="text-sm">{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">الكمية المنتجة *</Label><Input type="number" value={prodQty} onChange={e => setProdQty(e.target.value)} className="h-9 text-sm" /></div>

              {selectedProductForProd && productBom.length === 0 && (
                <div className="text-[11px] bg-warning/10 text-warning p-2 rounded flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  لم تُعرَّف مكونات لهذا المنتج. أضف المكونات من تبويب "المنتجات" أولاً.
                </div>
              )}

              {requirements.length > 0 && parseFloat(prodQty) > 0 && (
                <div className="bg-muted/40 p-2 rounded space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground">المواد المطلوبة:</p>
                  {requirements.map((r, i) => r.material && (
                    <div key={i} className="flex justify-between text-[11px]">
                      <span>{r.material.name}</span>
                      <span className={r.shortage > 0 ? 'text-destructive font-bold' : 'text-foreground'}>
                        {r.required.toFixed(2)} / متاح {r.available.toFixed(2)} {r.material.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={handleProduce} disabled={!prodPid || hasShortage || productBom.length === 0} className="w-full h-9">
                {hasShortage ? 'مخزون غير كافٍ' : 'تنفيذ الإنتاج'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={openSell} onOpenChange={setOpenSell}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-10 gap-1" variant="secondary">
              <ShoppingCart className="h-4 w-4" /> بيع منتج
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-sm">بيع منتج</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">المنتج *</Label>
                <Select value={sellPid} onValueChange={(v) => { setSellPid(v); const p = products.find(pp => pp.id === v); if (p) setSellPrice(p.sell_price.toString()); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{products.filter(p => p.quantity > 0).map(p => <SelectItem key={p.id} value={p.id} className="text-sm">{p.name} (متاح: {p.quantity})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">الكمية *</Label><Input type="number" value={sellQty} onChange={e => setSellQty(e.target.value)} className="h-9 text-sm" /></div>
                <div><Label className="text-xs">سعر الوحدة *</Label><Input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} className="h-9 text-sm" /></div>
              </div>
              <div>
                <Label className="text-xs">العميل</Label>
                <Select value={sellContact} onValueChange={setSellContact}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">الصندوق (للتحصيل)</Label>
                  <Select value={sellFund} onValueChange={setSellFund}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختياري" /></SelectTrigger>
                    <SelectContent>{fundOptions.map(f => <SelectItem key={f.id} value={f.id} className="text-sm">{f.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">المحصّل</Label><Input type="number" value={sellPaid} onChange={e => setSellPaid(e.target.value)} className="h-9 text-sm" /></div>
              </div>
              {sellPid && sellQty && sellPrice && selectedSellProduct && (
                <div className="text-[11px] bg-muted/40 p-2 rounded space-y-0.5">
                  <div className="flex justify-between">إجمالي البيع: <strong>${(parseFloat(sellQty) * parseFloat(sellPrice)).toFixed(2)}</strong></div>
                  <div className="flex justify-between text-muted-foreground">التكلفة: ${(parseFloat(sellQty) * selectedSellProduct.unit_cost).toFixed(2)}</div>
                  <div className="flex justify-between text-income">الربح المتوقع: ${(parseFloat(sellQty) * (parseFloat(sellPrice) - selectedSellProduct.unit_cost)).toFixed(2)}</div>
                </div>
              )}
              <Button onClick={handleSell} className="w-full h-9">تنفيذ البيع</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="text-[11px] text-muted-foreground text-center pt-2">
        التصنيع يخصم المواد تلقائياً ويحسب التكلفة. البيع يولّد قيداً محاسبياً للعميل.
      </div>
    </div>
  );
}

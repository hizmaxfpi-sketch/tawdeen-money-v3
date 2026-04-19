import { useState, useMemo, useEffect } from 'react';
import { Plus, X, Wrench, AlertCircle, Package, Factory } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import type { ProductionMaterial, ProductionProduct, ProductionService, SaleService, SaleExpense } from '@/hooks/useProduction';
import { unitLabel } from './ServicesTab';
import type { FundOption } from '@/types/finance';
import type { Contact } from '@/types/contacts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductionProduct[];
  materials: ProductionMaterial[];
  services: ProductionService[];
  fundOptions: FundOption[];
  contacts: Contact[];
  onSellProduct: (params: any) => Promise<boolean>;
  onSellMaterial: (params: any) => Promise<boolean>;
}

type Source = 'product' | 'material';

export function UnifiedSellDialog({ open, onOpenChange, products, materials, services, fundOptions, contacts, onSellProduct, onSellMaterial }: Props) {
  const [source, setSource] = useState<Source>('product');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [pricingMode, setPricingMode] = useState<'manual' | 'margin'>('manual');
  const [marginPct, setMarginPct] = useState('30');
  const [contactId, setContactId] = useState('');
  const [fundId, setFundId] = useState('');
  const [paid, setPaid] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // Lines
  const [svcLines, setSvcLines] = useState<SaleService[]>([]);
  const [expLines, setExpLines] = useState<SaleExpense[]>([]);

  // Reset on open/source change
  useEffect(() => {
    if (!open) {
      setSource('product'); setItemId(''); setQty(''); setPrice('');
      setPricingMode('manual'); setMarginPct('30');
      setContactId(''); setFundId(''); setPaid(''); setNotes('');
      setSvcLines([]); setExpLines([]);
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  const items = source === 'product' ? products : materials;
  const selected = items.find(i => i.id === itemId) as any;
  const avgCost = selected ? (source === 'product' ? selected.unit_cost : selected.avg_cost) : 0;
  const stock = selected?.quantity || 0;
  const qtyNum = parseFloat(qty) || 0;
  const stockShort = selected && qtyNum > stock;

  // Auto compute price by margin
  useEffect(() => {
    if (pricingMode === 'margin' && selected && marginPct) {
      const m = parseFloat(marginPct) || 0;
      const computed = avgCost * (1 + m / 100);
      setPrice(computed.toFixed(2));
    }
  }, [pricingMode, marginPct, itemId, avgCost, selected]);

  // When selecting a product in manual mode, default to its sell_price
  const handleSelectItem = (id: string) => {
    setItemId(id);
    if (pricingMode === 'manual' && source === 'product') {
      const p = products.find(pp => pp.id === id);
      if (p) setPrice(p.sell_price.toString());
    } else if (pricingMode === 'manual' && source === 'material') {
      setPrice('');
    }
  };

  const priceNum = parseFloat(price) || 0;
  const baseTotal = qtyNum * priceNum;
  const svcTotal = useMemo(() => svcLines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [svcLines]);
  const expTotal = useMemo(() => expLines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [expLines]);
  const grandTotal = baseTotal + svcTotal;
  const cogs = qtyNum * avgCost;
  const expectedProfit = baseTotal - cogs + svcTotal - expTotal;

  const addSvcLine = () => setSvcLines([...svcLines, { name: '', amount: 0 }]);
  const updateSvcLine = (i: number, patch: Partial<SaleService>) => setSvcLines(svcLines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const removeSvcLine = (i: number) => setSvcLines(svcLines.filter((_, idx) => idx !== i));
  const pickService = (i: number, sid: string) => {
    const sv = services.find(s => s.id === sid);
    if (sv) updateSvcLine(i, {
      service_id: sid,
      name: sv.name,
      quantity: 1,
      unit_price: sv.default_price,
      unit_type: sv.unit_type,
      amount: sv.default_price,
    });
  };
  const updateSvcQty = (i: number, qtyStr: string) => {
    const q = parseFloat(qtyStr) || 0;
    const line = svcLines[i];
    const up = Number(line.unit_price) || 0;
    updateSvcLine(i, { quantity: q, amount: q * up });
  };
  const updateSvcUnitPrice = (i: number, upStr: string) => {
    const up = parseFloat(upStr) || 0;
    const line = svcLines[i];
    const q = Number(line.quantity) || 0;
    updateSvcLine(i, { unit_price: up, amount: q * up });
  };

  const addExpLine = () => setExpLines([...expLines, { description: '', amount: 0, treat_as_business: true }]);
  const updateExpLine = (i: number, patch: Partial<SaleExpense>) => setExpLines(expLines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const removeExpLine = (i: number) => setExpLines(expLines.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!itemId || !qtyNum || !priceNum) { toast.error('املأ الحقول الأساسية'); return; }
    if (stockShort) { toast.error('الكمية أكبر من المخزون المتاح'); return; }
    const validSvc = svcLines.filter(l => l.name.trim() && l.amount > 0);
    const validExp = expLines.filter(l => l.description.trim() && l.amount > 0);

    const baseParams = {
      quantity: qtyNum, unit_price: priceNum,
      contact_id: contactId || undefined, fund_id: fundId || undefined,
      paid_amount: parseFloat(paid) || 0,
      date, notes: notes || undefined,
      services: validSvc, expenses: validExp,
    };
    const ok = source === 'product'
      ? await onSellProduct({ product_id: itemId, ...baseParams })
      : await onSellMaterial({ material_id: itemId, ...baseParams });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-sm">عملية بيع</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Source toggle */}
          <Tabs value={source} onValueChange={(v) => { setSource(v as Source); setItemId(''); setPrice(''); }}>
            <TabsList className="grid grid-cols-2 h-9 w-full">
              <TabsTrigger value="product" className="text-xs gap-1"><Factory className="h-3.5 w-3.5" />منتج جاهز</TabsTrigger>
              <TabsTrigger value="material" className="text-xs gap-1"><Package className="h-3.5 w-3.5" />مادة خام</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Item picker */}
          <div>
            <Label className="text-xs">{source === 'product' ? 'المنتج' : 'المادة'} *</Label>
            <Select value={itemId} onValueChange={handleSelectItem}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={`اختر ${source === 'product' ? 'منتجاً' : 'مادة'}`} /></SelectTrigger>
              <SelectContent>
                {items.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">لا توجد {source === 'product' ? 'منتجات' : 'مواد'}</div>}
                {items.map(i => (
                  <SelectItem key={i.id} value={i.id} className="text-sm" disabled={i.quantity <= 0}>
                    <span className="flex items-center justify-between gap-3 w-full">
                      <span>{i.name}</span>
                      <span className={i.quantity > 0 ? 'text-income text-[10px]' : 'text-destructive text-[10px]'}>
                        {i.quantity > 0 ? `متاح: ${i.quantity} ${i.unit}` : 'نفد'}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pricing mode */}
          <div className="flex items-center justify-between bg-muted/40 px-2 py-1.5 rounded">
            <Label className="text-[11px]">طريقة التسعير</Label>
            <Tabs value={pricingMode} onValueChange={(v) => setPricingMode(v as any)}>
              <TabsList className="h-7">
                <TabsTrigger value="manual" className="text-[10px] px-2 h-6">يدوي</TabsTrigger>
                <TabsTrigger value="margin" className="text-[10px] px-2 h-6">تكلفة + هامش</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {pricingMode === 'margin' && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">هامش الربح %</Label><Input type="number" value={marginPct} onChange={e => setMarginPct(e.target.value)} className="h-9 text-sm" /></div>
              <div className="text-[11px] flex flex-col justify-end pb-1.5">
                <span className="text-muted-foreground">التكلفة: ${avgCost.toFixed(2)}</span>
                <span className="text-income">السعر: ${priceNum.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">الكمية *</Label>
              <Input type="number" value={qty} onChange={e => setQty(e.target.value)} className="h-9 text-sm" />
              {stockShort && <p className="text-[10px] text-destructive mt-0.5">أكبر من المتاح</p>}
            </div>
            <div>
              <Label className="text-xs">سعر الوحدة *</Label>
              <Input type="number" value={price} onChange={e => setPrice(e.target.value)} className="h-9 text-sm" disabled={pricingMode === 'margin'} />
            </div>
          </div>

          <div>
            <Label className="text-xs">العميل</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
              <SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">الصندوق</Label>
              <Select value={fundId} onValueChange={setFundId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختياري" /></SelectTrigger>
                <SelectContent>{fundOptions.map(f => <SelectItem key={f.id} value={f.id} className="text-sm">{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">المحصّل</Label><Input type="number" value={paid} onChange={e => setPaid(e.target.value)} className="h-9 text-sm" /></div>
          </div>

          <div><Label className="text-xs">التاريخ</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm" /></div>

          {/* Services lines */}
          <div className="border border-border rounded-lg p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold flex items-center gap-1"><Wrench className="h-3 w-3 text-primary" />خدمات إضافية</span>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={addSvcLine}>
                <Plus className="h-3 w-3" /> إضافة
              </Button>
            </div>
            {svcLines.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-1">لا توجد خدمات (مثل: قص، تركيب، اجور...)</p>
            ) : svcLines.map((l, i) => {
              const picked = services.find(s => s.id === l.service_id);
              const unitName = picked ? unitLabel(picked) : (l.unit_type ? l.unit_type : 'وحدة');
              return (
                <div key={i} className="bg-muted/30 p-1.5 rounded space-y-1">
                  <div className="flex gap-1 items-center">
                    {services.length > 0 ? (
                      <Select value={l.service_id || ''} onValueChange={(v) => pickService(i, v)}>
                        <SelectTrigger className="h-8 text-[11px] flex-1"><SelectValue placeholder="اختر خدمة" /></SelectTrigger>
                        <SelectContent>{services.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name} (${s.default_price}/{unitLabel(s)})</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input value={l.name} onChange={e => updateSvcLine(i, { name: e.target.value })} placeholder="اسم الخدمة" className="h-8 text-[11px] flex-1" />
                    )}
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={() => removeSvcLine(i)}>
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  {l.service_id && (
                    <div className="grid grid-cols-3 gap-1 items-end">
                      <div>
                        <span className="text-[9px] text-muted-foreground">الكمية ({unitName})</span>
                        <Input type="number" value={l.quantity ?? ''} onChange={e => updateSvcQty(i, e.target.value)} placeholder="0" className="h-7 text-[11px]" />
                      </div>
                      <div>
                        <span className="text-[9px] text-muted-foreground">سعر الوحدة</span>
                        <Input type="number" value={l.unit_price ?? ''} onChange={e => updateSvcUnitPrice(i, e.target.value)} placeholder="0" className="h-7 text-[11px]" />
                      </div>
                      <div>
                        <span className="text-[9px] text-muted-foreground">الإجمالي</span>
                        <Input type="number" value={l.amount || 0} readOnly className="h-7 text-[11px] bg-muted/60 font-semibold" />
                      </div>
                    </div>
                  )}
                  {!l.service_id && (
                    <Input type="number" value={l.amount || ''} onChange={e => updateSvcLine(i, { amount: parseFloat(e.target.value) || 0 })} placeholder="المبلغ" className="h-7 text-[11px]" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Direct expenses */}
          <div className="border border-border rounded-lg p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">مصاريف مباشرة على البيع</span>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={addExpLine}>
                <Plus className="h-3 w-3" /> إضافة
              </Button>
            </div>
            {expLines.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-1">مصاريف خاصة بهذه العملية فقط</p>
            ) : expLines.map((l, i) => (
              <div key={i} className="space-y-1 bg-muted/30 p-1.5 rounded">
                <div className="flex gap-1 items-end">
                  <Input value={l.description} onChange={e => updateExpLine(i, { description: e.target.value })} placeholder="الوصف" className="h-8 text-[11px] flex-1" />
                  <Input type="number" value={l.amount || ''} onChange={e => updateExpLine(i, { amount: parseFloat(e.target.value) || 0 })} placeholder="المبلغ" className="h-8 text-[11px] w-20" />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeExpLine(i)}>
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Select value={l.fund_id || ''} onValueChange={(v) => updateExpLine(i, { fund_id: v })}>
                    <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue placeholder="الصندوق (اختياري)" /></SelectTrigger>
                    <SelectContent>{fundOptions.map(f => <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="flex items-center gap-1.5">
                    <Switch checked={!!l.treat_as_business} onCheckedChange={(c) => updateExpLine(i, { treat_as_business: c })} />
                    <span className="text-[10px] text-muted-foreground">{l.treat_as_business ? 'مصروف أعمال' : 'تحميل على المنتج'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          {selected && qtyNum > 0 && priceNum > 0 && (
            <div className="text-[11px] bg-muted/40 p-2 rounded space-y-0.5">
              <div className="flex justify-between">قيمة المنتج: <strong>${baseTotal.toFixed(2)}</strong></div>
              {svcTotal > 0 && <div className="flex justify-between text-primary">الخدمات: +${svcTotal.toFixed(2)}</div>}
              <div className="flex justify-between border-t border-border pt-0.5 mt-0.5">إجمالي للعميل: <strong>${grandTotal.toFixed(2)}</strong></div>
              <div className="flex justify-between text-muted-foreground">تكلفة المباع: ${cogs.toFixed(2)}</div>
              {expTotal > 0 && <div className="flex justify-between text-destructive">مصاريف مباشرة: -${expTotal.toFixed(2)}</div>}
              <div className={`flex justify-between font-bold ${expectedProfit >= 0 ? 'text-income' : 'text-destructive'}`}>
                صافي الربح المتوقع: ${expectedProfit.toFixed(2)}
              </div>
            </div>
          )}

          {source === 'material' && selected && (
            <div className="text-[10px] bg-primary/5 text-primary p-2 rounded flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              بيع مباشر من المخزون الخام. سيتم خصم الكمية من <strong>{selected.name}</strong>.
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!itemId || stockShort || !qtyNum || !priceNum} className="w-full h-9">
            تنفيذ البيع
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

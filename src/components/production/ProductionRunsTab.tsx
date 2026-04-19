import { useState, useEffect, useMemo } from 'react';
import { Factory, ShoppingCart, AlertCircle, History, Filter, X, Calendar, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
  onUpdateSale: (saleId: string, params: any) => Promise<boolean>;
  onDeleteSale: (saleId: string) => Promise<boolean>;
  onDeleteRun: (runId: string) => Promise<boolean>;
}

interface SaleRow {
  id: string;
  date: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  cost_at_sale: number;
  profit: number;
  paid_amount: number;
  contact_id: string | null;
  notes: string | null;
}

interface RunRow {
  id: string;
  date: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes: string | null;
}

export function ProductionRunsTab({ products, bom, materials, fundOptions, contacts, onProduce, onSell }: Props) {
  const [openProd, setOpenProd] = useState(false);
  const [openSell, setOpenSell] = useState(false);
  const [tab, setTab] = useState<'actions' | 'sales' | 'runs'>('actions');

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

  // History data
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);

  // History filters
  const [hProduct, setHProduct] = useState<string>('all');
  const [hContact, setHContact] = useState<string>('all');
  const [hFrom, setHFrom] = useState('');
  const [hTo, setHTo] = useState('');

  const loadHistory = async () => {
    const [sRes, rRes] = await Promise.all([
      supabase.from('production_sales').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('production_runs').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    if (sRes.data) setSales(sRes.data as SaleRow[]);
    if (rRes.data) setRuns(rRes.data as RunRow[]);
  };

  useEffect(() => {
    loadHistory();
    // realtime
    const ch = supabase
      .channel('production-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_sales' }, () => loadHistory())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_runs' }, () => loadHistory())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

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
  const sellQtyNum = parseFloat(sellQty) || 0;
  const stockShort = selectedSellProduct ? sellQtyNum > selectedSellProduct.quantity : false;

  const handleProduce = async () => {
    if (!prodPid || !parseFloat(prodQty)) return;
    const ok = await onProduce({ product_id: prodPid, quantity: parseFloat(prodQty) });
    if (ok) { setProdPid(''); setProdQty(''); setOpenProd(false); }
  };

  const handleSell = async () => {
    if (!sellPid || !parseFloat(sellQty) || !parseFloat(sellPrice)) return;
    if (stockShort) { toast.error('الكمية المطلوبة أكبر من المخزون المتاح'); return; }
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

  // Filtered history
  const applyFilter = <T extends { date: string; product_id: string; contact_id?: string | null }>(rows: T[]) => {
    return rows.filter(r => {
      if (hProduct !== 'all' && r.product_id !== hProduct) return false;
      if (hContact !== 'all' && (r.contact_id || '') !== hContact) return false;
      if (hFrom && r.date < hFrom) return false;
      if (hTo && r.date > hTo) return false;
      return true;
    });
  };
  const filteredSales = useMemo(() => applyFilter(sales), [sales, hProduct, hContact, hFrom, hTo]);
  const filteredRuns = useMemo(() => applyFilter(runs), [runs, hProduct, hFrom, hTo]);

  const salesTotals = useMemo(() => {
    const total = filteredSales.reduce((s, r) => s + Number(r.total_amount), 0);
    const cost = filteredSales.reduce((s, r) => s + Number(r.cost_at_sale), 0);
    const profit = filteredSales.reduce((s, r) => s + Number(r.profit), 0);
    const qty = filteredSales.reduce((s, r) => s + Number(r.quantity), 0);
    return { total, cost, profit, qty };
  }, [filteredSales]);

  const runsTotals = useMemo(() => {
    const qty = filteredRuns.reduce((s, r) => s + Number(r.quantity), 0);
    const cost = filteredRuns.reduce((s, r) => s + Number(r.total_cost), 0);
    return { qty, cost };
  }, [filteredRuns]);

  const productName = (id: string) => products.find(p => p.id === id)?.name || '—';
  const contactName = (id: string | null | undefined) => id ? (contacts.find(c => c.id === id)?.name || '—') : '—';
  const hasFilters = hProduct !== 'all' || hContact !== 'all' || hFrom || hTo;
  const clearFilters = () => { setHProduct('all'); setHContact('all'); setHFrom(''); setHTo(''); };

  return (
    <div className="space-y-2">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="actions" className="text-xs gap-1"><Factory className="h-3.5 w-3.5" />العمليات</TabsTrigger>
          <TabsTrigger value="sales" className="text-xs gap-1"><ShoppingCart className="h-3.5 w-3.5" />المبيعات</TabsTrigger>
          <TabsTrigger value="runs" className="text-xs gap-1"><History className="h-3.5 w-3.5" />سجل الإنتاج</TabsTrigger>
        </TabsList>

        {/* ====== Actions Tab ====== */}
        <TabsContent value="actions" className="mt-3 space-y-2">
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
                    <Select value={prodPid} onValueChange={setProdPid}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                      <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id} className="text-sm">{p.name} (مخزون: {p.quantity})</SelectItem>)}</SelectContent>
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
                <Button size="sm" className="h-10 gap-1" variant="secondary" disabled={products.length === 0}>
                  <ShoppingCart className="h-4 w-4" /> بيع منتج
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle className="text-sm">بيع منتج</DialogTitle></DialogHeader>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">المنتج *</Label>
                    <Select value={sellPid} onValueChange={(v) => { setSellPid(v); const p = products.find(pp => pp.id === v); if (p) setSellPrice(p.sell_price.toString()); }}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                      <SelectContent>
                        {products.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">لا توجد منتجات. أضِف منتجاً من تبويب "المنتجات".</div>}
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id} className="text-sm" disabled={p.quantity <= 0}>
                            <span className="flex items-center justify-between gap-3 w-full">
                              <span>{p.name}</span>
                              <span className={p.quantity > 0 ? 'text-income text-[10px]' : 'text-destructive text-[10px]'}>
                                {p.quantity > 0 ? `متاح: ${p.quantity}` : 'نفد المخزون'}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedSellProduct && selectedSellProduct.quantity <= 0 && (
                      <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> لا يوجد مخزون. نفّذ "تصنيع منتج" أولاً.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">الكمية *</Label>
                      <Input type="number" value={sellQty} onChange={e => setSellQty(e.target.value)} className="h-9 text-sm" />
                      {stockShort && <p className="text-[10px] text-destructive mt-0.5">أكبر من المتاح</p>}
                    </div>
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
                  <Button onClick={handleSell} disabled={stockShort || !selectedSellProduct || selectedSellProduct.quantity <= 0} className="w-full h-9">تنفيذ البيع</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="text-[11px] text-muted-foreground text-center pt-2">
            التصنيع يخصم المواد تلقائياً ويحسب التكلفة. البيع يولّد قيداً محاسبياً للعميل.
          </div>
        </TabsContent>

        {/* ====== Sales History ====== */}
        <TabsContent value="sales" className="mt-3 space-y-2">
          <HistoryFilters
            products={products} contacts={contacts} showContact
            hProduct={hProduct} setHProduct={setHProduct}
            hContact={hContact} setHContact={setHContact}
            hFrom={hFrom} setHFrom={setHFrom} hTo={hTo} setHTo={setHTo}
            hasFilters={!!hasFilters} onClear={clearFilters}
          />
          <div className="grid grid-cols-4 gap-1.5">
            <MiniStat label="مبيعات" value={`$${salesTotals.total.toFixed(2)}`} color="text-income" />
            <MiniStat label="تكلفة" value={`$${salesTotals.cost.toFixed(2)}`} color="text-expense" />
            <MiniStat label="ربح" value={`$${salesTotals.profit.toFixed(2)}`} color={salesTotals.profit >= 0 ? 'text-income' : 'text-expense'} />
            <MiniStat label="الكمية" value={salesTotals.qty.toString()} color="text-primary" />
          </div>
          {filteredSales.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
              لا توجد مبيعات
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredSales.map(s => (
                <div key={s.id} className="rounded-lg bg-card border border-border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <ShoppingCart className="h-3.5 w-3.5 text-income shrink-0" />
                        <span className="text-sm font-semibold">{productName(s.product_id)}</span>
                        <span className="text-[10px] text-muted-foreground">× {s.quantity}</span>
                      </div>
                      <div className="flex gap-2 mt-1 text-[11px] flex-wrap">
                        <span>عميل: <strong>{contactName(s.contact_id)}</strong></span>
                        <span className="text-muted-foreground">سعر: ${Number(s.unit_price).toFixed(2)}</span>
                      </div>
                      <div className="flex gap-2 mt-0.5 text-[11px]">
                        <span className="text-income">إجمالي: ${Number(s.total_amount).toFixed(2)}</span>
                        <span className="text-muted-foreground">تكلفة: ${Number(s.cost_at_sale).toFixed(2)}</span>
                        <span className={Number(s.profit) >= 0 ? 'text-income' : 'text-expense'}>ربح: ${Number(s.profit).toFixed(2)}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                      <Calendar className="h-2.5 w-2.5" />{s.date}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ====== Production Runs History ====== */}
        <TabsContent value="runs" className="mt-3 space-y-2">
          <HistoryFilters
            products={products} contacts={contacts}
            hProduct={hProduct} setHProduct={setHProduct}
            hContact={hContact} setHContact={setHContact}
            hFrom={hFrom} setHFrom={setHFrom} hTo={hTo} setHTo={setHTo}
            hasFilters={!!hasFilters} onClear={clearFilters}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <MiniStat label="الوحدات المنتجة" value={runsTotals.qty.toString()} color="text-primary" />
            <MiniStat label="إجمالي التكلفة" value={`$${runsTotals.cost.toFixed(2)}`} color="text-expense" />
          </div>
          {filteredRuns.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              <Factory className="h-8 w-8 mx-auto mb-2 opacity-30" />
              لا توجد عمليات تصنيع
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredRuns.map(r => (
                <div key={r.id} className="rounded-lg bg-card border border-border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Factory className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-sm font-semibold">{productName(r.product_id)}</span>
                        <span className="text-[10px] text-muted-foreground">× {r.quantity}</span>
                      </div>
                      <div className="flex gap-2 mt-1 text-[11px]">
                        <span className="text-muted-foreground">تكلفة الوحدة: ${Number(r.unit_cost).toFixed(2)}</span>
                        <span className="text-expense">الإجمالي: ${Number(r.total_cost).toFixed(2)}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                      <Calendar className="h-2.5 w-2.5" />{r.date}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2 text-center">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={`text-xs font-bold ${color}`}>{value}</p>
    </div>
  );
}

function HistoryFilters({
  products, contacts, showContact = false,
  hProduct, setHProduct, hContact, setHContact,
  hFrom, setHFrom, hTo, setHTo,
  hasFilters, onClear,
}: {
  products: ProductionProduct[];
  contacts: Contact[];
  showContact?: boolean;
  hProduct: string; setHProduct: (v: string) => void;
  hContact: string; setHContact: (v: string) => void;
  hFrom: string; setHFrom: (v: string) => void;
  hTo: string; setHTo: (v: string) => void;
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg bg-muted/30 p-2 space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Filter className="h-3 w-3" /> الفلاتر
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-5 px-1.5 ml-auto text-[10px]" onClick={onClear}>
            <X className="h-2.5 w-2.5 mr-0.5" /> مسح
          </Button>
        )}
      </div>
      <div className={`grid gap-1.5 ${showContact ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Select value={hProduct} onValueChange={setHProduct}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="المنتج" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">كل المنتجات</SelectItem>
            {products.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {showContact && (
          <Select value={hContact} onValueChange={setHContact}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="العميل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">كل العملاء</SelectItem>
              {contacts.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Input type="date" value={hFrom} onChange={e => setHFrom(e.target.value)} className="h-8 text-xs" placeholder="من" />
        <Input type="date" value={hTo} onChange={e => setHTo(e.target.value)} className="h-8 text-xs" placeholder="إلى" />
      </div>
    </div>
  );
}

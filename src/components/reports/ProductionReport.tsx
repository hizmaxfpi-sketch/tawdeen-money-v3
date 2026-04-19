import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Factory, ShoppingCart, Package, TrendingUp, Filter, X, Calendar, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useProduction } from '@/hooks/useProduction';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import type { Currency } from '@/hooks/useCurrencies';
import { convertForDisplay, getCurrencySymbol } from '@/components/shared/CurrencyDisplaySelector';

interface SaleRow {
  id: string; date: string; product_id: string; quantity: number;
  unit_price: number; total_amount: number; cost_at_sale: number; profit: number;
  paid_amount: number; contact_id: string | null;
}

interface RunRow {
  id: string; date: string; product_id: string; quantity: number;
  unit_cost: number; total_cost: number;
}

interface Props {
  currencies: Currency[];
  displayCurrency: string;
}

export function ProductionReport({ currencies, displayCurrency }: Props) {
  const { products, materials, summary } = useProduction();
  const { contacts } = useSupabaseContacts();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);

  // Filters
  const [fProduct, setFProduct] = useState<string>('all');
  const [fContact, setFContact] = useState<string>('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  const conv = (v: number) => convertForDisplay(v, displayCurrency, currencies);
  const sym = getCurrencySymbol(displayCurrency, currencies);
  const fmt = (v: number) => `${sym}${conv(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  useEffect(() => {
    const load = async () => {
      const [s, r] = await Promise.all([
        supabase.from('production_sales').select('*').order('date', { ascending: false }),
        supabase.from('production_runs').select('*').order('date', { ascending: false }),
      ]);
      if (s.data) setSales(s.data as SaleRow[]);
      if (r.data) setRuns(r.data as RunRow[]);
    };
    load();
    const ch = supabase
      .channel('production-report')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_sales' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_runs' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filteredSales = useMemo(() => sales.filter(s => {
    if (fProduct !== 'all' && s.product_id !== fProduct) return false;
    if (fContact !== 'all' && (s.contact_id || '') !== fContact) return false;
    if (fFrom && s.date < fFrom) return false;
    if (fTo && s.date > fTo) return false;
    return true;
  }), [sales, fProduct, fContact, fFrom, fTo]);

  const filteredRuns = useMemo(() => runs.filter(r => {
    if (fProduct !== 'all' && r.product_id !== fProduct) return false;
    if (fFrom && r.date < fFrom) return false;
    if (fTo && r.date > fTo) return false;
    return true;
  }), [runs, fProduct, fFrom, fTo]);

  const stats = useMemo(() => {
    const sales_total = filteredSales.reduce((s, r) => s + Number(r.total_amount), 0);
    const sales_cost = filteredSales.reduce((s, r) => s + Number(r.cost_at_sale), 0);
    const sales_profit = filteredSales.reduce((s, r) => s + Number(r.profit), 0);
    const sales_qty = filteredSales.reduce((s, r) => s + Number(r.quantity), 0);
    const sales_paid = filteredSales.reduce((s, r) => s + Number(r.paid_amount), 0);
    const sales_remaining = sales_total - sales_paid;
    const runs_qty = filteredRuns.reduce((s, r) => s + Number(r.quantity), 0);
    const runs_cost = filteredRuns.reduce((s, r) => s + Number(r.total_cost), 0);
    return { sales_total, sales_cost, sales_profit, sales_qty, sales_paid, sales_remaining, runs_qty, runs_cost };
  }, [filteredSales, filteredRuns]);

  const productName = (id: string) => products.find(p => p.id === id)?.name || '—';
  const contactName = (id: string | null) => id ? (contacts.find(c => c.id === id)?.name || '—') : '—';
  const hasFilters = fProduct !== 'all' || fContact !== 'all' || fFrom || fTo;
  const clear = () => { setFProduct('all'); setFContact('all'); setFFrom(''); setFTo(''); };

  // Stock alerts
  const lowStock = products.filter(p => p.quantity <= 0);
  const lowMaterials = materials.filter(m => m.quantity <= 0);

  return (
    <div className="space-y-3">
      {/* ====== Summary Cards ====== */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-3 shadow-sm border border-border">
        <h3 className="text-xs font-bold mb-3">ملخص الإنتاج</h3>
        <div className="grid grid-cols-3 gap-2">
          <StatCard icon={Package} label="قيمة المخزون" value={fmt(summary.materialsValue + summary.productsValue)} color="text-primary" />
          <StatCard icon={ShoppingCart} label="مبيعات" value={fmt(stats.sales_total)} color="text-income" />
          <StatCard icon={TrendingUp} label="ربح" value={fmt(stats.sales_profit)} color={stats.sales_profit >= 0 ? 'text-income' : 'text-expense'} />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <StatCard icon={Factory} label="وحدات منتجة" value={stats.runs_qty.toString()} color="text-primary" />
          <StatCard icon={ShoppingCart} label="وحدات مباعة" value={stats.sales_qty.toString()} color="text-income" />
          <StatCard icon={AlertTriangle} label="متبقي للتحصيل" value={fmt(stats.sales_remaining)} color="text-amber-600" />
        </div>
      </motion.div>

      {/* ====== Stock Warnings ====== */}
      {(lowStock.length > 0 || lowMaterials.length > 0) && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> تنبيهات المخزون
          </div>
          {lowMaterials.length > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              مواد نفدت ({lowMaterials.length}): {lowMaterials.slice(0, 3).map(m => m.name).join('، ')}{lowMaterials.length > 3 ? '...' : ''}
            </p>
          )}
          {lowStock.length > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              منتجات نفدت ({lowStock.length}): {lowStock.slice(0, 3).map(p => p.name).join('، ')}{lowStock.length > 3 ? '...' : ''}
            </p>
          )}
        </div>
      )}

      {/* ====== Filters ====== */}
      <div className="rounded-lg bg-muted/30 p-2 space-y-1.5">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Filter className="h-3 w-3" /> الفلاتر
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-5 px-1.5 ml-auto text-[10px]" onClick={clear}>
              <X className="h-2.5 w-2.5 mr-0.5" /> مسح
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Select value={fProduct} onValueChange={setFProduct}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">كل المنتجات</SelectItem>
              {products.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fContact} onValueChange={setFContact}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="العميل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">كل العملاء</SelectItem>
              {contacts.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} className="h-8 text-xs" />
          <Input type="date" value={fTo} onChange={e => setFTo(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>

      {/* ====== Sales List ====== */}
      <div className="rounded-xl bg-card p-3 shadow-sm border border-border">
        <h3 className="text-xs font-bold mb-2 flex items-center gap-1">
          <ShoppingCart className="h-3.5 w-3.5 text-income" /> المبيعات ({filteredSales.length})
        </h3>
        {filteredSales.length === 0 ? (
          <p className="text-center text-[11px] text-muted-foreground py-4">لا توجد مبيعات</p>
        ) : (
          <div className="space-y-1">
            {filteredSales.slice(0, 50).map(s => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-border/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{productName(s.product_id)} × {s.quantity}</div>
                  <div className="text-muted-foreground text-[10px]">{contactName(s.contact_id)} • {s.date}</div>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-income font-bold">{fmt(Number(s.total_amount))}</div>
                  <div className={`text-[10px] ${Number(s.profit) >= 0 ? 'text-income' : 'text-expense'}`}>ربح: {fmt(Number(s.profit))}</div>
                </div>
              </div>
            ))}
            {filteredSales.length > 50 && (
              <p className="text-[10px] text-muted-foreground text-center pt-1">عرض 50 من {filteredSales.length}</p>
            )}
          </div>
        )}
      </div>

      {/* ====== Runs List ====== */}
      <div className="rounded-xl bg-card p-3 shadow-sm border border-border">
        <h3 className="text-xs font-bold mb-2 flex items-center gap-1">
          <Factory className="h-3.5 w-3.5 text-primary" /> عمليات الإنتاج ({filteredRuns.length})
        </h3>
        {filteredRuns.length === 0 ? (
          <p className="text-center text-[11px] text-muted-foreground py-4">لا توجد عمليات</p>
        ) : (
          <div className="space-y-1">
            {filteredRuns.slice(0, 50).map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-border/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{productName(r.product_id)} × {r.quantity}</div>
                  <div className="text-muted-foreground text-[10px]">
                    <Calendar className="inline h-2.5 w-2.5 mr-0.5" />{r.date}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-expense font-bold">{fmt(Number(r.total_cost))}</div>
                  <div className="text-[10px] text-muted-foreground">وحدة: {fmt(Number(r.unit_cost))}</div>
                </div>
              </div>
            ))}
            {filteredRuns.length > 50 && (
              <p className="text-[10px] text-muted-foreground text-center pt-1">عرض 50 من {filteredRuns.length}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2 text-center">
      <div className="flex items-center justify-center gap-1 mb-1">
        <Icon className={`h-3 w-3 ${color}`} />
        <p className="text-[9px] text-muted-foreground">{label}</p>
      </div>
      <p className={`text-xs font-bold ${color}`}>{value}</p>
    </div>
  );
}

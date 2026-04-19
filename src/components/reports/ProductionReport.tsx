import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Factory, ShoppingCart, Package, TrendingUp, Filter, X, AlertTriangle,
  ChevronDown, ChevronUp, Printer, FileSpreadsheet, FileText, Eye,
  DollarSign, Wallet, Boxes,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useProduction } from '@/hooks/useProduction';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import type { Currency } from '@/hooks/useCurrencies';
import { convertForDisplay, getCurrencySymbol } from '@/components/shared/CurrencyDisplaySelector';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SaleRow {
  id: string; date: string; product_id: string | null; material_id: string | null;
  source_type: string; quantity: number; unit_price: number; total_amount: number;
  cost_at_sale: number; profit: number; paid_amount: number; contact_id: string | null;
  services_total: number; expenses_total: number; notes: string | null;
}
interface RunRow {
  id: string; date: string; product_id: string; quantity: number;
  unit_cost: number; total_cost: number; notes: string | null;
}
interface PurchaseRow {
  id: string; date: string; material_id: string; quantity: number;
  unit_price: number; total_amount: number; paid_amount: number;
  contact_id: string | null; notes: string | null;
}

interface Props {
  currencies: Currency[];
  displayCurrency: string;
}

type TabKey = 'sales' | 'runs' | 'purchases';

export function ProductionReport({ currencies, displayCurrency }: Props) {
  const { products, materials, summary } = useProduction();
  const { contacts } = useSupabaseContacts();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);

  const [tab, setTab] = useState<TabKey>('sales');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<{ kind: TabKey; data: any } | null>(null);

  // Filters
  const [fProduct, setFProduct] = useState<string>('all');
  const [fMaterial, setFMaterial] = useState<string>('all');
  const [fContact, setFContact] = useState<string>('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  const conv = (v: number) => convertForDisplay(v, displayCurrency, currencies);
  const sym = getCurrencySymbol(displayCurrency, currencies);
  const fmt = (v: number) => `${sym}${conv(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  useEffect(() => {
    const load = async () => {
      const [s, r, p] = await Promise.all([
        supabase.from('production_sales').select('*').order('date', { ascending: false }),
        supabase.from('production_runs').select('*').order('date', { ascending: false }),
        supabase.from('material_purchases').select('*').order('date', { ascending: false }),
      ]);
      if (s.data) setSales(s.data as SaleRow[]);
      if (r.data) setRuns(r.data as RunRow[]);
      if (p.data) setPurchases(p.data as PurchaseRow[]);
    };
    load();
    const ch = supabase
      .channel('production-report')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_sales' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_runs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_purchases' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const productName = (id: string | null) => id ? (products.find(p => p.id === id)?.name || '—') : '—';
  const materialName = (id: string | null) => id ? (materials.find(m => m.id === id)?.name || '—') : '—';
  const contactName = (id: string | null) => id ? (contacts.find(c => c.id === id)?.name || '—') : '—';

  const filteredSales = useMemo(() => sales.filter(s => {
    if (fProduct !== 'all' && s.product_id !== fProduct) return false;
    if (fMaterial !== 'all' && s.material_id !== fMaterial) return false;
    if (fContact !== 'all' && (s.contact_id || '') !== fContact) return false;
    if (fFrom && s.date < fFrom) return false;
    if (fTo && s.date > fTo) return false;
    return true;
  }), [sales, fProduct, fMaterial, fContact, fFrom, fTo]);

  const filteredRuns = useMemo(() => runs.filter(r => {
    if (fProduct !== 'all' && r.product_id !== fProduct) return false;
    if (fFrom && r.date < fFrom) return false;
    if (fTo && r.date > fTo) return false;
    return true;
  }), [runs, fProduct, fFrom, fTo]);

  const filteredPurchases = useMemo(() => purchases.filter(p => {
    if (fMaterial !== 'all' && p.material_id !== fMaterial) return false;
    if (fContact !== 'all' && (p.contact_id || '') !== fContact) return false;
    if (fFrom && p.date < fFrom) return false;
    if (fTo && p.date > fTo) return false;
    return true;
  }), [purchases, fMaterial, fContact, fFrom, fTo]);

  // ============ KPIs ============
  const kpis = useMemo(() => {
    const sales_total = filteredSales.reduce((a, r) => a + Number(r.total_amount), 0);
    const sales_paid = filteredSales.reduce((a, r) => a + Number(r.paid_amount), 0);
    const sales_remaining = sales_total - sales_paid;
    const sales_cost = filteredSales.reduce((a, r) => a + Number(r.cost_at_sale), 0);
    const sales_profit = filteredSales.reduce((a, r) => a + Number(r.profit), 0);
    const sales_qty = filteredSales.reduce((a, r) => a + Number(r.quantity), 0);
    const sales_count = filteredSales.length;

    const runs_qty = filteredRuns.reduce((a, r) => a + Number(r.quantity), 0);
    const runs_cost = filteredRuns.reduce((a, r) => a + Number(r.total_cost), 0);
    const runs_count = filteredRuns.length;

    const purchases_total = filteredPurchases.reduce((a, p) => a + Number(p.total_amount), 0);
    const purchases_paid = filteredPurchases.reduce((a, p) => a + Number(p.paid_amount), 0);
    const purchases_remaining = purchases_total - purchases_paid;
    const purchases_qty = filteredPurchases.reduce((a, p) => a + Number(p.quantity), 0);
    const purchases_count = filteredPurchases.length;

    return {
      sales_total, sales_paid, sales_remaining, sales_cost, sales_profit, sales_qty, sales_count,
      runs_qty, runs_cost, runs_count,
      purchases_total, purchases_paid, purchases_remaining, purchases_qty, purchases_count,
    };
  }, [filteredSales, filteredRuns, filteredPurchases]);

  const hasFilters = fProduct !== 'all' || fMaterial !== 'all' || fContact !== 'all' || !!fFrom || !!fTo;
  const clear = () => { setFProduct('all'); setFMaterial('all'); setFContact('all'); setFFrom(''); setFTo(''); };

  const lowStock = products.filter(p => p.quantity <= 0);
  const lowMaterials = materials.filter(m => m.quantity <= 0);

  // ============ Export Helpers ============
  const handlePrint = () => window.print();

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summaryRows = [
        ['ملخص تقرير الإنتاج'],
        ['التاريخ', new Date().toLocaleDateString('en-GB')],
        [],
        ['— المبيعات —'],
        ['عدد الفواتير', kpis.sales_count],
        ['الكميات المباعة', kpis.sales_qty],
        ['إجمالي المبيعات', conv(kpis.sales_total)],
        ['المقبوض', conv(kpis.sales_paid)],
        ['المتبقي', conv(kpis.sales_remaining)],
        ['تكلفة البضاعة', conv(kpis.sales_cost)],
        ['صافي الربح', conv(kpis.sales_profit)],
        [],
        ['— الإنتاج —'],
        ['عدد الأوامر', kpis.runs_count],
        ['الوحدات المنتجة', kpis.runs_qty],
        ['تكلفة التشغيل', conv(kpis.runs_cost)],
        [],
        ['— المشتريات —'],
        ['عدد العمليات', kpis.purchases_count],
        ['كمية المشتريات', kpis.purchases_qty],
        ['إجمالي المشتريات', conv(kpis.purchases_total)],
        ['المسدد', conv(kpis.purchases_paid)],
        ['المتبقي', conv(kpis.purchases_remaining)],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'الملخص');

      // Sales sheet
      const salesData = filteredSales.map(s => ({
        'التاريخ': s.date,
        'النوع': s.source_type === 'material' ? 'مادة خام' : 'منتج',
        'الصنف': s.source_type === 'material' ? materialName(s.material_id) : productName(s.product_id),
        'العميل': contactName(s.contact_id),
        'الكمية': Number(s.quantity),
        'سعر الوحدة': conv(Number(s.unit_price)),
        'الإجمالي': conv(Number(s.total_amount)),
        'المقبوض': conv(Number(s.paid_amount)),
        'المتبقي': conv(Number(s.total_amount) - Number(s.paid_amount)),
        'التكلفة': conv(Number(s.cost_at_sale)),
        'الربح': conv(Number(s.profit)),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), 'المبيعات');

      // Runs sheet
      const runsData = filteredRuns.map(r => ({
        'التاريخ': r.date,
        'المنتج': productName(r.product_id),
        'الكمية': Number(r.quantity),
        'تكلفة الوحدة': conv(Number(r.unit_cost)),
        'إجمالي التكلفة': conv(Number(r.total_cost)),
        'ملاحظات': r.notes || '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(runsData), 'الإنتاج');

      // Purchases sheet
      const purchasesData = filteredPurchases.map(p => ({
        'التاريخ': p.date,
        'المادة': materialName(p.material_id),
        'المورد': contactName(p.contact_id),
        'الكمية': Number(p.quantity),
        'سعر الوحدة': conv(Number(p.unit_price)),
        'الإجمالي': conv(Number(p.total_amount)),
        'المسدد': conv(Number(p.paid_amount)),
        'المتبقي': conv(Number(p.total_amount) - Number(p.paid_amount)),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchasesData), 'المشتريات');

      XLSX.writeFile(wb, `تقرير_الانتاج_${Date.now()}.xlsx`);
      toast.success('تم تصدير ملف Excel');
    } catch (e) {
      console.error(e);
      toast.error('فشل التصدير');
    }
  };

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      await import('jspdf-autotable');
      const doc = new jsPDF('p', 'mm', 'a4');
      const pw = doc.internal.pageSize.getWidth();

      doc.setFillColor(25, 65, 120);
      doc.rect(0, 0, pw, 32, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text('Tawdeen - Production Report', pw / 2, 14, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, pw / 2, 24, { align: 'center' });

      let y = 42;
      doc.setTextColor(25, 65, 120);
      doc.setFontSize(12);
      doc.text('Summary', 14, y); y += 4;

      (doc as any).autoTable({
        startY: y,
        head: [['Metric', 'Value']],
        body: [
          ['Sales Invoices', String(kpis.sales_count)],
          ['Sold Qty', String(kpis.sales_qty)],
          ['Sales Total', `${sym}${conv(kpis.sales_total).toLocaleString()}`],
          ['Collected', `${sym}${conv(kpis.sales_paid).toLocaleString()}`],
          ['Remaining', `${sym}${conv(kpis.sales_remaining).toLocaleString()}`],
          ['COGS', `${sym}${conv(kpis.sales_cost).toLocaleString()}`],
          ['Net Profit', `${sym}${conv(kpis.sales_profit).toLocaleString()}`],
          ['Production Runs', String(kpis.runs_count)],
          ['Units Produced', String(kpis.runs_qty)],
          ['Run Cost', `${sym}${conv(kpis.runs_cost).toLocaleString()}`],
          ['Purchases', String(kpis.purchases_count)],
          ['Purchase Total', `${sym}${conv(kpis.purchases_total).toLocaleString()}`],
          ['Purchase Paid', `${sym}${conv(kpis.purchases_paid).toLocaleString()}`],
          ['Purchase Remaining', `${sym}${conv(kpis.purchases_remaining).toLocaleString()}`],
        ],
        styles: { fontSize: 9, halign: 'center' },
        headStyles: { fillColor: [25, 65, 120], textColor: 255 },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      const renderTable = (title: string, head: string[], body: any[][]) => {
        if (body.length === 0) return;
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setTextColor(25, 65, 120);
        doc.text(title, 14, y); y += 3;
        (doc as any).autoTable({
          startY: y, head: [head], body,
          styles: { fontSize: 7.5, halign: 'center' },
          headStyles: { fillColor: [25, 65, 120], textColor: 255, fontSize: 8 },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: 8, right: 8 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      };

      renderTable('Sales',
        ['Date', 'Item', 'Customer', 'Qty', 'Total', 'Paid', 'Profit'],
        filteredSales.map(s => [
          s.date,
          s.source_type === 'material' ? materialName(s.material_id) : productName(s.product_id),
          contactName(s.contact_id),
          s.quantity,
          `${sym}${conv(Number(s.total_amount)).toLocaleString()}`,
          `${sym}${conv(Number(s.paid_amount)).toLocaleString()}`,
          `${sym}${conv(Number(s.profit)).toLocaleString()}`,
        ])
      );

      renderTable('Production Runs',
        ['Date', 'Product', 'Qty', 'Unit Cost', 'Total Cost'],
        filteredRuns.map(r => [
          r.date, productName(r.product_id), r.quantity,
          `${sym}${conv(Number(r.unit_cost)).toLocaleString()}`,
          `${sym}${conv(Number(r.total_cost)).toLocaleString()}`,
        ])
      );

      renderTable('Material Purchases',
        ['Date', 'Material', 'Vendor', 'Qty', 'Total', 'Paid', 'Remaining'],
        filteredPurchases.map(p => [
          p.date, materialName(p.material_id), contactName(p.contact_id), p.quantity,
          `${sym}${conv(Number(p.total_amount)).toLocaleString()}`,
          `${sym}${conv(Number(p.paid_amount)).toLocaleString()}`,
          `${sym}${conv(Number(p.total_amount) - Number(p.paid_amount)).toLocaleString()}`,
        ])
      );

      doc.save(`Production_Report_${Date.now()}.pdf`);
      toast.success('تم تصدير PDF');
    } catch (e) {
      console.error(e);
      toast.error('فشل تصدير PDF');
    }
  };

  // ============ KPI Cards by tab ============
  const tabKpis = useMemo(() => {
    if (tab === 'sales') return [
      { icon: ShoppingCart, label: 'إجمالي المبيعات', value: fmt(kpis.sales_total), color: 'text-income' },
      { icon: Wallet, label: 'المقبوض', value: fmt(kpis.sales_paid), color: 'text-income' },
      { icon: AlertTriangle, label: 'المتبقي', value: fmt(kpis.sales_remaining), color: 'text-amber-600' },
      { icon: TrendingUp, label: 'صافي الربح', value: fmt(kpis.sales_profit), color: kpis.sales_profit >= 0 ? 'text-income' : 'text-expense' },
      { icon: Boxes, label: 'الكميات', value: kpis.sales_qty.toLocaleString('en-US'), color: 'text-primary' },
      { icon: FileText, label: 'الفواتير', value: kpis.sales_count.toLocaleString('en-US'), color: 'text-primary' },
    ];
    if (tab === 'runs') return [
      { icon: Factory, label: 'أوامر الإنتاج', value: kpis.runs_count.toLocaleString('en-US'), color: 'text-primary' },
      { icon: Boxes, label: 'الوحدات المنتجة', value: kpis.runs_qty.toLocaleString('en-US'), color: 'text-primary' },
      { icon: DollarSign, label: 'تكلفة التشغيل', value: fmt(kpis.runs_cost), color: 'text-expense' },
    ];
    return [
      { icon: Package, label: 'عدد عمليات الشراء', value: kpis.purchases_count.toLocaleString('en-US'), color: 'text-primary' },
      { icon: Boxes, label: 'الكميات المشتراة', value: kpis.purchases_qty.toLocaleString('en-US'), color: 'text-primary' },
      { icon: DollarSign, label: 'إجمالي المشتريات', value: fmt(kpis.purchases_total), color: 'text-expense' },
      { icon: Wallet, label: 'المسدد', value: fmt(kpis.purchases_paid), color: 'text-income' },
      { icon: AlertTriangle, label: 'المتبقي', value: fmt(kpis.purchases_remaining), color: 'text-amber-600' },
    ];
  }, [tab, kpis, fmt]);

  return (
    <div className="space-y-3 print:space-y-2">
      {/* ====== Header & Actions ====== */}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <h2 className="text-sm font-bold flex items-center gap-1.5">
          <Factory className="h-4 w-4 text-primary" /> تقرير الإنتاج
        </h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1" onClick={handlePrint}>
            <Printer className="h-3 w-3" /> طباعة
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1" onClick={handleExportPDF}>
            <FileText className="h-3 w-3" /> PDF
          </Button>
        </div>
      </div>

      {/* ====== Stock Warnings ====== */}
      {(lowStock.length > 0 || lowMaterials.length > 0) && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2 space-y-0.5 print:hidden">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-[11px] font-medium">
            <AlertTriangle className="h-3 w-3" /> تنبيهات المخزون
          </div>
          {lowMaterials.length > 0 && (
            <p className="text-[10px] text-amber-700 dark:text-amber-300">
              مواد نفدت ({lowMaterials.length}): {lowMaterials.slice(0, 3).map(m => m.name).join('، ')}{lowMaterials.length > 3 ? '...' : ''}
            </p>
          )}
          {lowStock.length > 0 && (
            <p className="text-[10px] text-amber-700 dark:text-amber-300">
              منتجات نفدت ({lowStock.length}): {lowStock.slice(0, 3).map(p => p.name).join('، ')}{lowStock.length > 3 ? '...' : ''}
            </p>
          )}
        </div>
      )}

      {/* ====== Filters (collapsible) ====== */}
      <div className="rounded-lg bg-muted/30 border border-border print:hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-medium"
          onClick={() => setFiltersOpen(o => !o)}
        >
          <span className="flex items-center gap-1.5">
            <Filter className="h-3 w-3" /> الفلاتر
            {hasFilters && <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[9px]">نشط</span>}
          </span>
          {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {filtersOpen && (
          <div className="px-2.5 pb-2 space-y-1.5 border-t border-border pt-2">
            <div className="grid grid-cols-2 gap-1.5">
              <Select value={fProduct} onValueChange={setFProduct}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="المنتج" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">كل المنتجات</SelectItem>
                  {products.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fMaterial} onValueChange={setFMaterial}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="المادة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">كل المواد</SelectItem>
                  {materials.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Select value={fContact} onValueChange={setFContact}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="العميل/المورد" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">الكل</SelectItem>
                {contacts.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-1.5">
              <Input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} className="h-8 text-xs" />
              <Input type="date" value={fTo} onChange={e => setFTo(e.target.value)} className="h-8 text-xs" />
            </div>
            {hasFilters && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] w-full" onClick={clear}>
                <X className="h-3 w-3 mr-1" /> مسح الفلاتر
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ====== Tabs ====== */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="grid w-full grid-cols-3 h-8 print:hidden">
          <TabsTrigger value="sales" className="text-[11px] gap-1">
            <ShoppingCart className="h-3 w-3" /> المبيعات
          </TabsTrigger>
          <TabsTrigger value="runs" className="text-[11px] gap-1">
            <Factory className="h-3 w-3" /> الإنتاج
          </TabsTrigger>
          <TabsTrigger value="purchases" className="text-[11px] gap-1">
            <Package className="h-3 w-3" /> المشتريات
          </TabsTrigger>
        </TabsList>

        {/* ====== Top KPIs (per tab) ====== */}
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-card p-2.5 shadow-sm border border-border mt-2"
        >
          <div className={cn(
            'grid gap-1.5',
            tabKpis.length <= 3 ? 'grid-cols-3' : 'grid-cols-3'
          )}>
            {tabKpis.map((k, i) => (
              <div key={i} className="rounded-lg bg-muted/40 p-1.5 text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <k.icon className={cn('h-3 w-3', k.color)} />
                  <p className="text-[9px] text-muted-foreground truncate">{k.label}</p>
                </div>
                <p className={cn('text-[11px] font-bold', k.color)}>{k.value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ====== Sales Table ====== */}
        <TabsContent value="sales" className="mt-2">
          <DataTable
            empty="لا توجد مبيعات"
            head={['التاريخ', 'الصنف', 'العميل', 'الكمية', 'الإجمالي', 'المتبقي', '']}
            rows={filteredSales.slice(0, 100).map(s => ({
              key: s.id,
              cells: [
                s.date,
                s.source_type === 'material' ? materialName(s.material_id) : productName(s.product_id),
                contactName(s.contact_id),
                String(s.quantity),
                <span key="t" className="text-income font-bold">{fmt(Number(s.total_amount))}</span>,
                <span key="r" className={Number(s.total_amount) - Number(s.paid_amount) > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                  {fmt(Number(s.total_amount) - Number(s.paid_amount))}
                </span>,
                <Eye key="e" className="h-3 w-3 text-primary inline" />,
              ],
              onClick: () => setDetailRow({ kind: 'sales', data: s }),
            }))}
            footer={filteredSales.length > 100 ? `عرض 100 من ${filteredSales.length}` : ''}
          />
        </TabsContent>

        {/* ====== Runs Table ====== */}
        <TabsContent value="runs" className="mt-2">
          <DataTable
            empty="لا توجد عمليات إنتاج"
            head={['التاريخ', 'المنتج', 'الكمية', 'تكلفة الوحدة', 'الإجمالي', '']}
            rows={filteredRuns.slice(0, 100).map(r => ({
              key: r.id,
              cells: [
                r.date,
                productName(r.product_id),
                String(r.quantity),
                fmt(Number(r.unit_cost)),
                <span key="t" className="text-expense font-bold">{fmt(Number(r.total_cost))}</span>,
                <Eye key="e" className="h-3 w-3 text-primary inline" />,
              ],
              onClick: () => setDetailRow({ kind: 'runs', data: r }),
            }))}
            footer={filteredRuns.length > 100 ? `عرض 100 من ${filteredRuns.length}` : ''}
          />
        </TabsContent>

        {/* ====== Purchases Table ====== */}
        <TabsContent value="purchases" className="mt-2">
          <DataTable
            empty="لا توجد مشتريات"
            head={['التاريخ', 'المادة', 'المورد', 'الكمية', 'الإجمالي', 'المتبقي', '']}
            rows={filteredPurchases.slice(0, 100).map(p => ({
              key: p.id,
              cells: [
                p.date,
                materialName(p.material_id),
                contactName(p.contact_id),
                String(p.quantity),
                <span key="t" className="text-expense font-bold">{fmt(Number(p.total_amount))}</span>,
                <span key="r" className={Number(p.total_amount) - Number(p.paid_amount) > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                  {fmt(Number(p.total_amount) - Number(p.paid_amount))}
                </span>,
                <Eye key="e" className="h-3 w-3 text-primary inline" />,
              ],
              onClick: () => setDetailRow({ kind: 'purchases', data: p }),
            }))}
            footer={filteredPurchases.length > 100 ? `عرض 100 من ${filteredPurchases.length}` : ''}
          />
        </TabsContent>
      </Tabs>

      {/* ====== Detail Dialog ====== */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {detailRow?.kind === 'sales' ? 'تفاصيل عملية البيع' :
               detailRow?.kind === 'runs' ? 'تفاصيل عملية الإنتاج' :
               'تفاصيل عملية الشراء'}
            </DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-1.5 text-xs">
              {detailRow.kind === 'sales' && <SalesDetail s={detailRow.data} fmt={fmt} productName={productName} materialName={materialName} contactName={contactName} />}
              {detailRow.kind === 'runs' && <RunsDetail r={detailRow.data} fmt={fmt} productName={productName} />}
              {detailRow.kind === 'purchases' && <PurchasesDetail p={detailRow.data} fmt={fmt} materialName={materialName} contactName={contactName} />}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============= Helper Components =============
function DataTable({ head, rows, empty, footer }: {
  head: string[];
  rows: { key: string; cells: React.ReactNode[]; onClick?: () => void }[];
  empty: string;
  footer?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-sm border border-border text-center text-[11px] text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-card shadow-sm border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/50">
            <tr>
              {head.map((h, i) => (
                <th key={i} className="px-2 py-1.5 text-right font-medium text-muted-foreground text-[10px] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.key}
                onClick={r.onClick}
                className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
              >
                {r.cells.map((c, i) => (
                  <td key={i} className="px-2 py-1.5 text-right whitespace-nowrap">{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && <p className="text-[10px] text-muted-foreground text-center py-1.5 border-t border-border">{footer}</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground text-[10px]">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

function SalesDetail({ s, fmt, productName, materialName, contactName }: any) {
  const remaining = Number(s.total_amount) - Number(s.paid_amount);
  return (
    <>
      <Row k="التاريخ" v={s.date} />
      <Row k="النوع" v={s.source_type === 'material' ? 'بيع مادة خام' : 'بيع منتج'} />
      <Row k="الصنف" v={s.source_type === 'material' ? materialName(s.material_id) : productName(s.product_id)} />
      <Row k="العميل" v={contactName(s.contact_id)} />
      <Row k="الكمية" v={s.quantity} />
      <Row k="سعر الوحدة" v={fmt(Number(s.unit_price))} />
      <Row k="الإجمالي" v={<span className="text-income font-bold">{fmt(Number(s.total_amount))}</span>} />
      <Row k="المقبوض" v={fmt(Number(s.paid_amount))} />
      <Row k="المتبقي" v={<span className={remaining > 0 ? 'text-amber-600' : ''}>{fmt(remaining)}</span>} />
      <Row k="تكلفة البضاعة" v={<span className="text-expense">{fmt(Number(s.cost_at_sale))}</span>} />
      {Number(s.services_total) > 0 && <Row k="خدمات" v={fmt(Number(s.services_total))} />}
      {Number(s.expenses_total) > 0 && <Row k="مصاريف" v={fmt(Number(s.expenses_total))} />}
      <Row k="صافي الربح" v={<span className={Number(s.profit) >= 0 ? 'text-income font-bold' : 'text-expense font-bold'}>{fmt(Number(s.profit))}</span>} />
      {s.notes && <Row k="ملاحظات" v={s.notes} />}
    </>
  );
}

function RunsDetail({ r, fmt, productName }: any) {
  return (
    <>
      <Row k="التاريخ" v={r.date} />
      <Row k="المنتج" v={productName(r.product_id)} />
      <Row k="الكمية المنتجة" v={r.quantity} />
      <Row k="تكلفة الوحدة" v={fmt(Number(r.unit_cost))} />
      <Row k="إجمالي التكلفة" v={<span className="text-expense font-bold">{fmt(Number(r.total_cost))}</span>} />
      {r.notes && <Row k="ملاحظات" v={r.notes} />}
    </>
  );
}

function PurchasesDetail({ p, fmt, materialName, contactName }: any) {
  const remaining = Number(p.total_amount) - Number(p.paid_amount);
  return (
    <>
      <Row k="التاريخ" v={p.date} />
      <Row k="المادة" v={materialName(p.material_id)} />
      <Row k="المورد" v={contactName(p.contact_id)} />
      <Row k="الكمية" v={p.quantity} />
      <Row k="سعر الوحدة" v={fmt(Number(p.unit_price))} />
      <Row k="الإجمالي" v={<span className="text-expense font-bold">{fmt(Number(p.total_amount))}</span>} />
      <Row k="المسدد" v={fmt(Number(p.paid_amount))} />
      <Row k="المتبقي" v={<span className={remaining > 0 ? 'text-amber-600' : ''}>{fmt(remaining)}</span>} />
      {p.notes && <Row k="ملاحظات" v={p.notes} />}
    </>
  );
}

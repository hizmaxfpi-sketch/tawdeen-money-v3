import { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Ship, Package, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Clock, Users, Container as ContainerIcon, Wallet,
  Receipt, BarChart3, FileText, FileSpreadsheet, Printer, RefreshCw,
  Filter, Calendar, Download, Eye, Search, ArrowUpRight, ArrowDownRight,
  Weight, Box, Percent, Activity, Award, Sparkles, Hash, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LineChart, Line, Legend,
} from 'recharts';
import type { Container, Shipment, AccountOption, Fund } from '@/types/finance';
import type { Currency } from '@/hooks/useCurrencies';
import { convertForDisplay, getCurrencySymbol } from '@/components/shared/CurrencyDisplaySelector';

// ============================================================
// TYPES
// ============================================================
interface Props {
  containers: Container[];
  shipments: Shipment[];
  contacts: AccountOption[];
  funds: Fund[];
  currencies: Currency[];
  displayCurrency: string;
  onRefresh?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  loading: 'قيد التحميل', shipped: 'تم الشحن', arrived: 'وصلت',
  cleared: 'تم التخليص', delivered: 'تم التسليم',
  paid: 'مدفوع', partial: 'جزئي', unpaid: 'غير مدفوع',
};

const STATUS_COLORS: Record<string, string> = {
  loading: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  shipped: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30',
  arrived: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
  cleared: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  delivered: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
  paid: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
  partial: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  unpaid: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export function ShippingReportsCenter({
  containers, shipments, contacts, funds, currencies, displayCurrency, onRefresh,
}: Props) {
  // ----- Filters -----
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterContainer, setFilterContainer] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('shipments');
  const [shipmentDetail, setShipmentDetail] = useState<Shipment | null>(null);
  const [containerDetail, setContainerDetail] = useState<Container | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // ----- Currency helpers -----
  const conv = (v: number) => convertForDisplay(v, displayCurrency, currencies);
  const sym = getCurrencySymbol(displayCurrency, currencies);
  const fmt = (v: number) => `${sym}${conv(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const fmtCompact = (v: number) => {
    const x = conv(v);
    if (Math.abs(x) >= 1_000_000) return `${sym}${(x / 1_000_000).toFixed(1)}M`;
    if (Math.abs(x) >= 1_000) return `${sym}${(x / 1_000).toFixed(1)}K`;
    return `${sym}${x.toFixed(0)}`;
  };

  // ============================================================
  // DATA: Filter shipments and containers
  // ============================================================
  const filteredShipments = useMemo(() => {
    return shipments.filter(s => {
      if (filterClient !== 'all' && s.clientId !== filterClient) return false;
      if (filterStatus !== 'all' && s.paymentStatus !== filterStatus) return false;
      if (filterContainer !== 'all' && s.containerId !== filterContainer) return false;
      if (dateFrom && new Date(s.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(s.createdAt) > new Date(dateTo + 'T23:59:59')) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const hay = `${s.clientName} ${s.goodsType} ${s.trackingNumber || ''} ${(s as any).manualCargoCode || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [shipments, filterClient, filterStatus, filterContainer, dateFrom, dateTo, searchText]);

  const filteredContainers = useMemo(() => {
    if (filterContainer === 'all') return containers;
    return containers.filter(c => c.id === filterContainer);
  }, [containers, filterContainer]);

  // ============================================================
  // KPIs
  // ============================================================
  const kpis = useMemo(() => {
    const totalRevenue = filteredShipments.reduce((s, sh) => s + sh.contractPrice, 0);
    const containerIds = new Set(filteredShipments.map(s => s.containerId));
    const involvedContainers = containers.filter(c => containerIds.has(c.id));
    const totalCost = involvedContainers.reduce((s, c) => s + c.totalCost, 0);
    const netProfit = totalRevenue - totalCost;
    const totalCollected = filteredShipments.reduce((s, sh) => s + sh.amountPaid, 0);
    const totalOutstanding = filteredShipments.reduce((s, sh) => s + sh.remainingAmount, 0);
    const totalShipments = filteredShipments.length;
    const totalWeight = filteredShipments.reduce((s, sh) => s + (sh.weight || 0), 0);
    const totalCBM = filteredShipments.reduce((s, sh) => s + sh.cbm, 0);
    const totalContainers = filterContainer === 'all' ? containers.length : 1;
    const avgProfit = totalShipments > 0 ? netProfit / totalShipments : 0;
    const collectionRate = totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 0;
    const paidCount = filteredShipments.filter(s => s.paymentStatus === 'paid').length;
    const completionRate = totalShipments > 0 ? (paidCount / totalShipments) * 100 : 0;
    return {
      totalRevenue, totalCost, netProfit, totalOutstanding, totalCollected, totalShipments,
      totalWeight, totalCBM, totalContainers, avgProfit, collectionRate, completionRate,
    };
  }, [filteredShipments, containers, filterContainer]);

  // ============================================================
  // ALERTS
  // ============================================================
  const alerts = useMemo(() => {
    const unpaidCount = shipments.filter(s => s.paymentStatus === 'unpaid').length;
    const partialCount = shipments.filter(s => s.paymentStatus === 'partial').length;
    const lossContainers = containers.filter(c => c.profit < 0).length;
    const noClientShipments = shipments.filter(s => !s.clientId).length;
    const overFilledContainers = containers.filter(c => c.usedCapacity > c.capacity).length;
    return [
      { id: 'unpaid', count: unpaidCount, label: 'شحنة غير مدفوعة', icon: AlertTriangle, color: 'red', action: () => { setFilterStatus('unpaid'); setActiveTab('shipments'); } },
      { id: 'partial', count: partialCount, label: 'شحنة بدفع جزئي', icon: Clock, color: 'amber', action: () => { setFilterStatus('partial'); setActiveTab('shipments'); } },
      { id: 'loss', count: lossContainers, label: 'حاوية خاسرة', icon: TrendingDown, color: 'red', action: () => setActiveTab('containers') },
      { id: 'missing', count: noClientShipments, label: 'شحنة بدون عميل', icon: AlertTriangle, color: 'amber', action: () => setActiveTab('shipments') },
      { id: 'over', count: overFilledContainers, label: 'حاوية تجاوزت السعة', icon: AlertTriangle, color: 'red', action: () => setActiveTab('containers') },
    ].filter(a => a.count > 0);
  }, [shipments, containers]);

  // ============================================================
  // CHART DATA
  // ============================================================
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; profit: number }>();
    filteredShipments.forEach(s => {
      const d = new Date(s.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cont = containers.find(c => c.id === s.containerId);
      const cost = cont ? (cont.totalCost / Math.max(1, shipments.filter(sh => sh.containerId === cont.id).length)) : 0;
      const cur = map.get(key) || { month: key, revenue: 0, profit: 0 };
      cur.revenue += s.contractPrice;
      cur.profit += (s.contractPrice - cost);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  }, [filteredShipments, containers, shipments]);

  const collectedDonut = useMemo(() => [
    { name: 'محصل', value: kpis.totalCollected, color: 'hsl(145,65%,42%)' },
    { name: 'متبقي', value: kpis.totalOutstanding, color: 'hsl(0,72%,51%)' },
  ].filter(d => d.value > 0), [kpis]);

  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; profit: number; shipments: number; outstanding: number; lastDate: Date }>();
    filteredShipments.forEach(s => {
      const key = s.clientId || s.clientName;
      const cont = containers.find(c => c.id === s.containerId);
      const cost = cont ? (cont.totalCost / Math.max(1, shipments.filter(sh => sh.containerId === cont.id).length)) : 0;
      const cur = map.get(key) || { name: s.clientName, revenue: 0, profit: 0, shipments: 0, outstanding: 0, lastDate: new Date(s.createdAt) };
      cur.revenue += s.contractPrice;
      cur.profit += (s.contractPrice - cost);
      cur.shipments += 1;
      cur.outstanding += s.remainingAmount;
      if (new Date(s.createdAt) > cur.lastDate) cur.lastDate = new Date(s.createdAt);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.profit - a.profit);
  }, [filteredShipments, containers, shipments]);

  const containerProfitChart = useMemo(() => {
    return filteredContainers.slice(0, 8).map(c => ({
      name: c.containerNumber.length > 8 ? c.containerNumber.slice(-8) : c.containerNumber,
      revenue: c.totalRevenue,
      cost: c.totalCost,
      profit: c.profit,
    }));
  }, [filteredContainers]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredShipments.forEach(s => { counts[s.paymentStatus] = (counts[s.paymentStatus] || 0) + 1; });
    return Object.entries(counts).map(([k, v]) => ({
      name: STATUS_LABELS[k] || k, value: v,
      color: k === 'paid' ? 'hsl(145,65%,42%)' : k === 'partial' ? 'hsl(45,93%,47%)' : 'hsl(0,72%,51%)',
    }));
  }, [filteredShipments]);

  // ============================================================
  // EXPENSES DATA
  // ============================================================
  const expensesBreakdown = useMemo(() => {
    let seaFreight = 0, customs = 0, port = 0, internalTransport = 0, china = 0, other = 0;
    filteredShipments.forEach((s: any) => {
      seaFreight += s.seaFreight || 0;
      customs += s.customsFees || 0;
      port += s.portDeliveryFees || 0;
      internalTransport += s.internalTransportFees || 0;
      china += s.chinaExpenses || 0;
    });
    filteredContainers.forEach(c => {
      other += (c.portCost || 0) + (c.glassFees || 0) + (c.otherCosts || 0);
    });
    const total = seaFreight + customs + port + internalTransport + china + other;
    return [
      { category: 'الشحن البحري', amount: seaFreight, color: 'hsl(215,70%,45%)' },
      { category: 'الجمارك', amount: customs, color: 'hsl(45,93%,47%)' },
      { category: 'مصاريف الميناء', amount: port, color: 'hsl(280,60%,50%)' },
      { category: 'النقل الداخلي', amount: internalTransport, color: 'hsl(190,80%,42%)' },
      { category: 'مصاريف الصين', amount: china, color: 'hsl(0,72%,51%)' },
      { category: 'مصاريف أخرى', amount: other, color: 'hsl(145,65%,42%)' },
    ].filter(e => e.amount > 0).map(e => ({ ...e, pct: total > 0 ? (e.amount / total) * 100 : 0 }));
  }, [filteredShipments, filteredContainers]);

  // ============================================================
  // COLLECTIONS / AGING
  // ============================================================
  const collections = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, { name: string; total: number; d0_30: number; d31_60: number; d61_90: number; d90: number; lastPayment: Date | null }>();
    filteredShipments.forEach(s => {
      if (s.remainingAmount <= 0) return;
      const key = s.clientId || s.clientName;
      const cur = map.get(key) || { name: s.clientName, total: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90: 0, lastPayment: null };
      const ageDays = Math.floor((now - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      cur.total += s.remainingAmount;
      if (ageDays <= 30) cur.d0_30 += s.remainingAmount;
      else if (ageDays <= 60) cur.d31_60 += s.remainingAmount;
      else if (ageDays <= 90) cur.d61_90 += s.remainingAmount;
      else cur.d90 += s.remainingAmount;
      if (s.payments && s.payments.length > 0) {
        const latest = s.payments.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b);
        if (!cur.lastPayment || new Date(latest.date) > cur.lastPayment) cur.lastPayment = new Date(latest.date);
      }
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredShipments]);

  // ============================================================
  // INSIGHTS
  // ============================================================
  const insights = useMemo(() => {
    const list: { label: string; value: string; icon: any; tone: 'good' | 'bad' | 'neutral' }[] = [];
    if (topCustomers.length > 0) {
      list.push({ label: 'أفضل عميل بالأرباح', value: `${topCustomers[0].name} • ${fmt(topCustomers[0].profit)}`, icon: Award, tone: 'good' });
    }
    const bestContainer = [...filteredContainers].sort((a, b) => b.profit - a.profit)[0];
    if (bestContainer) {
      list.push({ label: 'أعلى حاوية ربحاً', value: `${bestContainer.containerNumber} • ${fmt(bestContainer.profit)}`, icon: ContainerIcon, tone: 'good' });
    }
    if (kpis.collectionRate < 50 && kpis.totalRevenue > 0) {
      list.push({ label: 'معدل التحصيل منخفض', value: `${kpis.collectionRate.toFixed(1)}%`, icon: TrendingDown, tone: 'bad' });
    } else if (kpis.collectionRate >= 80) {
      list.push({ label: 'معدل تحصيل ممتاز', value: `${kpis.collectionRate.toFixed(1)}%`, icon: TrendingUp, tone: 'good' });
    }
    const lossCount = filteredContainers.filter(c => c.profit < 0).length;
    if (lossCount > 0) {
      list.push({ label: 'حاويات خاسرة', value: `${lossCount} حاوية تحتاج مراجعة`, icon: AlertTriangle, tone: 'bad' });
    }
    return list;
  }, [topCustomers, filteredContainers, kpis, fmt]);

  // ============================================================
  // EXPORTS
  // ============================================================
  const handleExportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(25, 65, 120);
    doc.rect(0, 0, pw, 35, 'F');
    doc.setTextColor(255);
    doc.setFontSize(18);
    doc.text('Shipping Reports Center', pw / 2, 15, { align: 'center' });
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString('en-US'), pw / 2, 25, { align: 'center' });
    let y = 45;
    doc.setTextColor(0);
    (doc as any).autoTable({
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Total Revenue', fmt(kpis.totalRevenue)],
        ['Total Cost', fmt(kpis.totalCost)],
        ['Net Profit', fmt(kpis.netProfit)],
        ['Collected', fmt(kpis.totalCollected)],
        ['Outstanding', fmt(kpis.totalOutstanding)],
        ['Shipments', String(kpis.totalShipments)],
        ['Containers', String(kpis.totalContainers)],
        ['Total CBM', kpis.totalCBM.toFixed(2)],
        ['Total Weight', `${kpis.totalWeight.toLocaleString()} kg`],
        ['Collection Rate', `${kpis.collectionRate.toFixed(1)}%`],
      ],
      styles: { fontSize: 9, halign: 'center' },
      headStyles: { fillColor: [25, 65, 120] },
      margin: { left: 30, right: 30 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
    if (filteredShipments.length > 0) {
      (doc as any).autoTable({
        startY: y,
        head: [['Customer', 'Goods', 'CBM', 'Revenue', 'Paid', 'Outstanding', 'Status']],
        body: filteredShipments.map(s => [
          s.clientName, s.goodsType, s.cbm.toFixed(2),
          fmt(s.contractPrice), fmt(s.amountPaid), fmt(s.remainingAmount),
          STATUS_LABELS[s.paymentStatus],
        ]),
        styles: { fontSize: 8, halign: 'center' },
        headStyles: { fillColor: [25, 65, 120] },
        margin: { left: 8, right: 8 },
      });
    }
    doc.save(`Shipping_Report_${Date.now()}.pdf`);
    toast.success('تم تصدير PDF');
  };

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const summary = [
      { 'البيان': 'إجمالي الإيرادات', 'القيمة': kpis.totalRevenue },
      { 'البيان': 'إجمالي التكلفة', 'القيمة': kpis.totalCost },
      { 'البيان': 'صافي الربح', 'القيمة': kpis.netProfit },
      { 'البيان': 'المحصل', 'القيمة': kpis.totalCollected },
      { 'البيان': 'المتبقي', 'القيمة': kpis.totalOutstanding },
      { 'البيان': 'عدد الشحنات', 'القيمة': kpis.totalShipments },
      { 'البيان': 'إجمالي CBM', 'القيمة': kpis.totalCBM },
      { 'البيان': 'إجمالي الوزن', 'القيمة': kpis.totalWeight },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'الملخص');
    const shipmentsData = filteredShipments.map(s => ({
      'العميل': s.clientName, 'البضاعة': s.goodsType, 'الكمية': s.quantity,
      'الوزن': s.weight, 'CBM': s.cbm, 'السعر': s.contractPrice,
      'المحصل': s.amountPaid, 'المتبقي': s.remainingAmount,
      'الحالة': STATUS_LABELS[s.paymentStatus], 'التتبع': s.trackingNumber || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shipmentsData), 'الشحنات');
    XLSX.writeFile(wb, `Shipping_Report_${Date.now()}.xlsx`);
    toast.success('تم تصدير Excel');
  };

  const handlePrint = () => window.print();
  const resetFilters = () => {
    setDateFrom(''); setDateTo(''); setFilterClient('all');
    setFilterStatus('all'); setFilterContainer('all'); setSearchText('');
  };

  // ============================================================
  // RENDER HELPERS
  // ============================================================
  const KpiCard = ({
    icon: Icon, label, value, sub, color, trend,
  }: { icon: any; label: string; value: string; sub?: string; color: string; trend?: 'up' | 'down' }) => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-3 shadow-sm hover:shadow-md transition-all',
        'border-border/60'
      )}
    >
      <div className={cn('absolute top-0 left-0 w-1 h-full', color)} />
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className={cn('p-1.5 rounded-lg', color.replace('bg-', 'bg-').replace('-500', '-500/15'))}>
          <Icon className={cn('h-3.5 w-3.5', color.replace('bg-', 'text-'))} />
        </div>
        {trend && (
          trend === 'up'
            ? <ArrowUpRight className="h-3 w-3 text-green-500" />
            : <ArrowDownRight className="h-3 w-3 text-red-500" />
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className="text-sm font-bold tabular-nums leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </motion.div>
  );

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-3" ref={printRef}>
      {/* ========== HEADER ========== */}
      <div className="rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/15">
              <Ship className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">مركز تقارير الشحن</h2>
              <p className="text-[10px] text-muted-foreground">لوحة تحكم احترافية للأداء اللوجستي</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onRefresh && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh} title="تحديث">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrint} title="طباعة">
              <Printer className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExportPDF} title="PDF">
              <FileText className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExportExcel} title="Excel">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Quick filter strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          <Button
            variant="outline" size="sm"
            className="h-7 text-[10px] gap-1 shrink-0"
            onClick={() => setFiltersOpen(true)}
          >
            <Filter className="h-3 w-3" /> فلاتر
            {(filterClient !== 'all' || filterStatus !== 'all' || filterContainer !== 'all' || dateFrom || dateTo) && (
              <Badge className="h-3.5 min-w-3.5 px-1 text-[8px]">!</Badge>
            )}
          </Button>
          <div className="relative shrink-0 grow max-w-[200px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="بحث..."
              className="h-7 text-[10px] pr-7"
            />
          </div>
        </div>
      </div>

      {/* ========== EXECUTIVE KPI ROW 1 ========== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiCard icon={DollarSign} label="إجمالي الإيرادات" value={fmtCompact(kpis.totalRevenue)} color="bg-blue-500" />
        <KpiCard icon={Receipt} label="إجمالي التكلفة" value={fmtCompact(kpis.totalCost)} color="bg-orange-500" />
        <KpiCard
          icon={TrendingUp} label="صافي الربح" value={fmtCompact(kpis.netProfit)}
          color={kpis.netProfit >= 0 ? 'bg-green-500' : 'bg-red-500'}
          trend={kpis.netProfit >= 0 ? 'up' : 'down'}
        />
        <KpiCard icon={AlertTriangle} label="المتبقي" value={fmtCompact(kpis.totalOutstanding)} color="bg-red-500" />
        <KpiCard icon={CheckCircle2} label="المحصل" value={fmtCompact(kpis.totalCollected)} color="bg-green-500" />
        <KpiCard icon={Package} label="إجمالي الشحنات" value={kpis.totalShipments.toLocaleString()} color="bg-purple-500" />
      </div>

      {/* ========== EXECUTIVE KPI ROW 2 ========== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiCard icon={Weight} label="إجمالي الوزن" value={`${kpis.totalWeight.toLocaleString()} كغ`} color="bg-purple-500" />
        <KpiCard icon={Box} label="إجمالي CBM" value={kpis.totalCBM.toFixed(2)} color="bg-cyan-500" />
        <KpiCard icon={ContainerIcon} label="عدد الحاويات" value={kpis.totalContainers.toLocaleString()} color="bg-blue-500" />
        <KpiCard icon={TrendingUp} label="متوسط الربح" value={fmtCompact(kpis.avgProfit)} color="bg-green-500" />
        <KpiCard icon={Percent} label="معدل التحصيل" value={`${kpis.collectionRate.toFixed(1)}%`} color="bg-amber-500" />
        <KpiCard icon={Activity} label="نسبة الإنجاز" value={`${kpis.completionRate.toFixed(1)}%`} color="bg-purple-500" />
      </div>

      {/* ========== SMART ALERTS ========== */}
      {alerts.length > 0 && (
        <div className="rounded-xl bg-card border border-border p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <h3 className="text-xs font-bold">تنبيهات ذكية</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {alerts.map(a => {
              const Icon = a.icon;
              const colorMap: Record<string, string> = {
                red: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400 hover:bg-red-500/15',
                amber: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15',
              };
              return (
                <button
                  key={a.id} onClick={a.action}
                  className={cn('flex items-center gap-2 p-2 rounded-lg border text-right transition-all', colorMap[a.color])}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-none">{a.count}</p>
                    <p className="text-[9px] leading-tight truncate">{a.label}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ========== INSIGHTS ========== */}
      {insights.length > 0 && (
        <div className="rounded-xl bg-gradient-to-br from-primary/5 to-transparent border border-primary/20 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-xs font-bold">رؤى تحليلية</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {insights.map((ins, i) => {
              const Icon = ins.icon;
              const tone = ins.tone === 'good'
                ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                : ins.tone === 'bad'
                ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                : 'bg-muted text-muted-foreground';
              return (
                <div key={i} className={cn('flex items-center gap-2 p-2 rounded-lg', tone)}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] opacity-80 leading-tight">{ins.label}</p>
                    <p className="text-[11px] font-bold leading-tight truncate">{ins.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========== CHARTS ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Monthly Profit Trend */}
        <div className="rounded-xl bg-card border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold">اتجاه الأرباح الشهرية</h3>
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => fmtCompact(v)} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(215,70%,45%)" name="إيرادات" strokeWidth={2} />
                <Line type="monotone" dataKey="profit" stroke="hsl(145,65%,42%)" name="ربح" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        {/* Collected vs Outstanding Donut */}
        <div className="rounded-xl bg-card border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold">المحصل مقابل المتبقي</h3>
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {collectedDonut.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={collectedDonut} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${fmtCompact(value)}`} labelLine={false}>
                  {collectedDonut.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        {/* Top Customers Bar */}
        <div className="rounded-xl bg-card border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold">أفضل 5 عملاء بالأرباح</h3>
            <Award className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {topCustomers.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={topCustomers.slice(0, 5)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => fmtCompact(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={70} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="profit" fill="hsl(145,65%,42%)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        {/* Container Profitability */}
        <div className="rounded-xl bg-card border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold">ربحية الحاويات</h3>
            <ContainerIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {containerProfitChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={containerProfitChart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => fmtCompact(v)} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="revenue" fill="hsl(215,70%,45%)" name="إيراد" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" fill="hsl(0,72%,51%)" name="تكلفة" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" fill="hsl(145,65%,42%)" name="ربح" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>
      </div>

      {/* ========== MAIN TABS ========== */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-6 h-9 w-full">
          <TabsTrigger value="shipments" className="text-[10px] gap-1"><Package className="h-3 w-3" />شحنات</TabsTrigger>
          <TabsTrigger value="containers" className="text-[10px] gap-1"><ContainerIcon className="h-3 w-3" />حاويات</TabsTrigger>
          <TabsTrigger value="customers" className="text-[10px] gap-1"><Users className="h-3 w-3" />عملاء</TabsTrigger>
          <TabsTrigger value="collections" className="text-[10px] gap-1"><Wallet className="h-3 w-3" />تحصيل</TabsTrigger>
          <TabsTrigger value="expenses" className="text-[10px] gap-1"><Receipt className="h-3 w-3" />مصاريف</TabsTrigger>
          <TabsTrigger value="performance" className="text-[10px] gap-1"><Activity className="h-3 w-3" />أداء</TabsTrigger>
        </TabsList>

        {/* SHIPMENTS TAB */}
        <TabsContent value="shipments" className="mt-3">
          <ShipmentsTable
            shipments={filteredShipments}
            containers={containers}
            fmt={fmt}
            onRowClick={setShipmentDetail}
          />
        </TabsContent>

        {/* CONTAINERS TAB */}
        <TabsContent value="containers" className="mt-3">
          <ContainersTable
            containers={filteredContainers}
            shipments={shipments}
            fmt={fmt}
            onRowClick={setContainerDetail}
          />
        </TabsContent>

        {/* CUSTOMERS TAB */}
        <TabsContent value="customers" className="mt-3">
          <CustomersTable customers={topCustomers} fmt={fmt} />
        </TabsContent>

        {/* COLLECTIONS TAB */}
        <TabsContent value="collections" className="mt-3">
          <CollectionsTable collections={collections} fmt={fmt} />
        </TabsContent>

        {/* EXPENSES TAB */}
        <TabsContent value="expenses" className="mt-3">
          <ExpensesPanel expenses={expensesBreakdown} fmt={fmt} />
        </TabsContent>

        {/* PERFORMANCE TAB */}
        <TabsContent value="performance" className="mt-3">
          <PerformancePanel
            containers={filteredContainers}
            shipments={filteredShipments}
            customers={topCustomers}
            fmt={fmt}
          />
        </TabsContent>
      </Tabs>

      {/* ========== FILTERS SHEET ========== */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-[320px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle className="text-sm">الفلاتر</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">من تاريخ</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">إلى تاريخ</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">العميل</label>
              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">كل العملاء</SelectItem>
                  {contacts.filter(c => c.type === 'client').map(c =>
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">حالة الدفع</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">كل الحالات</SelectItem>
                  <SelectItem value="paid" className="text-xs">مدفوع</SelectItem>
                  <SelectItem value="partial" className="text-xs">جزئي</SelectItem>
                  <SelectItem value="unpaid" className="text-xs">غير مدفوع</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">الحاوية</label>
              <Select value={filterContainer} onValueChange={setFilterContainer}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">كل الحاويات</SelectItem>
                  {containers.map(c =>
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.containerNumber}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-3">
              <Button variant="outline" className="flex-1 h-9 text-xs" onClick={resetFilters}>إعادة تعيين</Button>
              <Button className="flex-1 h-9 text-xs" onClick={() => setFiltersOpen(false)}>تطبيق</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ========== SHIPMENT DETAIL DIALOG ========== */}
      <ShipmentDetailDialog
        shipment={shipmentDetail}
        container={shipmentDetail ? containers.find(c => c.id === shipmentDetail.containerId) : null}
        onClose={() => setShipmentDetail(null)}
        fmt={fmt}
      />

      {/* ========== CONTAINER DETAIL DIALOG ========== */}
      <ContainerDetailDialog
        container={containerDetail}
        shipments={containerDetail ? shipments.filter(s => s.containerId === containerDetail.id) : []}
        onClose={() => setContainerDetail(null)}
        fmt={fmt}
      />
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================
const EmptyChart = () => (
  <div className="h-[180px] flex items-center justify-center text-[10px] text-muted-foreground">
    لا توجد بيانات كافية
  </div>
);

function ShipmentsTable({
  shipments, containers, fmt, onRowClick,
}: { shipments: Shipment[]; containers: Container[]; fmt: (v: number) => string; onRowClick: (s: Shipment) => void }) {
  if (shipments.length === 0) {
    return <EmptyState message="لا توجد شحنات مطابقة" icon={Package} />;
  }
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="p-2 text-right font-medium">العميل</th>
              <th className="p-2 text-center font-medium">الحاوية</th>
              <th className="p-2 text-right font-medium">البضاعة</th>
              <th className="p-2 text-center font-medium">CBM</th>
              <th className="p-2 text-center font-medium">الوزن</th>
              <th className="p-2 text-left font-medium">الإيراد</th>
              <th className="p-2 text-left font-medium">المحصل</th>
              <th className="p-2 text-left font-medium">المتبقي</th>
              <th className="p-2 text-center font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s, i) => {
              const c = containers.find(ct => ct.id === s.containerId);
              return (
                <tr
                  key={s.id}
                  onClick={() => onRowClick(s)}
                  className={cn(
                    'border-t border-border cursor-pointer hover:bg-muted/40 transition-colors',
                    i % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                  )}
                >
                  <td className="p-2 font-medium">{s.clientName}</td>
                  <td className="p-2 text-center text-muted-foreground">{c?.containerNumber || '-'}</td>
                  <td className="p-2">{s.goodsType}</td>
                  <td className="p-2 text-center tabular-nums">{s.cbm.toFixed(2)}</td>
                  <td className="p-2 text-center tabular-nums">{(s.weight || 0).toLocaleString()}</td>
                  <td className="p-2 text-left tabular-nums">{fmt(s.contractPrice)}</td>
                  <td className="p-2 text-left tabular-nums text-green-600">{fmt(s.amountPaid)}</td>
                  <td className={cn('p-2 text-left tabular-nums', s.remainingAmount > 0 ? 'text-red-600' : 'text-green-600')}>
                    {fmt(s.remainingAmount)}
                  </td>
                  <td className="p-2 text-center">
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[9px] border', STATUS_COLORS[s.paymentStatus])}>
                      {STATUS_LABELS[s.paymentStatus]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContainersTable({
  containers, shipments, fmt, onRowClick,
}: { containers: Container[]; shipments: Shipment[]; fmt: (v: number) => string; onRowClick: (c: Container) => void }) {
  if (containers.length === 0) {
    return <EmptyState message="لا توجد حاويات" icon={ContainerIcon} />;
  }
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="p-2 text-right font-medium">الحاوية</th>
              <th className="p-2 text-center font-medium">السعة</th>
              <th className="p-2 text-center font-medium">الإشغال</th>
              <th className="p-2 text-center font-medium">الشحنات</th>
              <th className="p-2 text-left font-medium">إيراد</th>
              <th className="p-2 text-left font-medium">تكلفة</th>
              <th className="p-2 text-left font-medium">ربح</th>
              <th className="p-2 text-center font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {containers.map((c, i) => {
              const cShipments = shipments.filter(s => s.containerId === c.id);
              const fillRate = c.capacity > 0 ? (c.usedCapacity / c.capacity) * 100 : 0;
              return (
                <tr
                  key={c.id}
                  onClick={() => onRowClick(c)}
                  className={cn(
                    'border-t border-border cursor-pointer hover:bg-muted/40 transition-colors',
                    i % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                  )}
                >
                  <td className="p-2 font-medium">{c.containerNumber}</td>
                  <td className="p-2 text-center tabular-nums">{c.capacity}</td>
                  <td className="p-2 text-center">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full', fillRate > 90 ? 'bg-red-500' : fillRate > 70 ? 'bg-amber-500' : 'bg-green-500')}
                          style={{ width: `${Math.min(100, fillRate)}%` }}
                        />
                      </div>
                      <span className="text-[9px] tabular-nums">{fillRate.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="p-2 text-center tabular-nums">{cShipments.length}</td>
                  <td className="p-2 text-left tabular-nums">{fmt(c.totalRevenue)}</td>
                  <td className="p-2 text-left tabular-nums text-red-600">{fmt(c.totalCost)}</td>
                  <td className={cn('p-2 text-left tabular-nums font-bold', c.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
                    {fmt(c.profit)}
                  </td>
                  <td className="p-2 text-center">
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[9px] border', STATUS_COLORS[c.status])}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomersTable({ customers, fmt }: { customers: any[]; fmt: (v: number) => string }) {
  if (customers.length === 0) return <EmptyState message="لا يوجد عملاء" icon={Users} />;
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="p-2 text-center font-medium">#</th>
              <th className="p-2 text-right font-medium">العميل</th>
              <th className="p-2 text-center font-medium">شحنات</th>
              <th className="p-2 text-left font-medium">إيرادات</th>
              <th className="p-2 text-left font-medium">ربح</th>
              <th className="p-2 text-left font-medium">متبقي</th>
              <th className="p-2 text-center font-medium">آخر نشاط</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={i} className={cn('border-t border-border', i % 2 === 0 ? 'bg-background' : 'bg-muted/10')}>
                <td className="p-2 text-center">
                  {i < 3 ? (
                    <Award className={cn('h-3.5 w-3.5 mx-auto', i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : 'text-orange-700')} />
                  ) : i + 1}
                </td>
                <td className="p-2 font-medium">{c.name}</td>
                <td className="p-2 text-center tabular-nums">{c.shipments}</td>
                <td className="p-2 text-left tabular-nums">{fmt(c.revenue)}</td>
                <td className={cn('p-2 text-left tabular-nums font-bold', c.profit >= 0 ? 'text-green-600' : 'text-red-600')}>{fmt(c.profit)}</td>
                <td className={cn('p-2 text-left tabular-nums', c.outstanding > 0 ? 'text-red-600' : 'text-muted-foreground')}>{fmt(c.outstanding)}</td>
                <td className="p-2 text-center text-muted-foreground">{new Date(c.lastDate).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CollectionsTable({ collections, fmt }: { collections: any[]; fmt: (v: number) => string }) {
  if (collections.length === 0) return <EmptyState message="لا توجد مستحقات" icon={Wallet} />;
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="p-2 text-right font-medium">العميل</th>
              <th className="p-2 text-left font-medium">المستحق</th>
              <th className="p-2 text-left font-medium">0-30 يوم</th>
              <th className="p-2 text-left font-medium">31-60 يوم</th>
              <th className="p-2 text-left font-medium">61-90 يوم</th>
              <th className="p-2 text-left font-medium">+90 يوم</th>
              <th className="p-2 text-center font-medium">آخر دفعة</th>
            </tr>
          </thead>
          <tbody>
            {collections.map((c, i) => {
              const priority = c.d90 > 0 ? 'red' : c.d61_90 > 0 ? 'amber' : 'green';
              const priorityColor = priority === 'red' ? 'border-r-red-500' : priority === 'amber' ? 'border-r-amber-500' : 'border-r-green-500';
              return (
                <tr key={i} className={cn('border-t border-border border-r-2', priorityColor, i % 2 === 0 ? 'bg-background' : 'bg-muted/10')}>
                  <td className="p-2 font-medium">{c.name}</td>
                  <td className="p-2 text-left tabular-nums font-bold text-red-600">{fmt(c.total)}</td>
                  <td className="p-2 text-left tabular-nums text-green-600">{c.d0_30 > 0 ? fmt(c.d0_30) : '-'}</td>
                  <td className="p-2 text-left tabular-nums text-amber-600">{c.d31_60 > 0 ? fmt(c.d31_60) : '-'}</td>
                  <td className="p-2 text-left tabular-nums text-orange-600">{c.d61_90 > 0 ? fmt(c.d61_90) : '-'}</td>
                  <td className="p-2 text-left tabular-nums text-red-700 font-bold">{c.d90 > 0 ? fmt(c.d90) : '-'}</td>
                  <td className="p-2 text-center text-muted-foreground">{c.lastPayment ? new Date(c.lastPayment).toLocaleDateString('en-GB') : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpensesPanel({ expenses, fmt }: { expenses: any[]; fmt: (v: number) => string }) {
  if (expenses.length === 0) return <EmptyState message="لا توجد مصاريف" icon={Receipt} />;
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl bg-card border border-border p-3">
          <h3 className="text-xs font-bold mb-2">توزيع المصاريف</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={expenses} cx="50%" cy="50%" outerRadius={80} dataKey="amount" nameKey="category" label={({ category, pct }) => `${category} ${pct.toFixed(0)}%`} labelLine={false}>
                {expenses.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl bg-card border border-border p-3">
          <h3 className="text-xs font-bold mb-2">تفصيل البنود</h3>
          <div className="space-y-2">
            {expenses.map((e, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.color }} />
                    {e.category}
                  </span>
                  <span className="font-bold tabular-nums">{fmt(e.amount)}</span>
                </div>
                <Progress value={e.pct} className="h-1.5" />
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs font-bold">الإجمالي</span>
              <span className="text-sm font-bold tabular-nums text-primary">{fmt(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PerformancePanel({
  containers, shipments, customers, fmt,
}: { containers: Container[]; shipments: Shipment[]; customers: any[]; fmt: (v: number) => string }) {
  const stats = useMemo(() => {
    const delivered = containers.filter(c => c.status === 'delivered');
    const avgDelivery = delivered.length > 0
      ? delivered.reduce((s, c) => {
          if (c.departureDate && c.arrivalDate) {
            return s + (new Date(c.arrivalDate).getTime() - new Date(c.departureDate).getTime()) / (1000 * 60 * 60 * 24);
          }
          return s;
        }, 0) / delivered.length
      : 0;
    const routes: Record<string, { count: number; profit: number }> = {};
    containers.forEach(c => {
      const r = c.route || 'غير محدد';
      const cur = routes[r] || { count: 0, profit: 0 };
      cur.count += 1; cur.profit += c.profit;
      routes[r] = cur;
    });
    const bestRoute = Object.entries(routes).sort((a, b) => b[1].profit - a[1].profit)[0];
    const fastPaying = customers.filter(c => c.outstanding === 0).slice(0, 5);
    return { avgDelivery, bestRoute, fastPaying };
  }, [containers, customers]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="rounded-xl bg-card border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold">مؤشرات الأداء</h3>
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-lg bg-blue-500/10">
            <Clock className="h-4 w-4 text-blue-600 mb-1" />
            <p className="text-[10px] text-muted-foreground">متوسط التوصيل</p>
            <p className="text-base font-bold text-blue-600">{stats.avgDelivery.toFixed(1)} يوم</p>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10">
            <Award className="h-4 w-4 text-green-600 mb-1" />
            <p className="text-[10px] text-muted-foreground">أفضل مسار</p>
            <p className="text-xs font-bold text-green-600 truncate">{stats.bestRoute?.[0] || '-'}</p>
            <p className="text-[9px] text-muted-foreground">{stats.bestRoute ? fmt(stats.bestRoute[1].profit) : ''}</p>
          </div>
          <div className="p-3 rounded-lg bg-purple-500/10">
            <Package className="h-4 w-4 text-purple-600 mb-1" />
            <p className="text-[10px] text-muted-foreground">شحنات</p>
            <p className="text-base font-bold text-purple-600">{shipments.length}</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10">
            <ContainerIcon className="h-4 w-4 text-amber-600 mb-1" />
            <p className="text-[10px] text-muted-foreground">حاويات نشطة</p>
            <p className="text-base font-bold text-amber-600">{containers.filter(c => c.status !== 'delivered').length}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-card border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold">عملاء سريعو الدفع</h3>
          <Award className="h-3.5 w-3.5 text-green-500" />
        </div>
        {stats.fastPaying.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-6">لا يوجد بيانات</p>
        ) : (
          <div className="space-y-1.5">
            {stats.fastPaying.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-600 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="text-[11px] font-medium">{c.name}</span>
                </div>
                <span className="text-[10px] tabular-nums text-green-600">{fmt(c.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message, icon: Icon }: { message: string; icon: any }) {
  return (
    <div className="rounded-xl bg-card border border-border p-8 text-center">
      <Icon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
      <p className="text-[11px] text-muted-foreground">{message}</p>
    </div>
  );
}

function ShipmentDetailDialog({
  shipment, container, onClose, fmt,
}: { shipment: Shipment | null; container: Container | null | undefined; onClose: () => void; fmt: (v: number) => string }) {
  if (!shipment) return null;
  return (
    <Dialog open={!!shipment} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">تفاصيل الشحنة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-gradient-to-br from-primary/10 to-transparent p-3 border border-primary/20">
            <p className="text-[10px] text-muted-foreground">العميل</p>
            <p className="text-base font-bold">{shipment.clientName}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{shipment.goodsType}</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="CBM" value={shipment.cbm.toFixed(2)} color="text-cyan-600" />
            <Stat label="الوزن" value={`${(shipment.weight || 0).toLocaleString()} كغ`} color="text-purple-600" />
            <Stat label="القطع" value={String(shipment.quantity)} color="text-blue-600" />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <h4 className="text-xs font-bold">الملخص المالي</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-blue-500/10">
                <p className="text-[9px] text-muted-foreground">الإيراد</p>
                <p className="text-xs font-bold text-blue-600">{fmt(shipment.contractPrice)}</p>
              </div>
              <div className="p-2 rounded bg-green-500/10">
                <p className="text-[9px] text-muted-foreground">المحصل</p>
                <p className="text-xs font-bold text-green-600">{fmt(shipment.amountPaid)}</p>
              </div>
              <div className="p-2 rounded bg-red-500/10">
                <p className="text-[9px] text-muted-foreground">المتبقي</p>
                <p className="text-xs font-bold text-red-600">{fmt(shipment.remainingAmount)}</p>
              </div>
            </div>
            <div className="flex items-center justify-center pt-1">
              <span className={cn('inline-flex px-2 py-1 rounded-full text-[10px] border', STATUS_COLORS[shipment.paymentStatus])}>
                {STATUS_LABELS[shipment.paymentStatus]}
              </span>
            </div>
          </div>

          {container && (
            <div className="rounded-lg border border-border p-3">
              <h4 className="text-xs font-bold mb-1.5">معلومات الحاوية</h4>
              <div className="text-[10px] space-y-1">
                <Row label="رقم الحاوية" value={container.containerNumber} />
                <Row label="المسار" value={container.route} />
                <Row label="الحالة" value={STATUS_LABELS[container.status]} />
              </div>
            </div>
          )}

          {shipment.payments && shipment.payments.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <h4 className="text-xs font-bold mb-1.5">سجل الدفعات</h4>
              <div className="space-y-1.5">
                {shipment.payments.map(p => (
                  <div key={p.id} className="flex justify-between text-[10px] p-1.5 rounded bg-muted/30">
                    <span>{new Date(p.date).toLocaleDateString('en-GB')}</span>
                    <span className="font-bold text-green-600 tabular-nums">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {shipment.notes && (
            <div className="rounded-lg border border-border p-3">
              <h4 className="text-xs font-bold mb-1">ملاحظات</h4>
              <p className="text-[10px] text-muted-foreground">{shipment.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContainerDetailDialog({
  container, shipments, onClose, fmt,
}: { container: Container | null; shipments: Shipment[]; onClose: () => void; fmt: (v: number) => string }) {
  if (!container) return null;
  const fillRate = container.capacity > 0 ? (container.usedCapacity / container.capacity) * 100 : 0;
  return (
    <Dialog open={!!container} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">تفاصيل الحاوية</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-gradient-to-br from-primary/10 to-transparent p-3 border border-primary/20">
            <p className="text-[10px] text-muted-foreground">رقم الحاوية</p>
            <p className="text-base font-bold">{container.containerNumber}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{container.route}</p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="السعة" value={`${container.usedCapacity.toFixed(1)}/${container.capacity}`} color="text-cyan-600" />
            <Stat label="الإشغال" value={`${fillRate.toFixed(0)}%`} color={fillRate > 90 ? 'text-red-600' : 'text-green-600'} />
            <Stat label="الشحنات" value={String(shipments.length)} color="text-purple-600" />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <h4 className="text-xs font-bold">الأداء المالي</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-blue-500/10">
                <p className="text-[9px] text-muted-foreground">الإيراد</p>
                <p className="text-xs font-bold text-blue-600">{fmt(container.totalRevenue)}</p>
              </div>
              <div className="p-2 rounded bg-red-500/10">
                <p className="text-[9px] text-muted-foreground">التكلفة</p>
                <p className="text-xs font-bold text-red-600">{fmt(container.totalCost)}</p>
              </div>
              <div className={cn('p-2 rounded', container.profit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10')}>
                <p className="text-[9px] text-muted-foreground">الربح</p>
                <p className={cn('text-xs font-bold', container.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {fmt(container.profit)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <h4 className="text-xs font-bold mb-1.5">تفصيل التكاليف</h4>
            <div className="text-[10px] space-y-1">
              <Row label="سعر الحاوية" value={fmt(container.containerPrice || 0)} />
              <Row label="الشحن" value={fmt(container.shippingCost)} />
              <Row label="الجمارك" value={fmt(container.customsCost)} />
              <Row label="الميناء" value={fmt(container.portCost)} />
              <Row label="رسوم الزجاج" value={fmt(container.glassFees || 0)} />
              <Row label="أخرى" value={fmt(container.otherCosts)} />
              <div className="border-t border-border pt-1 mt-1">
                <Row label="الإجمالي" value={fmt(container.totalCost)} bold />
              </div>
            </div>
          </div>

          {shipments.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <h4 className="text-xs font-bold mb-1.5">شحنات الحاوية ({shipments.length})</h4>
              <div className="space-y-1">
                {shipments.map(s => (
                  <div key={s.id} className="flex justify-between text-[10px] p-1.5 rounded bg-muted/30">
                    <span className="truncate">{s.clientName}</span>
                    <span className="tabular-nums shrink-0">{fmt(s.contractPrice)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-2 rounded-lg bg-muted/30 text-center">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={cn('text-xs font-bold tabular-nums', color)}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', bold && 'font-bold')}>{value}</span>
    </div>
  );
}

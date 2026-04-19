import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Ship, Package, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Clock, Users, Container as ContainerIcon, Wallet,
  Receipt, BarChart3, FileText, FileSpreadsheet, Printer, RefreshCw,
  Filter, Eye, EyeOff, Search, ArrowUpRight, ArrowDownRight, X,
  Weight, Box, Percent, Activity, Award, Sparkles, Hash, Layers,
  ChevronDown, ChevronUp, Image as ImageIcon, MapPin, Phone, Copy,
  Check, MoreVertical, Download, Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  contactsFull?: { id: string; name: string; phone?: string; whatsapp?: string; email?: string }[];
  funds: Fund[];
  currencies: Currency[];
  displayCurrency: string;
  onRefresh?: () => void;
  onReceiveShipmentPayment?: (shipmentId: string, amount: number, fundId: string, note?: string) => Promise<void> | void;
}

type ProfitMode = 'all' | 'profit' | 'loss';
type PayMode = 'all' | 'paid' | 'partial' | 'unpaid';

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
  containers, shipments, contacts, contactsFull = [], funds, currencies, displayCurrency, onRefresh,
}: Props) {
  // ------- Multi-select smart filters -------
  const [selectedContainerIds, setSelectedContainerIds] = useState<Set<string>>(new Set());
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [selectedContainerStatuses, setSelectedContainerStatuses] = useState<Set<string>>(new Set());
  const [payMode, setPayMode] = useState<PayMode>('all');
  const [profitMode, setProfitMode] = useState<ProfitMode>('all');
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ------- UI toggles -------
  const [showSummary, setShowSummary] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [showFinanceGlobal, setShowFinanceGlobal] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [shipmentsOpen, setShipmentsOpen] = useState<Set<string>>(new Set());
  const [hdPreview, setHdPreview] = useState<{ open: boolean; type: 'card' | 'all'; containerId?: string }>({ open: false, type: 'all' });

  const printRef = useRef<HTMLDivElement>(null);
  const hdRef = useRef<HTMLDivElement>(null);

  // ------- Currency helpers -------
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
  // FILTERED DATA — single source of truth
  // ============================================================
  const filteredContainers = useMemo(() => {
    return containers.filter(c => {
      if (selectedContainerIds.size > 0 && !selectedContainerIds.has(c.id)) return false;
      if (selectedContainerStatuses.size > 0 && !selectedContainerStatuses.has(c.status)) return false;
      if (profitMode === 'profit' && c.profit < 0) return false;
      if (profitMode === 'loss' && c.profit >= 0) return false;
      if (dateFrom && c.createdAt && new Date(c.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && c.createdAt && new Date(c.createdAt) > new Date(dateTo + 'T23:59:59')) return false;
      // Client filter: keep container only if it has at least one selected client
      if (selectedClientIds.size > 0) {
        const containerShipments = shipments.filter(s => s.containerId === c.id);
        const hasClient = containerShipments.some(s => s.clientId && selectedClientIds.has(s.clientId));
        if (!hasClient) return false;
      }
      // Pay mode filter on container level
      if (payMode !== 'all') {
        const cShips = shipments.filter(s => s.containerId === c.id);
        if (payMode === 'paid' && !cShips.every(s => s.paymentStatus === 'paid')) return false;
        if (payMode === 'unpaid' && !cShips.some(s => s.paymentStatus === 'unpaid')) return false;
        if (payMode === 'partial' && !cShips.some(s => s.paymentStatus === 'partial')) return false;
      }
      // Search
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const cShips = shipments.filter(s => s.containerId === c.id);
        const hay = `${c.containerNumber} ${c.route || ''} ${cShips.map(s => `${s.clientName} ${s.goodsType} ${s.trackingNumber || ''}`).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [containers, shipments, selectedContainerIds, selectedClientIds, selectedContainerStatuses, profitMode, payMode, dateFrom, dateTo, searchText]);

  const filteredShipments = useMemo(() => {
    const allowedContainerIds = new Set(filteredContainers.map(c => c.id));
    return shipments.filter(s => {
      if (!allowedContainerIds.has(s.containerId)) return false;
      if (selectedClientIds.size > 0 && (!s.clientId || !selectedClientIds.has(s.clientId))) return false;
      return true;
    });
  }, [shipments, filteredContainers, selectedClientIds]);

  // ============================================================
  // SUMMARY KPIs (based on filter)
  // ============================================================
  const summary = useMemo(() => {
    const totalRevenue = filteredContainers.reduce((s, c) => s + c.totalRevenue, 0);
    const totalCost = filteredContainers.reduce((s, c) => s + c.totalCost, 0);
    const netProfit = totalRevenue - totalCost;
    const totalCollected = filteredShipments.reduce((s, sh) => s + sh.amountPaid, 0);
    const totalOutstanding = filteredShipments.reduce((s, sh) => s + sh.remainingAmount, 0);
    const containerCount = filteredContainers.length;
    const shipmentCount = filteredShipments.length;
    const uniqueClients = new Set(filteredShipments.map(s => s.clientId || s.clientName)).size;
    const totalCBM = filteredShipments.reduce((s, sh) => s + sh.cbm, 0);
    const totalWeight = filteredShipments.reduce((s, sh) => s + (sh.weight || 0), 0);
    const totalPieces = filteredShipments.reduce((s, sh) => s + (sh.quantity || 0), 0);
    return { totalRevenue, totalCost, netProfit, totalCollected, totalOutstanding, containerCount, shipmentCount, uniqueClients, totalCBM, totalWeight, totalPieces };
  }, [filteredContainers, filteredShipments]);

  // ============================================================
  // ALERTS (dismissible)
  // ============================================================
  const alerts = useMemo(() => {
    const unpaid = shipments.filter(s => s.paymentStatus === 'unpaid').length;
    const lossContainers = containers.filter(c => c.profit < 0).length;
    const overFilled = containers.filter(c => c.usedCapacity > c.capacity).length;
    const noClient = shipments.filter(s => !s.clientId).length;
    return [
      { id: 'unpaid', count: unpaid, label: 'شحنة غير مدفوعة', icon: AlertTriangle, color: 'red', action: () => setPayMode('unpaid') },
      { id: 'loss', count: lossContainers, label: 'حاوية خاسرة', icon: TrendingDown, color: 'red', action: () => setProfitMode('loss') },
      { id: 'over', count: overFilled, label: 'حاوية تجاوزت السعة', icon: AlertTriangle, color: 'amber', action: () => {} },
      { id: 'missing', count: noClient, label: 'شحنة بدون عميل', icon: AlertTriangle, color: 'amber', action: () => {} },
    ].filter(a => a.count > 0);
  }, [shipments, containers]);

  // ============================================================
  // ANALYTICS DATA
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

  const collectionDonut = useMemo(() => [
    { name: 'محصل', value: summary.totalCollected, color: 'hsl(145,65%,42%)' },
    { name: 'متبقي', value: summary.totalOutstanding, color: 'hsl(0,72%,51%)' },
  ].filter(d => d.value > 0), [summary]);

  const containerProfitChart = useMemo(() => filteredContainers.slice(0, 8).map(c => ({
    name: c.containerNumber.length > 8 ? c.containerNumber.slice(-8) : c.containerNumber,
    profit: c.profit,
  })), [filteredContainers]);

  // ============================================================
  // HD PREVIEW + EXPORTS
  // ============================================================
  const exportHDImage = async () => {
    const target = hdRef.current || printRef.current;
    if (!target) return toast.error('لا يوجد محتوى للتصدير');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(target, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const link = document.createElement('a');
      link.download = `Shipping_Report_HD_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
      toast.success('تم حفظ الصورة بدقة عالية');
    } catch {
      toast.error('فشل تصدير الصورة');
    }
  };

  const exportHDPDF = async () => {
    const target = hdRef.current || printRef.current;
    if (!target) return toast.error('لا يوجد محتوى للتصدير');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(target, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = 210;
      const imgH = (canvas.height * pdfW) / canvas.width;
      const pdfH = 297;
      let position = 0;
      let remainingH = imgH;
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, position, pdfW, imgH);
      remainingH -= pdfH;
      while (remainingH > 0) {
        position = remainingH - imgH;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfW, imgH);
        remainingH -= pdfH;
      }
      pdf.save(`Shipping_Report_${Date.now()}.pdf`);
      toast.success('تم تصدير PDF');
    } catch {
      toast.error('فشل تصدير PDF');
    }
  };

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const summarySheet = [
      { 'البيان': 'إجمالي الإيرادات', 'القيمة': summary.totalRevenue },
      { 'البيان': 'إجمالي التكلفة', 'القيمة': summary.totalCost },
      { 'البيان': 'صافي الربح', 'القيمة': summary.netProfit },
      { 'البيان': 'المحصل', 'القيمة': summary.totalCollected },
      { 'البيان': 'المتبقي', 'القيمة': summary.totalOutstanding },
      { 'البيان': 'عدد الحاويات', 'القيمة': summary.containerCount },
      { 'البيان': 'عدد الشحنات', 'القيمة': summary.shipmentCount },
      { 'البيان': 'عدد العملاء', 'القيمة': summary.uniqueClients },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), 'الملخص');
    const containersSheet = filteredContainers.map(c => ({
      'الحاوية': c.containerNumber, 'النوع': c.type, 'المسار': c.route,
      'الحالة': STATUS_LABELS[c.status], 'السعة': c.capacity, 'المستخدم': c.usedCapacity,
      'الإيراد': c.totalRevenue, 'التكلفة': c.totalCost, 'الربح': c.profit,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(containersSheet), 'الحاويات');
    const shipmentsSheet = filteredShipments.map(s => ({
      'العميل': s.clientName, 'البضاعة': s.goodsType, 'القطع': s.quantity,
      'CBM': s.cbm, 'الوزن': s.weight, 'سعر/متر': s.pricePerMeter,
      'الإيراد': s.contractPrice, 'المحصل': s.amountPaid, 'المتبقي': s.remainingAmount,
      'حالة الدفع': STATUS_LABELS[s.paymentStatus], 'التتبع': s.trackingNumber || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shipmentsSheet), 'الشحنات');
    XLSX.writeFile(wb, `Shipping_Report_${Date.now()}.xlsx`);
    toast.success('تم تصدير Excel');
  };

  const resetFilters = () => {
    setSelectedContainerIds(new Set());
    setSelectedClientIds(new Set());
    setSelectedContainerStatuses(new Set());
    setPayMode('all');
    setProfitMode('all');
    setSearchText('');
    setDateFrom('');
    setDateTo('');
  };

  const activeFilterCount =
    selectedContainerIds.size + selectedClientIds.size + selectedContainerStatuses.size +
    (payMode !== 'all' ? 1 : 0) + (profitMode !== 'all' ? 1 : 0) +
    (searchText ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleShipments = (id: string) => {
    setShipmentsOpen(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const copyText = (text: string, label = 'النص') => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  const getContact = (id?: string) => contactsFull.find(c => c.id === id);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-3 pb-4" ref={printRef}>
      {/* ========== HEADER ========== */}
      <div className="rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/15">
              <Ship className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">مركز تقارير الشحن</h2>
              <p className="text-[10px] text-muted-foreground">{summary.containerCount} حاوية • {summary.shipmentCount} شحنة • {summary.uniqueClients} عميل</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowFinanceGlobal(v => !v)} title={showFinanceGlobal ? 'إخفاء المالية' : 'إظهار المالية'}>
              {showFinanceGlobal ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </Button>
            {onRefresh && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh} title="تحديث">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHdPreview({ open: true, type: 'all' })} title="معاينة HD">
              <ImageIcon className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={exportHDPDF} title="PDF">
              <FileText className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExportExcel} title="Excel">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Quick filter bar */}
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1 shrink-0" onClick={() => setFiltersOpen(true)}>
            <Filter className="h-3 w-3" /> فلاتر ذكية
            {activeFilterCount > 0 && <Badge className="h-3.5 min-w-3.5 px-1 text-[8px]">{activeFilterCount}</Badge>}
          </Button>
          <div className="relative flex-1">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="بحث في الحاويات أو الشحنات..." className="h-8 text-[11px] pr-7" />
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-[10px] px-2 shrink-0" onClick={resetFilters}>
              <X className="h-3 w-3" /> مسح
            </Button>
          )}
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-2">
            {Array.from(selectedContainerIds).map(id => {
              const c = containers.find(x => x.id === id);
              return c ? <FilterChip key={`c-${id}`} label={c.containerNumber} onRemove={() => { const n = new Set(selectedContainerIds); n.delete(id); setSelectedContainerIds(n); }} /> : null;
            })}
            {Array.from(selectedClientIds).map(id => {
              const c = contacts.find(x => x.id === id);
              return c ? <FilterChip key={`cl-${id}`} label={c.name} onRemove={() => { const n = new Set(selectedClientIds); n.delete(id); setSelectedClientIds(n); }} /> : null;
            })}
            {Array.from(selectedContainerStatuses).map(s => (
              <FilterChip key={`s-${s}`} label={STATUS_LABELS[s]} onRemove={() => { const n = new Set(selectedContainerStatuses); n.delete(s); setSelectedContainerStatuses(n); }} />
            ))}
            {payMode !== 'all' && <FilterChip label={`دفع: ${STATUS_LABELS[payMode]}`} onRemove={() => setPayMode('all')} />}
            {profitMode !== 'all' && <FilterChip label={profitMode === 'profit' ? 'رابح' : 'خاسر'} onRemove={() => setProfitMode('all')} />}
            {dateFrom && <FilterChip label={`من: ${dateFrom}`} onRemove={() => setDateFrom('')} />}
            {dateTo && <FilterChip label={`إلى: ${dateTo}`} onRemove={() => setDateTo('')} />}
          </div>
        )}
      </div>

      {/* ========== HD CAPTURABLE WRAPPER ========== */}
      <div ref={hdRef} className="space-y-3">

      {/* ========== COLLAPSIBLE SUMMARY ========== */}
      <Collapsible open={showSummary} onOpenChange={setShowSummary}>
        <div className="flex items-center justify-between mb-1.5">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              <span className="font-bold">الملخصات التنفيذية</span>
              {showSummary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          {/* Row 1: Money */}
          {showFinanceGlobal && (
            <div className="grid grid-cols-3 gap-2 mb-2">
              <SummaryCard icon={DollarSign} label="إجمالي الإيرادات" value={fmtCompact(summary.totalRevenue)} color="blue" />
              <SummaryCard icon={Receipt} label="إجمالي المصروفات" value={fmtCompact(summary.totalCost)} color="orange" />
              <SummaryCard icon={summary.netProfit >= 0 ? TrendingUp : TrendingDown} label="المتبقي / صافي الربح" value={fmtCompact(summary.netProfit)} color={summary.netProfit >= 0 ? 'green' : 'red'} />
            </div>
          )}
          {/* Row 2: Counts */}
          <div className="grid grid-cols-4 gap-2">
            <SummaryCard icon={ContainerIcon} label="الحاويات" value={summary.containerCount.toLocaleString()} color="blue" />
            <SummaryCard icon={Users} label="العملاء" value={summary.uniqueClients.toLocaleString()} color="purple" />
            {showFinanceGlobal && <SummaryCard icon={CheckCircle2} label="التحصيلات" value={fmtCompact(summary.totalCollected)} color="green" />}
            {showFinanceGlobal && <SummaryCard icon={AlertTriangle} label="المتبقي" value={fmtCompact(summary.totalOutstanding)} color="red" />}
            {!showFinanceGlobal && <SummaryCard icon={Box} label="إجمالي CBM" value={summary.totalCBM.toFixed(1)} color="cyan" />}
            {!showFinanceGlobal && <SummaryCard icon={Weight} label="الوزن" value={`${(summary.totalWeight / 1000).toFixed(1)}t`} color="purple" />}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ========== DISMISSIBLE ALERTS ========== */}
      <AnimatePresence>
        {showAlerts && alerts.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl bg-card border border-border p-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <h3 className="text-xs font-bold">تنبيهات</h3>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAlerts(false)} title="إخفاء">
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {alerts.map(a => {
                  const Icon = a.icon;
                  const bg = a.color === 'red'
                    ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400 hover:bg-red-500/15'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15';
                  return (
                    <button key={a.id} onClick={a.action} className={cn('flex items-center gap-1.5 p-1.5 rounded-lg border text-right transition-all', bg)}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-none">{a.count}</p>
                        <p className="text-[9px] leading-tight truncate">{a.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!showAlerts && alerts.length > 0 && (
        <button onClick={() => setShowAlerts(true)} className="text-[10px] text-amber-600 hover:underline flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> إظهار {alerts.length} تنبيه
        </button>
      )}

      {/* ========== CONTAINER CARDS (MAIN WORK) ========== */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold flex items-center gap-1.5">
            <ContainerIcon className="h-3.5 w-3.5 text-primary" />
            الحاويات ({filteredContainers.length})
          </h3>
        </div>
        {filteredContainers.length === 0 ? (
          <div className="rounded-xl bg-card border border-border p-8 text-center">
            <ContainerIcon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-[11px] text-muted-foreground">
              {activeFilterCount > 0 ? 'لا توجد حاويات مطابقة للفلاتر' : 'لا توجد حاويات'}
            </p>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="mt-2 h-7 text-[10px]" onClick={resetFilters}>
                <X className="h-3 w-3" /> مسح الفلاتر
              </Button>
            )}
          </div>
        ) : (
          filteredContainers.map(container => (
            <ContainerCard
              key={container.id}
              container={container}
              shipments={shipments.filter(s => s.containerId === container.id)}
              expanded={expandedCards.has(container.id)}
              shipmentsVisible={shipmentsOpen.has(container.id)}
              showFinanceGlobal={showFinanceGlobal}
              onToggleExpand={() => toggleCard(container.id)}
              onToggleShipments={() => toggleShipments(container.id)}
              onPreviewHD={() => setHdPreview({ open: true, type: 'card', containerId: container.id })}
              fmt={fmt}
              getContact={getContact}
              copyText={copyText}
            />
          ))
        )}
      </div>

      {/* ========== COLLAPSIBLE ANALYTICS ========== */}
      <Collapsible open={showAnalytics} onOpenChange={setShowAnalytics}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 w-full justify-start">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="font-bold">التحليلات التفاعلية</span>
            {showAnalytics ? <ChevronUp className="h-3.5 w-3.5 mr-auto" /> : <ChevronDown className="h-3.5 w-3.5 mr-auto" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-2">
            <ChartCard title="اتجاه الإيرادات / الأرباح" icon={BarChart3}>
              {monthlyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={fmtCompact} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(215,70%,45%)" name="إيرادات" strokeWidth={2} />
                    <Line type="monotone" dataKey="profit" stroke="hsl(145,65%,42%)" name="ربح" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </ChartCard>

            <ChartCard title="المحصل مقابل المتبقي" icon={Wallet}>
              {collectionDonut.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={collectionDonut} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${fmtCompact(value)}`} labelLine={false}>
                      {collectionDonut.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </ChartCard>

            <ChartCard title="ربحية الحاويات" icon={ContainerIcon}>
              {containerProfitChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={containerProfitChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={fmtCompact} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                      {containerProfitChart.map((d, i) => (
                        <Cell key={i} fill={d.profit >= 0 ? 'hsl(145,65%,42%)' : 'hsl(0,72%,51%)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </ChartCard>

            <ChartCard title="حالة الدفع" icon={Percent}>
              <PaymentStatusChart shipments={filteredShipments} />
            </ChartCard>
          </div>
        </CollapsibleContent>
      </Collapsible>

      </div>{/* end HD wrapper */}

      {/* ========== SMART FILTERS SHEET ========== */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-[340px] sm:w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-sm flex items-center justify-between">
              <span>فلاتر ذكية</span>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={resetFilters}>
                  <X className="h-3 w-3 ml-1" /> مسح الكل
                </Button>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <FilterSection title="الفترة الزمنية" icon={Hash}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">من</label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">إلى</label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
            </FilterSection>

            <FilterSection title={`الحاويات (${selectedContainerIds.size})`} icon={ContainerIcon}>
              <MultiSelectList
                items={containers.map(c => ({ id: c.id, label: c.containerNumber, sub: c.route }))}
                selected={selectedContainerIds}
                onChange={setSelectedContainerIds}
                placeholder="ابحث عن حاوية..."
              />
            </FilterSection>

            <FilterSection title={`العملاء (${selectedClientIds.size})`} icon={Users}>
              <MultiSelectList
                items={contacts.filter(c => c.type === 'client').map(c => ({ id: c.id, label: c.name }))}
                selected={selectedClientIds}
                onChange={setSelectedClientIds}
                placeholder="ابحث عن عميل..."
              />
            </FilterSection>

            <FilterSection title="حالة الحاوية" icon={Truck}>
              <div className="grid grid-cols-2 gap-1.5">
                {['loading', 'shipped', 'arrived', 'cleared', 'delivered'].map(s => {
                  const checked = selectedContainerStatuses.has(s);
                  return (
                    <button key={s} onClick={() => {
                      const n = new Set(selectedContainerStatuses);
                      n.has(s) ? n.delete(s) : n.add(s);
                      setSelectedContainerStatuses(n);
                    }} className={cn('p-2 rounded-lg border text-[10px] text-right transition-all', checked ? STATUS_COLORS[s] : 'bg-card border-border hover:bg-muted/30')}>
                      {checked && <Check className="h-3 w-3 inline ml-1" />}
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </FilterSection>

            <FilterSection title="الحالة المالية" icon={DollarSign}>
              <div className="grid grid-cols-4 gap-1.5">
                {(['all', 'paid', 'partial', 'unpaid'] as PayMode[]).map(m => (
                  <button key={m} onClick={() => setPayMode(m)} className={cn('p-2 rounded-lg border text-[10px] text-center transition-all', payMode === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-muted/30')}>
                    {m === 'all' ? 'الكل' : STATUS_LABELS[m]}
                  </button>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="وضع الحاوية" icon={TrendingUp}>
              <div className="grid grid-cols-3 gap-1.5">
                {(['all', 'profit', 'loss'] as ProfitMode[]).map(m => (
                  <button key={m} onClick={() => setProfitMode(m)} className={cn('p-2 rounded-lg border text-[10px] text-center transition-all',
                    profitMode === m
                      ? m === 'profit' ? 'bg-green-500 text-white border-green-500'
                        : m === 'loss' ? 'bg-red-500 text-white border-red-500'
                        : 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border hover:bg-muted/30')}>
                    {m === 'all' ? 'الكل' : m === 'profit' ? 'رابح' : 'خاسر'}
                  </button>
                ))}
              </div>
            </FilterSection>

            <Button className="w-full h-9 text-xs" onClick={() => setFiltersOpen(false)}>
              تطبيق ({filteredContainers.length} حاوية)
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ========== HD PREVIEW DIALOG ========== */}
      <Dialog open={hdPreview.open} onOpenChange={(o) => setHdPreview({ ...hdPreview, open: o })}>
        <DialogContent className="max-w-4xl max-h-[92vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-3 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm">معاينة HD</DialogTitle>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={exportHDImage}>
                  <ImageIcon className="h-3 w-3" /> صورة
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={exportHDPDF}>
                  <FileText className="h-3 w-3" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => window.print()}>
                  <Printer className="h-3 w-3" /> طباعة
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto bg-white p-6">
            {hdPreview.type === 'card' && hdPreview.containerId ? (
              (() => {
                const c = containers.find(x => x.id === hdPreview.containerId);
                if (!c) return null;
                const cShips = shipments.filter(s => s.containerId === c.id);
                return <HDContainerView container={c} shipments={cShips} fmt={fmt} getContact={getContact} showFinance={showFinanceGlobal} />;
              })()
            ) : (
              <HDFullView summary={summary} containers={filteredContainers} shipments={filteredShipments} fmt={fmt} showFinance={showFinanceGlobal} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// CONTAINER CARD (main work)
// ============================================================
function ContainerCard({
  container, shipments, expanded, shipmentsVisible, showFinanceGlobal,
  onToggleExpand, onToggleShipments, onPreviewHD, fmt, getContact, copyText,
}: {
  container: Container;
  shipments: Shipment[];
  expanded: boolean;
  shipmentsVisible: boolean;
  showFinanceGlobal: boolean;
  onToggleExpand: () => void;
  onToggleShipments: () => void;
  onPreviewHD: () => void;
  fmt: (v: number) => string;
  getContact: (id?: string) => any;
  copyText: (t: string, l?: string) => void;
}) {
  const [showFinanceLocal, setShowFinanceLocal] = useState(showFinanceGlobal);
  const showFinance = showFinanceGlobal && showFinanceLocal;

  const fillRate = container.capacity > 0 ? (container.usedCapacity / container.capacity) * 100 : 0;
  const totalCollected = shipments.reduce((s, sh) => s + sh.amountPaid, 0);
  const totalOutstanding = shipments.reduce((s, sh) => s + sh.remainingAmount, 0);
  const totalPieces = shipments.reduce((s, sh) => s + (sh.quantity || 0), 0);
  const totalCBM = shipments.reduce((s, sh) => s + sh.cbm, 0);
  const totalWeight = shipments.reduce((s, sh) => s + (sh.weight || 0), 0);

  // Container expense breakdown
  const expenses = [
    { label: 'سعر الحاوية', value: container.containerPrice || 0 },
    { label: 'تكلفة الشحن', value: container.shippingCost || 0 },
    { label: 'الجمارك', value: container.customsCost || 0 },
    { label: 'الميناء', value: container.portCost || 0 },
    { label: 'الزجاج', value: (container as any).glassFees || 0 },
    { label: 'مصاريف أخرى', value: container.otherCosts || 0 },
  ].filter(e => e.value > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border bg-card overflow-hidden transition-all',
        container.profit < 0 && showFinance ? 'border-red-500/30' : 'border-border'
      )}
    >
      {/* === HEADER (always visible) === */}
      <div className="p-3 cursor-pointer hover:bg-muted/20 transition-colors" onClick={onToggleExpand}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', container.profit < 0 && showFinance ? 'bg-red-500/15' : 'bg-primary/10')}>
              <ContainerIcon className={cn('h-4 w-4', container.profit < 0 && showFinance ? 'text-red-600' : 'text-primary')} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm font-bold truncate">{container.containerNumber}</h3>
                <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[9px] border font-semibold', STATUS_COLORS[container.status])}>
                  {STATUS_LABELS[container.status]}
                </span>
                {showFinance && container.profit < 0 && (
                  <Badge variant="destructive" className="h-4 text-[8px] px-1.5">خاسرة</Badge>
                )}
                {showFinance && container.profit >= 0 && container.profit > 0 && (
                  <Badge className="h-4 text-[8px] px-1.5 bg-green-500/15 text-green-700 border-green-500/30 hover:bg-green-500/20">رابحة</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{container.route || '-'}</span>
                <span>•</span>
                <span>{shipments.length} شحنة</span>
                <span>•</span>
                <span>{totalPieces} قطعة</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowFinanceLocal(v => !v)} title={showFinanceLocal ? 'إخفاء المالية' : 'إظهار المالية'}>
              {showFinanceLocal && showFinanceGlobal ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPreviewHD} title="معاينة HD">
              <ImageIcon className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleExpand}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Quick chips */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          <MiniChip label="الإشغال" value={`${fillRate.toFixed(0)}%`} accent={fillRate > 90 ? 'red' : fillRate > 70 ? 'amber' : 'green'} />
          <MiniChip label="CBM" value={totalCBM.toFixed(1)} />
          <MiniChip label="الوزن" value={`${(totalWeight / 1000).toFixed(1)}t`} />
          {showFinance && <MiniChip label="إيراد" value={fmt(container.totalRevenue)} accent="blue" />}
          {showFinance && <MiniChip label="تكلفة" value={fmt(container.totalCost)} accent="orange" />}
          {showFinance && <MiniChip label="الربح" value={fmt(container.profit)} accent={container.profit >= 0 ? 'green' : 'red'} />}
          {!showFinance && <MiniChip label="القطع" value={String(totalPieces)} />}
          {!showFinance && <MiniChip label="الشحنات" value={String(shipments.length)} />}
          {!showFinance && <MiniChip label="السعة" value={`${container.capacity}`} />}
        </div>

        {/* Fill bar */}
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full transition-all', fillRate > 100 ? 'bg-red-500' : fillRate > 90 ? 'bg-amber-500' : fillRate > 70 ? 'bg-blue-500' : 'bg-green-500')}
              style={{ width: `${Math.min(100, fillRate)}%` }}
            />
          </div>
        </div>
      </div>

      {/* === EXPANDED DETAILS === */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t border-border p-3 space-y-3 bg-muted/10">
              {/* Logistics info */}
              <div>
                <h4 className="text-[10px] font-bold text-muted-foreground mb-1.5">معلومات اللوجستيات</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <InfoTile label="النوع" value={container.type} />
                  <InfoTile label="السعة" value={`${container.capacity}`} />
                  <InfoTile label="المستخدم" value={container.usedCapacity.toFixed(1)} />
                  <InfoTile label="المتبقي" value={Math.max(0, container.capacity - container.usedCapacity).toFixed(1)} />
                  {container.departureDate && <InfoTile label="المغادرة" value={new Date(container.departureDate).toLocaleDateString('en-GB')} />}
                  {container.arrivalDate && <InfoTile label="الوصول" value={new Date(container.arrivalDate).toLocaleDateString('en-GB')} />}
                  {container.clearanceDate && <InfoTile label="التخليص" value={new Date(container.clearanceDate).toLocaleDateString('en-GB')} />}
                  <InfoTile label="الحالة" value={STATUS_LABELS[container.status]} />
                </div>
              </div>

              {/* Expenses breakdown */}
              {showFinance && expenses.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-muted-foreground mb-1.5">تفاصيل المصاريف</h4>
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    {expenses.map((e, i) => (
                      <div key={i} className={cn('flex justify-between items-center px-2.5 py-1.5 text-[11px]', i % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                        <span className="text-muted-foreground">{e.label}</span>
                        <span className="font-semibold tabular-nums">{fmt(e.value)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center px-2.5 py-2 text-xs font-bold bg-primary/5 border-t border-border">
                      <span>إجمالي التكلفة</span>
                      <span className="tabular-nums text-primary">{fmt(container.totalCost)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Financial summary */}
              {showFinance && (
                <div>
                  <h4 className="text-[10px] font-bold text-muted-foreground mb-1.5">الملخص المالي</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <FinanceTile label="الإيراد" value={fmt(container.totalRevenue)} color="blue" />
                    <FinanceTile label="التكلفة" value={fmt(container.totalCost)} color="orange" />
                    <FinanceTile label="المحصل" value={fmt(totalCollected)} color="green" />
                    <FinanceTile label="المتبقي" value={fmt(totalOutstanding)} color="red" />
                    <FinanceTile label="صافي الربح" value={fmt(container.profit)} color={container.profit >= 0 ? 'green' : 'red'} className="col-span-2 sm:col-span-4" big />
                  </div>
                </div>
              )}

              {container.notes && (
                <div className="rounded-lg border border-border bg-card p-2.5">
                  <h4 className="text-[10px] font-bold text-muted-foreground mb-1">ملاحظات</h4>
                  <p className="text-[11px] whitespace-pre-wrap">{container.notes}</p>
                </div>
              )}

              {/* Show shipments toggle */}
              <Button variant="outline" size="sm" className="w-full h-8 text-[11px] gap-1.5" onClick={onToggleShipments}>
                <Package className="h-3.5 w-3.5" />
                {shipmentsVisible ? 'إخفاء الشحنات' : `إظهار الشحنات (${shipments.length})`}
                {shipmentsVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>

              {/* Shipments */}
              <AnimatePresence>
                {shipmentsVisible && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="space-y-1.5 pt-1">
                      {shipments.length === 0 ? (
                        <div className="text-center py-4 text-[10px] text-muted-foreground">لا توجد شحنات</div>
                      ) : (
                        shipments.map((s, i) => {
                          const contact = getContact(s.clientId);
                          const phone = contact?.phone || (contact as any)?.whatsapp;
                          return (
                            <div key={s.id} className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                                    <p className="text-xs font-bold truncate">{s.clientName}</p>
                                    <span className={cn('inline-flex px-1 py-0 rounded text-[8px] border', STATUS_COLORS[s.paymentStatus])}>
                                      {STATUS_LABELS[s.paymentStatus]}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.goodsType}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {phone && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => window.open(`https://wa.me/${phone.replace(/[^\d]/g, '')}`, '_blank')} title="واتساب">
                                      <Phone className="h-3 w-3 text-green-600" />
                                    </Button>
                                  )}
                                  {s.trackingNumber && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyText(s.trackingNumber!, 'رقم التتبع')} title="نسخ التتبع">
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-[9px]">
                                <ShipmentField label="القطع" value={String(s.quantity || 0)} />
                                <ShipmentField label="CBM" value={s.cbm.toFixed(2)} />
                                <ShipmentField label="الوزن" value={`${(s.weight || 0).toLocaleString()}كغ`} />
                                {showFinance && <ShipmentField label="سعر/م" value={fmt(s.pricePerMeter)} />}
                                {showFinance && <ShipmentField label="الإيراد" value={fmt(s.contractPrice)} />}
                                {showFinance && <ShipmentField label="المحصل" value={fmt(s.amountPaid)} color="green" />}
                                {showFinance && <ShipmentField label="المتبقي" value={fmt(s.remainingAmount)} color={s.remainingAmount > 0 ? 'red' : 'green'} />}
                                {s.trackingNumber && <ShipmentField label="التتبع" value={s.trackingNumber} mono />}
                                {phone && <ShipmentField label="الهاتف" value={phone} mono />}
                              </div>
                              {s.notes && (
                                <p className="text-[9px] text-muted-foreground border-t border-border pt-1">{s.notes}</p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================
// HD VIEWS
// ============================================================
function HDFullView({ summary, containers, shipments, fmt, showFinance }: any) {
  return (
    <div className="bg-white text-slate-900 max-w-3xl mx-auto" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div className="bg-gradient-to-l from-blue-700 to-blue-900 text-white p-6 rounded-t-lg">
        <h1 className="text-2xl font-bold mb-1">تقرير مركز الشحن</h1>
        <p className="text-sm opacity-90">{new Date().toLocaleDateString('ar-SA')}</p>
      </div>
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {showFinance && <HDStat label="الإيرادات" value={fmt(summary.totalRevenue)} color="blue" />}
          {showFinance && <HDStat label="التكلفة" value={fmt(summary.totalCost)} color="orange" />}
          {showFinance && <HDStat label="صافي الربح" value={fmt(summary.netProfit)} color={summary.netProfit >= 0 ? 'green' : 'red'} />}
          <HDStat label="الحاويات" value={String(summary.containerCount)} />
          <HDStat label="الشحنات" value={String(summary.shipmentCount)} />
          <HDStat label="العملاء" value={String(summary.uniqueClients)} />
        </div>
        <div>
          <h2 className="text-base font-bold mb-2 border-r-4 border-blue-700 pr-2">قائمة الحاويات</h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-50">
                <th className="border p-2 text-right">الحاوية</th>
                <th className="border p-2">الحالة</th>
                <th className="border p-2">الشحنات</th>
                <th className="border p-2">CBM</th>
                {showFinance && <th className="border p-2">إيراد</th>}
                {showFinance && <th className="border p-2">تكلفة</th>}
                {showFinance && <th className="border p-2">ربح</th>}
              </tr>
            </thead>
            <tbody>
              {containers.map((c: Container) => {
                const cs = shipments.filter((s: Shipment) => s.containerId === c.id);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="border p-2 font-bold text-right">{c.containerNumber}</td>
                    <td className="border p-2 text-center">{STATUS_LABELS[c.status]}</td>
                    <td className="border p-2 text-center">{cs.length}</td>
                    <td className="border p-2 text-center">{c.usedCapacity.toFixed(1)}</td>
                    {showFinance && <td className="border p-2 text-left">{fmt(c.totalRevenue)}</td>}
                    {showFinance && <td className="border p-2 text-left">{fmt(c.totalCost)}</td>}
                    {showFinance && <td className={cn('border p-2 text-left font-bold', c.profit >= 0 ? 'text-green-700' : 'text-red-700')}>{fmt(c.profit)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HDContainerView({ container, shipments, fmt, getContact, showFinance }: any) {
  const totalCBM = shipments.reduce((s: number, sh: Shipment) => s + sh.cbm, 0);
  const totalCollected = shipments.reduce((s: number, sh: Shipment) => s + sh.amountPaid, 0);
  const totalOutstanding = shipments.reduce((s: number, sh: Shipment) => s + sh.remainingAmount, 0);
  return (
    <div className="bg-white text-slate-900 max-w-3xl mx-auto" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div className="bg-gradient-to-l from-blue-700 to-blue-900 text-white p-6 rounded-t-lg">
        <h1 className="text-2xl font-bold mb-1">{container.containerNumber}</h1>
        <p className="text-sm opacity-90">{container.route} • {STATUS_LABELS[container.status]}</p>
      </div>
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-3">
          <HDStat label="السعة" value={`${container.usedCapacity.toFixed(1)}/${container.capacity}`} />
          <HDStat label="الشحنات" value={String(shipments.length)} />
          <HDStat label="CBM" value={totalCBM.toFixed(1)} />
          {showFinance && <HDStat label="الربح" value={fmt(container.profit)} color={container.profit >= 0 ? 'green' : 'red'} />}
        </div>
        {showFinance && (
          <div className="grid grid-cols-4 gap-3">
            <HDStat label="الإيراد" value={fmt(container.totalRevenue)} color="blue" />
            <HDStat label="التكلفة" value={fmt(container.totalCost)} color="orange" />
            <HDStat label="المحصل" value={fmt(totalCollected)} color="green" />
            <HDStat label="المتبقي" value={fmt(totalOutstanding)} color="red" />
          </div>
        )}
        <div>
          <h2 className="text-base font-bold mb-2 border-r-4 border-blue-700 pr-2">الشحنات</h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-50">
                <th className="border p-2">#</th>
                <th className="border p-2 text-right">العميل</th>
                <th className="border p-2">الهاتف</th>
                <th className="border p-2">البضاعة</th>
                <th className="border p-2">القطع</th>
                <th className="border p-2">CBM</th>
                {showFinance && <th className="border p-2">الإيراد</th>}
                {showFinance && <th className="border p-2">المتبقي</th>}
              </tr>
            </thead>
            <tbody>
              {shipments.map((s: Shipment, i: number) => {
                const c = getContact(s.clientId);
                return (
                  <tr key={s.id}>
                    <td className="border p-2 text-center">{i + 1}</td>
                    <td className="border p-2 text-right font-bold">{s.clientName}</td>
                    <td className="border p-2 text-center text-[10px]">{c?.phone || '-'}</td>
                    <td className="border p-2 text-right">{s.goodsType}</td>
                    <td className="border p-2 text-center">{s.quantity}</td>
                    <td className="border p-2 text-center">{s.cbm.toFixed(2)}</td>
                    {showFinance && <td className="border p-2 text-left">{fmt(s.contractPrice)}</td>}
                    {showFinance && <td className={cn('border p-2 text-left font-bold', s.remainingAmount > 0 ? 'text-red-700' : 'text-green-700')}>{fmt(s.remainingAmount)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HELPER COMPONENTS
// ============================================================
const HDStat = ({ label, value, color }: { label: string; value: string; color?: string }) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  return (
    <div className={cn('p-3 rounded-lg border text-center', color ? colorMap[color] : 'bg-slate-50 border-slate-200')}>
      <p className="text-xs opacity-70 mb-0.5">{label}</p>
      <p className="text-base font-bold tabular-nums">{value}</p>
    </div>
  );
};

const SummaryCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30',
    green: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30',
    red: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
    orange: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30',
    purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30',
    cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
  };
  return (
    <div className={cn('rounded-xl border p-2.5', colors[color])}>
      <div className="flex items-center justify-between mb-0.5">
        <Icon className="h-3.5 w-3.5 opacity-80" />
      </div>
      <p className="text-[9px] opacity-80">{label}</p>
      <p className="text-sm font-bold tabular-nums leading-tight">{value}</p>
    </div>
  );
};

const MiniChip = ({ label, value, accent }: { label: string; value: string; accent?: string }) => {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    red: 'text-red-600 dark:text-red-400',
    orange: 'text-orange-600 dark:text-orange-400',
    amber: 'text-amber-600 dark:text-amber-400',
    purple: 'text-purple-600 dark:text-purple-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
  };
  return (
    <div className="rounded-md bg-muted/40 p-1.5 text-center">
      <p className="text-[8px] text-muted-foreground leading-none">{label}</p>
      <p className={cn('text-[11px] font-bold tabular-nums leading-tight mt-0.5', accent && colorMap[accent])}>{value}</p>
    </div>
  );
};

const InfoTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-card border border-border p-1.5">
    <p className="text-[8px] text-muted-foreground leading-none">{label}</p>
    <p className="text-[11px] font-semibold mt-0.5 truncate">{value}</p>
  </div>
);

const FinanceTile = ({ label, value, color, big, className }: { label: string; value: string; color: string; big?: boolean; className?: string }) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    green: 'bg-green-500/10 text-green-700 dark:text-green-400',
    red: 'bg-red-500/10 text-red-700 dark:text-red-400',
    orange: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  };
  return (
    <div className={cn('rounded-lg p-2 text-center', colors[color], className)}>
      <p className="text-[9px] opacity-80 leading-none">{label}</p>
      <p className={cn('font-bold tabular-nums leading-tight mt-1', big ? 'text-base' : 'text-xs')}>{value}</p>
    </div>
  );
};

const ShipmentField = ({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) => {
  const colorMap: Record<string, string> = {
    green: 'text-green-600 dark:text-green-400',
    red: 'text-red-600 dark:text-red-400',
  };
  return (
    <div className="rounded bg-muted/30 p-1">
      <p className="text-[8px] text-muted-foreground leading-none">{label}</p>
      <p className={cn('text-[10px] font-semibold leading-tight mt-0.5 truncate', color && colorMap[color], mono && 'font-mono')}>{value}</p>
    </div>
  );
};

const FilterChip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <button onClick={onRemove} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15">
    <span>{label}</span>
    <X className="h-2.5 w-2.5" />
  </button>
);

const FilterSection = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
  <div>
    <h4 className="text-[10px] font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
      <Icon className="h-3 w-3" /> {title}
    </h4>
    {children}
  </div>
);

const MultiSelectList = ({ items, selected, onChange, placeholder }: {
  items: { id: string; label: string; sub?: string }[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  placeholder: string;
}) => {
  const [q, setQ] = useState('');
  const filtered = items.filter(i => i.label.toLowerCase().includes(q.toLowerCase()) || (i.sub || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <Input placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} className="h-7 text-[10px] mb-1.5" />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-3">لا توجد نتائج</p>
        ) : (
          filtered.map(item => {
            const checked = selected.has(item.id);
            return (
              <button key={item.id} onClick={() => {
                const n = new Set(selected);
                n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                onChange(n);
              }} className={cn('w-full flex items-center gap-2 p-1.5 text-right hover:bg-muted/30 transition-colors', checked && 'bg-primary/10')}>
                <Checkbox checked={checked} className="pointer-events-none h-3.5 w-3.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium truncate">{item.label}</p>
                  {item.sub && <p className="text-[9px] text-muted-foreground truncate">{item.sub}</p>}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

const ChartCard = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
  <div className="rounded-xl bg-card border border-border p-2.5">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-[11px] font-bold">{title}</h3>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
    {children}
  </div>
);

const EmptyChart = () => (
  <div className="h-[180px] flex items-center justify-center text-[10px] text-muted-foreground">
    لا توجد بيانات كافية
  </div>
);

const PaymentStatusChart = ({ shipments }: { shipments: Shipment[] }) => {
  const data = useMemo(() => {
    const counts: Record<string, number> = { paid: 0, partial: 0, unpaid: 0 };
    shipments.forEach(s => { counts[s.paymentStatus] = (counts[s.paymentStatus] || 0) + 1; });
    return [
      { name: 'مدفوع', value: counts.paid, color: 'hsl(145,65%,42%)' },
      { name: 'جزئي', value: counts.partial, color: 'hsl(45,93%,47%)' },
      { name: 'غير مدفوع', value: counts.unpaid, color: 'hsl(0,72%,51%)' },
    ].filter(d => d.value > 0);
  }, [shipments]);
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
};

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

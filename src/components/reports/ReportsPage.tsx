import { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  FileText, Download, Filter, Calendar, ArrowUpCircle, ArrowDownCircle,
  FileSpreadsheet, Share2, Receipt, Database, BarChart3, Users, Ship,
  Image, Eye, X, Printer, Package, TrendingUp, DollarSign, Clock,
  ChevronDown, ChevronUp, AlertTriangle, Weight, Hash, ToggleLeft, ToggleRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Transaction, Fund, AccountOption, Container, Shipment, Project, ProjectStats, FinanceStats } from '@/types/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BackupSection } from './BackupSection';
import { ActivityLogReport } from './ActivityLogReport';
import { AccountingLedgerReport } from './AccountingLedgerReport';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

import { Currency } from '@/hooks/useCurrencies';
import { CurrencyDisplaySelector, convertForDisplay, getCurrencySymbol } from '@/components/shared/CurrencyDisplaySelector';

interface ReportsPageProps {
  transactions: Transaction[];
  funds: Fund[];
  contacts: AccountOption[];
  exportData: () => object;
  importData?: (data: any) => Promise<any> | void;
  containers?: Container[];
  shipments?: Shipment[];
  projects?: Project[];
  projectStats?: ProjectStats;
  stats?: FinanceStats;
  currencies?: Currency[];
}

const COLORS = ['hsl(215,70%,35%)', 'hsl(145,65%,42%)', 'hsl(0,72%,51%)', 'hsl(45,93%,47%)', 'hsl(280,60%,50%)', 'hsl(190,80%,42%)'];

const statusLabels: Record<string, string> = {
  loading: 'قيد التحميل', shipped: 'تم الشحن', arrived: 'وصلت',
  cleared: 'تم التخليص', delivered: 'تم التسليم',
  paid: 'مدفوع', partial: 'جزئي', unpaid: 'غير مدفوع',
  active: 'نشط', completed: 'مكتمل', paused: 'متوقف', cancelled: 'ملغي',
};

export function ReportsPage({
  transactions, funds, contacts, exportData, importData,
  containers = [], shipments = [], projects = [], projectStats, stats, currencies = [],
}: ReportsPageProps) {
  const [activeTab, setActiveTab] = useState('shipping');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<'shipping-summary' | 'container-detail' | 'shipment-detail' | 'projects' | 'general' | 'activity' | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [showFinancials, setShowFinancials] = useState(true);
  const [showCostDetails, setShowCostDetails] = useState(false);
  const [costsDialogContainerId, setCostsDialogContainerId] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(true);
  const [extraExpensesByContainer, setExtraExpensesByContainer] = useState<Record<string, { id: string; description: string; amount: number; date: string }[]>>({});

  // Auto-load extra expenses for inline cost details when previewing a container
  useEffect(() => {
    const targetId = costsDialogContainerId || (previewContent === 'container-detail' ? selectedContainerId : null);
    if (!targetId || extraExpensesByContainer[targetId]) return;
    supabase
      .from('container_expenses')
      .select('id, description, amount, date')
      .eq('container_id', targetId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setExtraExpensesByContainer(prev => ({
            ...prev,
            [targetId]: data.map(e => ({ ...e, amount: Number(e.amount) })),
          }));
        }
      });
  }, [costsDialogContainerId, previewContent, selectedContainerId, extraExpensesByContainer]);

  // Currency helpers
  const conv = (v: number) => convertForDisplay(v, displayCurrency, currencies);
  const sym = getCurrencySymbol(displayCurrency, currencies);
  const fmtC = (v: number) => `${sym}${conv(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFund, setFilterFund] = useState('all');
  const [filterContainerIds, setFilterContainerIds] = useState<Set<string>>(new Set());

  const previewRef = useRef<HTMLDivElement>(null);

  // ============= Computed Stats - RESPECT ALL filters =============
  const filteredShipments = useMemo(() => {
    return shipments.filter(s => {
      if (filterClient !== 'all' && s.clientId !== filterClient) return false;
      if (filterStatus !== 'all' && s.paymentStatus !== filterStatus) return false;
      if (filterContainerIds.size > 0 && !filterContainerIds.has(s.containerId)) return false;
      if (dateFrom && s.createdAt < new Date(dateFrom)) return false;
      if (dateTo && s.createdAt > new Date(dateTo)) return false;
      return true;
    });
  }, [shipments, filterClient, filterStatus, filterContainerIds, dateFrom, dateTo]);

  // Containers in scope: respect all filters
  const filteredContainers = useMemo(() => {
    const hasOtherFilters = filterClient !== 'all' || filterStatus !== 'all' || !!dateFrom || !!dateTo;
    if (filterContainerIds.size === 0 && !hasOtherFilters) return containers;
    const scopedIds = new Set(filteredShipments.map(s => s.containerId));
    if (filterContainerIds.size > 0) {
      return containers.filter(c => filterContainerIds.has(c.id) && (!hasOtherFilters || scopedIds.has(c.id)));
    }
    return containers.filter(c => scopedIds.has(c.id));
  }, [containers, filteredShipments, filterContainerIds, filterClient, filterStatus, dateFrom, dateTo]);

  const shippingStats = useMemo(() => {
    // All numbers derived from FILTERED shipments + their in-scope containers' costs
    const totalShipments = filteredShipments.length;
    const totalRevenue = filteredShipments.reduce((s, sh) => s + sh.contractPrice, 0);
    const totalCollected = filteredShipments.reduce((s, sh) => s + sh.amountPaid, 0);
    const totalRemaining = filteredShipments.reduce((s, sh) => s + sh.remainingAmount, 0);
    const totalPieces = filteredShipments.reduce((s, sh) => s + sh.quantity, 0);
    const totalWeight = filteredShipments.reduce((s, sh) => s + (sh.weight || 0), 0);
    const totalCosts = filteredContainers.reduce((s, c) => s + c.totalCost, 0);
    const totalProfit = totalRevenue - totalCosts;
    return { totalShipments, totalRevenue, totalCosts, totalProfit, totalCollected, totalRemaining, totalPieces, totalWeight };
  }, [filteredShipments, filteredContainers]);

  const paymentDistribution = useMemo(() => {
    const paid = shipments.filter(s => s.paymentStatus === 'paid').length;
    const partial = shipments.filter(s => s.paymentStatus === 'partial').length;
    const unpaid = shipments.filter(s => s.paymentStatus === 'unpaid').length;
    return [
      { name: 'مدفوع', value: paid, color: 'hsl(145,65%,42%)' },
      { name: 'جزئي', value: partial, color: 'hsl(45,93%,47%)' },
      { name: 'غير مدفوع', value: unpaid, color: 'hsl(0,72%,51%)' },
    ].filter(d => d.value > 0);
  }, [shipments]);

  const containerProfitChart = useMemo(() => {
    return containers.slice(0, 6).map(c => ({
      name: c.containerNumber.slice(-6),
      revenue: c.totalRevenue,
      cost: c.totalCost,
      profit: c.profit,
    }));
  }, [containers]);

  // ============= Export Functions =============
  const handleExportImage = async () => {
    if (!previewRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(previewRef.current, { scale: 4, useCORS: true, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `تقرير_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
      toast.success('تم تصدير الصورة بدقة عالية');
    } catch { toast.error('خطأ في تصدير الصورة'); }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async (type: string) => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(25, 65, 120);
    doc.rect(0, 0, pw, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('توطين - المساعد المالي', pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}`, pw / 2, 30, { align: 'center' });

    let y = 50;
    doc.setTextColor(25, 65, 120);
    doc.setFontSize(16);

    if (type === 'shipping-summary') {
      doc.text('تقرير ملخص الشحنات', pw / 2, y, { align: 'center' });
      y += 15;

      // Stats
      const statsData = [
        ['عدد الشحنات', shippingStats.totalShipments.toString()],
        ['إجمالي الإيرادات', `$${shippingStats.totalRevenue.toLocaleString()}`],
        ['إجمالي التكاليف', `$${shippingStats.totalCosts.toLocaleString()}`],
        ['صافي الأرباح', `$${shippingStats.totalProfit.toLocaleString()}`],
        ['المبالغ المحصلة', `$${shippingStats.totalCollected.toLocaleString()}`],
        ['المبالغ المتبقية', `$${shippingStats.totalRemaining.toLocaleString()}`],
      ];
      (doc as any).autoTable({
        startY: y, body: statsData,
        styles: { font: 'Helvetica', fontSize: 10, halign: 'center' },
        headStyles: { fillColor: [25, 65, 120] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 30, right: 30 },
        columnStyles: { 0: { fontStyle: 'bold', halign: 'right' }, 1: { halign: 'left' } },
      });
      y = (doc as any).lastAutoTable.finalY + 15;

      // Shipments table
      if (filteredShipments.length > 0) {
        doc.setFontSize(12);
        doc.text('قائمة الشحنات', pw / 2, y, { align: 'center' });
        y += 8;
        (doc as any).autoTable({
          startY: y,
          head: [['العميل', 'رقم التتبع', 'البضاعة', 'CBM', 'المقاولة', 'المدفوع', 'المتبقي', 'الحالة']],
          body: filteredShipments.map(s => [
            s.clientName,
            s.trackingNumber || '-',
            s.goodsType,
            s.cbm.toFixed(2),
            `$${s.contractPrice.toLocaleString()}`,
            `$${s.amountPaid.toLocaleString()}`,
            `$${s.remainingAmount.toLocaleString()}`,
            statusLabels[s.paymentStatus] || s.paymentStatus,
          ]),
          styles: { font: 'Helvetica', fontSize: 8, halign: 'center' },
          headStyles: { fillColor: [25, 65, 120], textColor: 255 },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: 10, right: 10 },
        });
      }
    } else if (type === 'container-detail' && selectedContainerId) {
      const container = containers.find(c => c.id === selectedContainerId);
      if (!container) return;
      const cShipments = shipments.filter(s => s.containerId === selectedContainerId);

      doc.text(`تقرير حاوية: ${container.containerNumber}`, pw / 2, y, { align: 'center' });
      y += 15;

      const info = [
        ['رقم الحاوية', container.containerNumber], ['النوع', container.type],
        ['المسار', container.route], ['الحالة', statusLabels[container.status] || container.status],
        ['السعة', `${container.capacity} CBM`], ['المستخدم', `${container.usedCapacity.toFixed(2)} CBM`],
        ['إجمالي الإيرادات', `$${container.totalRevenue.toLocaleString()}`],
        ['إجمالي التكاليف', `$${container.totalCost.toLocaleString()}`],
        ['صافي الربح', `$${container.profit.toLocaleString()}`],
      ];
      (doc as any).autoTable({ startY: y, body: info, styles: { fontSize: 10, halign: 'center' }, margin: { left: 30, right: 30 }, columnStyles: { 0: { fontStyle: 'bold', halign: 'right' } } });
      y = (doc as any).lastAutoTable.finalY + 10;

      if (cShipments.length > 0) {
        (doc as any).autoTable({
          startY: y,
          head: [['العميل', 'رقم التتبع', 'البضاعة', 'CBM', 'المقاولة', 'المتبقي']],
          body: cShipments.map(s => [s.clientName, s.trackingNumber || '-', s.goodsType, s.cbm.toFixed(2), `$${s.contractPrice.toLocaleString()}`, `$${s.remainingAmount.toLocaleString()}`]),
          styles: { font: 'Helvetica', fontSize: 9, halign: 'center' },
          headStyles: { fillColor: [25, 65, 120], textColor: 255 },
          margin: { left: 10, right: 10 },
        });
      }
    } else if (type === 'projects') {
      doc.text('تقرير المشاريع', pw / 2, y, { align: 'center' });
      y += 15;
      if (projects.length > 0) {
        const totalContract = projects.reduce((s, p) => s + p.contractValue, 0);
        const totalExpenses = projects.reduce((s, p) => s + p.expenses, 0);
        const totalProfit = projects.reduce((s, p) => s + p.profit, 0);
        (doc as any).autoTable({
          startY: y,
          head: [['المشروع', 'الحالة', 'قيمة العقد', 'المصروفات', 'الربح']],
          body: [
            ...projects.map(p => [p.name, statusLabels[p.status] || p.status, `$${p.contractValue.toLocaleString()}`, `$${p.expenses.toLocaleString()}`, `$${p.profit.toLocaleString()}`]),
            ['الإجمالي', '', `$${totalContract.toLocaleString()}`, `$${totalExpenses.toLocaleString()}`, `$${totalProfit.toLocaleString()}`],
          ],
          styles: { font: 'Helvetica', fontSize: 9, halign: 'center' },
          headStyles: { fillColor: [25, 65, 120], textColor: 255 },
          margin: { left: 10, right: 10 },
          didParseCell: function(data: any) {
            if (data.row.index === projects.length) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [230, 235, 245];
            }
          },
        });
      }
    } else if (type === 'general') {
      doc.text('التقرير العام', pw / 2, y, { align: 'center' });
      y += 15;
      const generalStats = [
        ['إجمالي السيولة', `$${(stats?.totalLiquidity || 0).toLocaleString()}`],
        ['صافي الأرباح', `$${(stats?.netCompanyProfit || 0).toLocaleString()}`],
        ['إجمالي المصروفات', `$${(stats?.totalExpenses || 0).toLocaleString()}`],
        ['إجمالي مدين', `$${(stats?.totalReceivables || 0).toLocaleString()}`],
        ['إجمالي دائن', `$${(stats?.totalPayables || 0).toLocaleString()}`],
        ['عدد الحاويات', containers.length.toString()],
        ['عدد الشحنات', shipments.length.toString()],
        ['عدد المشاريع', projects.length.toString()],
      ];
      (doc as any).autoTable({ startY: y, body: generalStats, styles: { fontSize: 10, halign: 'center' }, margin: { left: 30, right: 30 }, columnStyles: { 0: { fontStyle: 'bold', halign: 'right' } } });
    }

    // Footer
    const ph = doc.internal.pageSize.getHeight();
    doc.setFillColor(245, 245, 245);
    doc.rect(0, ph - 20, pw, 20, 'F');
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.text(`توطين © ${new Date().getFullYear()} - جميع الحقوق محفوظة`, pw / 2, ph - 8, { align: 'center' });

    doc.save(`تقرير_${type}_${Date.now()}.pdf`);
    toast.success('تم تصدير PDF بنجاح');
  };

  const handleExportExcel = (type: string) => {
    if (type === 'shipping') {
      import('@/utils/excelExport').then(({ exportContainersToExcel }) => {
        exportContainersToExcel(containers, filteredShipments);
        toast.success('تم تصدير Excel بنجاح');
      });
    } else if (type === 'projects') {
      import('@/utils/excelExport').then(async ({ exportTransactionsToExcel }) => {
        const XLSX = await import('xlsx');
        const data = projects.map(p => ({
          'المشروع': p.name, 'العميل': p.clientName || '-', 'الحالة': statusLabels[p.status],
          'قيمة العقد': p.contractValue, 'المصروفات': p.expenses,
          'المستلم': p.receivedAmount, 'الربح': p.profit,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'المشاريع');
        XLSX.writeFile(wb, `تقرير_مشاريع_${Date.now()}.xlsx`);
        toast.success('تم تصدير Excel بنجاح');
      });
    } else {
      import('@/utils/excelExport').then(({ exportTransactionsToExcel }) => {
        exportTransactionsToExcel(transactions, funds, contacts as any);
        toast.success('تم تصدير Excel بنجاح');
      });
    }
  };

  const openPreview = (content: typeof previewContent) => {
    setPreviewContent(content);
    setPreviewOpen(true);
  };

  const toggleContainer = (id: string) => {
    setExpandedContainers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ============= Stat Card =============
  const StatCard = ({ icon: Icon, label, value, color = 'text-foreground', bg = 'bg-muted/50' }: { icon: any; label: string; value: string; color?: string; bg?: string }) => (
    <div className={cn("text-center p-2.5 rounded-xl", bg)}>
      <Icon className={cn("h-4 w-4 mx-auto mb-1", color)} />
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-bold", color)}>{value}</p>
    </div>
  );

  // ============= Export Buttons =============
  const ExportButtons = ({ type }: { type: string }) => (
    <div className="grid grid-cols-3 gap-2">
      <Button variant="outline" size="sm" className="gap-1 h-8 text-[10px]" onClick={() => openPreview(type as any)}>
        <Eye className="h-3 w-3" /> معاينة
      </Button>
      <Button variant="outline" size="sm" className="gap-1 h-8 text-[10px]" onClick={() => handleExportPDF(type)}>
        <FileText className="h-3 w-3" /> PDF
      </Button>
      <Button variant="outline" size="sm" className="gap-1 h-8 text-[10px]" onClick={() => handleExportExcel(type === 'shipping-summary' ? 'shipping' : type)}>
        <FileSpreadsheet className="h-3 w-3" /> Excel
      </Button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">مركز التقارير</h2>
        {currencies.length > 1 && (
          <CurrencyDisplaySelector currencies={currencies} selectedCode={displayCurrency} onChange={setDisplayCurrency} />
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6 h-9">
          <TabsTrigger value="shipping" className="text-[10px] gap-1"><Ship className="h-3 w-3" />الشحنات</TabsTrigger>
          <TabsTrigger value="ledger" className="text-[10px] gap-1"><Users className="h-3 w-3" />الدفتر</TabsTrigger>
          <TabsTrigger value="projects" className="text-[10px] gap-1"><BarChart3 className="h-3 w-3" />المشاريع</TabsTrigger>
          <TabsTrigger value="general" className="text-[10px] gap-1"><TrendingUp className="h-3 w-3" />عام</TabsTrigger>
          <TabsTrigger value="activity" className="text-[10px] gap-1"><Clock className="h-3 w-3" />السجل</TabsTrigger>
          <TabsTrigger value="backup" className="text-[10px] gap-1"><Database className="h-3 w-3" />النسخ</TabsTrigger>
        </TabsList>

        {/* =============== تقارير الشحنات =============== */}
        <TabsContent value="shipping" className="space-y-3 mt-3">
          {/* الملخص الإحصائي */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-3 shadow-sm border border-border">
            <h3 className="text-xs font-bold mb-3">ملخص الشحنات</h3>
            <div className="grid grid-cols-4 gap-2">
              <StatCard icon={Package} label="عدد الشحنات" value={shippingStats.totalShipments.toString()} color="text-primary" bg="bg-accent" />
              <StatCard icon={Hash} label="إجمالي القطع" value={shippingStats.totalPieces.toLocaleString()} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/30" />
              <StatCard icon={Weight} label="إجمالي الوزن" value={`${shippingStats.totalWeight.toLocaleString()} كغ`} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-950/30" />
              <StatCard icon={TrendingUp} label="إجمالي الأرباح" value={fmtC(shippingStats.totalProfit)} color={shippingStats.totalProfit >= 0 ? 'text-income' : 'text-expense'} bg={shippingStats.totalProfit >= 0 ? 'bg-income/10' : 'bg-expense/10'} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <StatCard icon={ArrowUpCircle} label="الإيرادات" value={fmtC(shippingStats.totalRevenue)} color="text-income" bg="bg-income/5" />
              <StatCard icon={DollarSign} label="المحصل" value={fmtC(shippingStats.totalCollected)} color="text-income" bg="bg-income/10" />
              <StatCard icon={AlertTriangle} label="المتبقي" value={fmtC(shippingStats.totalRemaining)} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/30" />
            </div>
          </motion.div>

          {/* الرسوم البيانية */}
          {(paymentDistribution.length > 0 || containerProfitChart.length > 0) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl bg-card p-3 shadow-sm border border-border">
              <h3 className="text-xs font-bold mb-3">التمثيل البياني</h3>
              <div className="grid grid-cols-2 gap-3">
                {paymentDistribution.length > 0 && (
                  <div>
                    <p className="text-[9px] text-muted-foreground text-center mb-1">حالة الدفع</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <PieChart>
                        <Pie data={paymentDistribution} cx="50%" cy="50%" outerRadius={45} dataKey="value" label={({ name, value }) => `${name}(${value})`} labelLine={false}>
                          {paymentDistribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {containerProfitChart.length > 0 && (
                  <div>
                    <p className="text-[9px] text-muted-foreground text-center mb-1">أرباح الحاويات</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={containerProfitChart}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 8 }} />
                        <YAxis tick={{ fontSize: 8 }} />
                        <Tooltip />
                        <Bar dataKey="profit" fill="hsl(145,65%,42%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* الفلاتر */}
          <div className="rounded-xl bg-card p-3 shadow-sm border border-border space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">الفلاتر الذكية</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger className="h-8 text-[10px]"><SelectValue placeholder="العميل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[10px]">كل العملاء</SelectItem>
                  {contacts.filter(c => c.type === 'client').map(c => <SelectItem key={c.id} value={c.id} className="text-[10px]">{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-[10px]"><SelectValue placeholder="حالة الدفع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[10px]">كل الحالات</SelectItem>
                  <SelectItem value="paid" className="text-[10px]">مدفوع</SelectItem>
                  <SelectItem value="partial" className="text-[10px]">جزئي</SelectItem>
                  <SelectItem value="unpaid" className="text-[10px]">غير مدفوع</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterFund} onValueChange={setFilterFund}>
                <SelectTrigger className="h-8 text-[10px]"><SelectValue placeholder="الصندوق" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[10px]">كل الصناديق</SelectItem>
                  {funds.map(f => <SelectItem key={f.id} value={f.id} className="text-[10px]">{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-[10px]" placeholder="من" />
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-[10px]" placeholder="إلى" />
              {/* Container multi-select filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 text-[10px] justify-between relative">
                    {filterContainerIds.size > 0 ? `${filterContainerIds.size} حاوية` : 'الحاويات'}
                    {filterContainerIds.size > 0 && (
                      <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground text-[8px] flex items-center justify-center">
                        {filterContainerIds.size}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 space-y-1 max-h-60 overflow-y-auto" align="start">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium">اختر الحاويات</span>
                    {filterContainerIds.size > 0 && (
                      <button className="text-[9px] text-destructive" onClick={() => setFilterContainerIds(new Set())}>مسح</button>
                    )}
                  </div>
                  {containers.map(c => (
                    <label key={c.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={filterContainerIds.has(c.id)}
                        onCheckedChange={(checked) => {
                          setFilterContainerIds(prev => {
                            const next = new Set(prev);
                            checked ? next.add(c.id) : next.delete(c.id);
                            return next;
                          });
                        }}
                      />
                      <span className="text-[10px]">{c.containerNumber} - {c.route}</span>
                    </label>
                  ))}
                  {containers.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-2">لا توجد حاويات</p>}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* تقرير عام للشحنات */}
          <div className="rounded-xl bg-card p-3 shadow-sm border border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold">تقرير عام</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowFinancials(!showFinancials)} className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
                  {showFinancials ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
                  {showFinancials ? 'إخفاء المالية' : 'عرض المالية'}
                </button>
                <span className="text-[9px] text-muted-foreground">{filteredShipments.length} شحنة</span>
              </div>
            </div>
            <ExportButtons type="shipping-summary" />
          </div>

          {/* تقرير تفصيلي بالحاويات */}
          <div className="rounded-xl bg-card p-3 shadow-sm border border-border">
            <h3 className="text-xs font-bold mb-2">تقارير الحاويات التفصيلية</h3>
            <div className="space-y-2 max-h-[350px] overflow-y-auto scrollbar-hide">
              {containers.map(container => {
                const cShipments = shipments.filter(s => s.containerId === container.id);
                const isExpanded = expandedContainers.has(container.id);
                return (
                  <div key={container.id} className="border border-border rounded-lg overflow-hidden">
                    <button onClick={() => toggleContainer(container.id)} className="w-full flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-primary" />
                        <div className="text-right">
                          <p className="text-[11px] font-bold">{container.containerNumber}</p>
                          <p className="text-[9px] text-muted-foreground">{container.route} • {cShipments.length} شحنة</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-bold", container.profit >= 0 ? "text-income" : "text-expense")}>
                          {fmtC(container.profit)}
                        </span>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="border-t border-border p-2 space-y-2 bg-muted/20">
                        <div className="grid grid-cols-3 gap-1 text-center">
                          <div className="p-1.5 rounded bg-accent"><p className="text-[8px] text-muted-foreground">السعة</p><p className="text-[10px] font-bold">{container.usedCapacity.toFixed(1)}/{container.capacity}</p></div>
                          <div className="p-1.5 rounded bg-income/10"><p className="text-[8px] text-muted-foreground">الإيرادات</p><p className="text-[10px] font-bold text-income">{fmtC(container.totalRevenue)}</p></div>
                          <div className="p-1.5 rounded bg-expense/10"><p className="text-[8px] text-muted-foreground">التكاليف</p><p className="text-[10px] font-bold text-expense">{fmtC(container.totalCost)}</p></div>
                        </div>
                        {cShipments.map(s => (
                          <div key={s.id} className="flex items-center justify-between p-1.5 rounded bg-card text-[10px] cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedShipmentId(s.id); openPreview('shipment-detail'); }}>
                            <div>
                              <p className="font-medium">{s.clientName}</p>
                              <p className="text-[8px] text-muted-foreground">{s.goodsType} • {s.cbm.toFixed(2)} CBM</p>
                            </div>
                            <div className="text-left">
                              <p className="font-bold">{fmtC(s.contractPrice)}</p>
                              <p className={cn("text-[8px]", s.remainingAmount > 0 ? "text-expense" : "text-income")}>
                                {s.remainingAmount > 0 ? `متبقي: ${fmtC(s.remainingAmount)}` : 'مدفوع'}
                              </p>
                            </div>
                          </div>
                        ))}
                        <div className="grid grid-cols-2 gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={() => { setSelectedContainerId(container.id); handleExportPDF('container-detail'); }}>
                            <FileText className="h-3 w-3" /> PDF
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={() => { setSelectedContainerId(container.id); openPreview('container-detail'); }}>
                            <Eye className="h-3 w-3" /> معاينة
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })}
              {containers.length === 0 && <p className="text-center py-6 text-[10px] text-muted-foreground">لا توجد حاويات</p>}
            </div>
          </div>
        </TabsContent>

        {/* =============== تقارير الدفتر المحاسبي =============== */}
        <TabsContent value="ledger" className="space-y-3 mt-3">
          <AccountingLedgerReport />
        </TabsContent>

        {/* =============== تقارير المشاريع =============== */}
        <TabsContent value="projects" className="space-y-3 mt-3">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-3 shadow-sm border border-border">
            <h3 className="text-xs font-bold mb-3">ملخص المشاريع</h3>
            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={BarChart3} label="إجمالي المشاريع" value={(projectStats?.totalProjects || projects.length).toString()} color="text-primary" bg="bg-accent" />
              <StatCard icon={TrendingUp} label="نشطة" value={(projectStats?.activeProjects || projects.filter(p => p.status === 'active').length).toString()} color="text-income" bg="bg-income/10" />
              <StatCard icon={DollarSign} label="الربح المحقق" value={fmtC(projectStats?.realizedProfit || projects.filter(p => p.status === 'completed').reduce((s, p) => s + p.profit, 0))} color="text-income" bg="bg-income/10" />
            </div>
          </motion.div>

          {/* قائمة المشاريع */}
          <div className="rounded-xl bg-card p-3 shadow-sm border border-border">
            <h3 className="text-xs font-bold mb-2">المشاريع</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-hide">
              {projects.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                  <div>
                    <p className="text-[11px] font-bold">{p.name}</p>
                    <p className="text-[9px] text-muted-foreground">{p.clientName || 'بدون عميل'} • {statusLabels[p.status]}</p>
                    <p className="text-[9px] text-muted-foreground">العقد: {fmtC(p.contractValue)} • المصروفات: {fmtC(p.expenses)}</p>
                  </div>
                  <div className="text-left">
                    <p className={cn("text-xs font-bold", p.profit >= 0 ? "text-income" : "text-expense")}>{fmtC(p.profit)}</p>
                    <p className="text-[8px] text-muted-foreground">ربح</p>
                  </div>
                </motion.div>
              ))}
              {projects.length === 0 && <p className="text-center py-6 text-[10px] text-muted-foreground">لا توجد مشاريع</p>}
            </div>
            {/* Totals Row */}
            {projects.length > 0 && (
              <div className="mt-2 pt-2 border-t-2 border-primary/30">
                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="p-1.5 rounded bg-accent">
                    <p className="text-muted-foreground">إجمالي العقود</p>
                    <p className="font-bold text-primary">{fmtC(projects.reduce((s, p) => s + p.contractValue, 0))}</p>
                  </div>
                  <div className="p-1.5 rounded bg-expense/10">
                    <p className="text-muted-foreground">إجمالي المصروفات</p>
                    <p className="font-bold text-expense">{fmtC(projects.reduce((s, p) => s + p.expenses, 0))}</p>
                  </div>
                  <div className="p-1.5 rounded bg-income/10">
                    <p className="text-muted-foreground">إجمالي الأرباح</p>
                    <p className={cn("font-bold", projects.reduce((s, p) => s + p.profit, 0) >= 0 ? "text-income" : "text-expense")}>
                      {fmtC(projects.reduce((s, p) => s + p.profit, 0))}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* أزرار التصدير */}
          <div className="rounded-xl bg-card p-3 shadow-sm border border-border">
            <h3 className="text-xs font-bold mb-2">تصدير تقرير المشاريع</h3>
            <ExportButtons type="projects" />
          </div>
        </TabsContent>

        {/* =============== التقرير العام =============== */}
        <TabsContent value="general" className="space-y-3 mt-3">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-3 shadow-sm border border-border">
            <h3 className="text-xs font-bold mb-3">النظرة الشاملة</h3>
            <div className="grid grid-cols-2 gap-2">
              <StatCard icon={DollarSign} label="إجمالي السيولة" value={fmtC(stats?.totalLiquidity || 0)} color="text-primary" bg="bg-accent" />
              <StatCard icon={TrendingUp} label="صافي الأرباح" value={fmtC(stats?.netCompanyProfit || 0)} color={(stats?.netCompanyProfit || 0) >= 0 ? "text-income" : "text-expense"} bg={(stats?.netCompanyProfit || 0) >= 0 ? "bg-income/10" : "bg-expense/10"} />
              <StatCard icon={ArrowDownCircle} label="المصروفات" value={fmtC(stats?.totalExpenses || 0)} color="text-expense" bg="bg-expense/10" />
              <StatCard icon={AlertTriangle} label="إجمالي مدين" value={fmtC(stats?.totalReceivables || 0)} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/30" />
            </div>
          </motion.div>

          {/* ملخص الأقسام */}
          <div className="rounded-xl bg-card p-3 shadow-sm border border-border">
            <h3 className="text-xs font-bold mb-2">ملخص الأقسام</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2"><Ship className="h-3.5 w-3.5 text-primary" /><span className="text-[11px]">الشحن</span></div>
                <div className="text-left text-[10px]">
                  <span className="text-muted-foreground">{containers.length} حاوية • {shipments.length} شحنة</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5 text-primary" /><span className="text-[11px]">المشاريع</span></div>
                <div className="text-left text-[10px]">
                  <span className="text-muted-foreground">{projects.length} مشروع</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-primary" /><span className="text-[11px]">جهات الاتصال</span></div>
                <div className="text-left text-[10px]">
                  <span className="text-muted-foreground">{contacts.length} جهة</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5 text-primary" /><span className="text-[11px]">الصناديق</span></div>
                <div className="text-left text-[10px]">
                  <span className="text-muted-foreground">{funds.length} صندوق</span>
                </div>
              </div>
            </div>
          </div>

          {/* مشاركة واتساب */}
          <div className="rounded-xl bg-card p-3 shadow-sm border border-border">
            <h3 className="text-xs font-bold mb-2">تصدير ومشاركة</h3>
            <div className="grid grid-cols-2 gap-2">
              <ExportButtons type="general" />
              <Button variant="outline" size="sm" className="gap-1 h-8 text-[10px] col-span-3" onClick={() => {
                const msg = `📊 تقرير توطين المالي\n💰 السيولة: ${fmtC(stats?.totalLiquidity || 0)}\n📈 الأرباح: ${fmtC(stats?.netCompanyProfit || 0)}\n📦 الشحنات: ${shipments.length}\n🏗️ المشاريع: ${projects.length}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
              }}>
                <Share2 className="h-3 w-3" /> مشاركة واتساب
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* =============== سجل نشاط النظام =============== */}
        <TabsContent value="activity" className="space-y-3 mt-3">
          <ActivityLogReport />
        </TabsContent>

        {/* =============== النسخ الاحتياطي =============== */}
        <TabsContent value="backup" className="mt-3">
          <BackupSection onExportData={exportData} onImportData={importData} />
        </TabsContent>
      </Tabs>

      {/* =============== نافذة المعاينة =============== */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-2 sticky top-0 bg-card z-10 border-b border-border">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm">معاينة التقرير</DialogTitle>
              <div className="flex gap-1 items-center">
                {(previewContent === 'shipping-summary' || previewContent === 'container-detail' || previewContent === 'shipment-detail') && (
                  <button onClick={() => setShowFinancials(!showFinancials)} className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border" data-no-print>
                    {showFinancials ? <ToggleRight className="h-3.5 w-3.5 text-primary" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                    {showFinancials ? 'إخفاء المالية' : 'عرض المالية'}
                  </button>
                )}
                {previewContent === 'container-detail' && (
                  <button onClick={() => setShowCostDetails(!showCostDetails)} className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border" data-no-print>
                    {showCostDetails ? <ToggleRight className="h-3.5 w-3.5 text-primary" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                    {showCostDetails ? 'إخفاء التكاليف' : 'تفاصيل التكاليف'}
                  </button>
                )}
                <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={handlePrint} data-no-print>
                  <Printer className="h-3 w-3" /> طباعة
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={handleExportImage}>
                  <Image className="h-3 w-3" /> صورة HD
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={() => previewContent && handleExportPDF(previewContent)}>
                  <FileText className="h-3 w-3" /> PDF
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div ref={previewRef} className="p-4 space-y-4" dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif' }}>
            {/* Header */}
            <div className="bg-[hsl(215,70%,35%)] text-white p-4 rounded-xl text-center">
              <h2 className="text-lg font-bold">توطين - المساعد المالي</h2>
              <p className="text-[10px] opacity-80">{new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            {previewContent === 'shipping-summary' && (
              <>
                <h3 className="text-sm font-bold text-center">ملخص الشحنات</h3>
                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="p-2 rounded-lg bg-accent"><p className="text-muted-foreground">الشحنات</p><p className="font-bold text-sm">{shippingStats.totalShipments}</p></div>
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30"><p className="text-muted-foreground">القطع</p><p className="font-bold text-sm text-blue-600">{shippingStats.totalPieces.toLocaleString()}</p></div>
                  <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30"><p className="text-muted-foreground">الوزن</p><p className="font-bold text-sm text-purple-600">{shippingStats.totalWeight.toLocaleString()} كغ</p></div>
                </div>
                {showFinancials && (
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="p-2 rounded-lg bg-income/10"><p className="text-muted-foreground">الأرباح</p><p className="font-bold text-sm text-income">{fmtC(shippingStats.totalProfit)}</p></div>
                    <div className="p-2 rounded-lg bg-income/5"><p className="text-muted-foreground">المحصل</p><p className="font-bold text-sm text-income">{fmtC(shippingStats.totalCollected)}</p></div>
                    <div className="p-2 rounded-lg bg-expense/10"><p className="text-muted-foreground">المتبقي</p><p className="font-bold text-sm text-expense">{fmtC(shippingStats.totalRemaining)}</p></div>
                  </div>
                )}
                <table className="w-full text-[9px] border-collapse">
                  <thead><tr className="bg-[hsl(215,70%,35%)] text-white">
                    <th className="p-1.5">العميل</th><th className="p-1.5">رقم التتبع</th><th className="p-1.5">البضاعة</th><th className="p-1.5">القطع</th><th className="p-1.5">الوزن</th><th className="p-1.5">CBM</th>
                    {showFinancials && <><th className="p-1.5">المقاولة</th><th className="p-1.5">المتبقي</th></>}
                  </tr></thead>
                  <tbody>
                    {filteredShipments.map((s, i) => (
                      <tr key={s.id} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                        <td className="p-1.5 text-center">{s.clientName}</td>
                        <td className="p-1.5 text-center text-muted-foreground">{s.trackingNumber || '-'}</td>
                        <td className="p-1.5 text-center">{s.goodsType}</td>
                        <td className="p-1.5 text-center">{s.quantity}</td>
                        <td className="p-1.5 text-center">{(s.weight || 0).toLocaleString()}</td>
                        <td className="p-1.5 text-center">{s.cbm.toFixed(2)}</td>
                        {showFinancials && (
                          <>
                            <td className="p-1.5 text-center">{fmtC(s.contractPrice)}</td>
                            <td className={cn("p-1.5 text-center font-bold", s.remainingAmount > 0 ? "text-expense" : "text-income")}>{fmtC(s.remainingAmount)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted font-bold border-t-2 border-primary text-[9px]">
                      <td className="p-1.5 text-center" colSpan={3}>الإجمالي</td>
                      <td className="p-1.5 text-center">{shippingStats.totalPieces.toLocaleString()}</td>
                      <td className="p-1.5 text-center">{shippingStats.totalWeight.toLocaleString()}</td>
                      <td className="p-1.5 text-center">{filteredShipments.reduce((s, sh) => s + sh.cbm, 0).toFixed(2)}</td>
                      {showFinancials && (
                        <>
                          <td className="p-1.5 text-center">{fmtC(filteredShipments.reduce((s, sh) => s + sh.contractPrice, 0))}</td>
                          <td className="p-1.5 text-center text-expense">{fmtC(filteredShipments.reduce((s, sh) => s + sh.remainingAmount, 0))}</td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </>
            )}

            {previewContent === 'container-detail' && selectedContainerId && (() => {
              const c = containers.find(ct => ct.id === selectedContainerId);
              if (!c) return null;
              const cShipments = shipments.filter(s => s.containerId === selectedContainerId);
              const cTotalPieces = cShipments.reduce((s, sh) => s + sh.quantity, 0);
              const cTotalWeight = cShipments.reduce((s, sh) => s + (sh.weight || 0), 0);
              return (
                <>
                  <h3 className="text-sm font-bold text-center">تقرير حاوية: {c.containerNumber}</h3>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">النوع: </span><span className="font-bold">{c.type}</span></div>
                    <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">المسار: </span><span className="font-bold">{c.route}</span></div>
                    <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">السعة: </span><span className="font-bold">{c.usedCapacity.toFixed(1)}/{c.capacity} CBM</span></div>
                    <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">الحالة: </span><span className="font-bold">{statusLabels[c.status]}</span></div>
                    <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/30"><span className="text-muted-foreground">إجمالي القطع: </span><span className="font-bold text-blue-600">{cTotalPieces.toLocaleString()}</span></div>
                    <div className="p-2 rounded bg-purple-50 dark:bg-purple-950/30"><span className="text-muted-foreground">إجمالي الوزن: </span><span className="font-bold text-purple-600">{cTotalWeight.toLocaleString()} كغ</span></div>
                  </div>
                  {showFinancials && (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                        <div className="p-2 rounded bg-income/10"><p className="text-muted-foreground">الإيرادات</p><p className="font-bold text-income">{fmtC(c.totalRevenue)}</p></div>
                        <div className="p-2 rounded bg-expense/10"><p className="text-muted-foreground">التكاليف</p><p className="font-bold text-expense">{fmtC(c.totalCost)}</p></div>
                        <div className="p-2 rounded bg-accent"><p className="text-muted-foreground">الربح</p><p className={cn("font-bold", c.profit >= 0 ? "text-income" : "text-expense")}>{fmtC(c.profit)}</p></div>
                      </div>
                      {showCostDetails && (() => {
                        const extras = extraExpensesByContainer[c.id] || [];
                        const baseRows: { label: string; amount: number }[] = [];
                        if ((c.containerPrice ?? 0) > 0) baseRows.push({ label: 'سعر الحاوية', amount: c.containerPrice ?? 0 });
                        if (c.shippingCost > 0) baseRows.push({ label: 'تكلفة الشحن', amount: c.shippingCost });
                        if (c.customsCost > 0) baseRows.push({ label: 'الجمارك', amount: c.customsCost });
                        if (c.portCost > 0) baseRows.push({ label: 'رسوم الميناء', amount: c.portCost });
                        if ((c.glassFees ?? 0) > 0) baseRows.push({ label: 'رسوم الزجاج', amount: c.glassFees ?? 0 });
                        if (c.otherCosts > 0) baseRows.push({ label: 'تكاليف أخرى', amount: c.otherCosts });
                        const baseTotal = baseRows.reduce((s, r) => s + r.amount, 0);
                        const extrasTotal = extras.reduce((s, e) => s + e.amount, 0);
                        return (
                          <div className="space-y-2 border border-border rounded-lg p-2 bg-muted/20">
                            <div className="text-[10px] font-bold text-center text-foreground border-b border-border pb-1">تفاصيل التكاليف</div>
                            {baseRows.length > 0 && (
                              <div className="rounded border border-border overflow-hidden">
                                <div className="bg-muted/50 px-2 py-1 text-[9px] font-semibold">التكاليف الأساسية</div>
                                <table className="w-full text-[10px]">
                                  <tbody>
                                    {baseRows.map((r, i) => (
                                      <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                                        <td className="p-1 text-muted-foreground">{r.label}</td>
                                        <td className="p-1 text-left font-medium">{fmtC(r.amount)}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-muted/40 border-t border-border font-semibold">
                                      <td className="p-1">مجموع الأساسية</td>
                                      <td className="p-1 text-left">{fmtC(baseTotal)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {extras.length > 0 && (
                              <div className="rounded border border-border overflow-hidden">
                                <div className="bg-muted/50 px-2 py-1 text-[9px] font-semibold">المصاريف الإضافية</div>
                                <table className="w-full text-[10px]">
                                  <tbody>
                                    {extras.map((e, i) => (
                                      <tr key={e.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                                        <td className="p-1 text-muted-foreground">
                                          {e.description}
                                          <span className="text-[8px] text-muted-foreground/70 mr-1">({new Date(e.date).toLocaleDateString('en-GB')})</span>
                                        </td>
                                        <td className="p-1 text-left font-medium text-expense">{fmtC(e.amount)}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-muted/40 border-t border-border font-semibold">
                                      <td className="p-1">مجموع الإضافية</td>
                                      <td className="p-1 text-left text-expense">{fmtC(extrasTotal)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <div className="rounded bg-expense/10 border border-expense/30 p-2 flex items-center justify-between">
                              <span className="font-bold text-[10px]">الإجمالي النهائي</span>
                              <span className="font-bold text-[11px] text-expense">{fmtC(c.totalCost)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                  {cShipments.length > 0 && (
                    <table className="w-full text-[9px] border-collapse">
                      <thead><tr className="bg-[hsl(215,70%,35%)] text-white">
                        <th className="p-1.5">العميل</th><th className="p-1.5">الهاتف</th><th className="p-1.5">رقم التتبع</th><th className="p-1.5">البضاعة</th><th className="p-1.5">القطع</th><th className="p-1.5">الوزن</th><th className="p-1.5">CBM</th>
                        {showFinancials && <><th className="p-1.5">المقاولة</th><th className="p-1.5">المتبقي</th></>}
                      </tr></thead>
                      <tbody>
                        {cShipments.map((s, i) => {
                          const clientPhone = s.clientId ? contacts.find(ct => ct.id === s.clientId)?.phone : undefined;
                          return (
                          <tr key={s.id} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                            <td className="p-1.5 text-center">{s.clientName}</td>
                            <td className="p-1.5 text-center text-muted-foreground" dir="ltr">{clientPhone || '-'}</td>
                            <td className="p-1.5 text-center text-muted-foreground">{s.trackingNumber || '-'}</td>
                            <td className="p-1.5 text-center">{s.goodsType}</td>
                            <td className="p-1.5 text-center">{s.quantity}</td>
                            <td className="p-1.5 text-center">{(s.weight || 0).toLocaleString()}</td>
                            <td className="p-1.5 text-center">{s.cbm.toFixed(2)}</td>
                            {showFinancials && (
                              <>
                                <td className="p-1.5 text-center">{fmtC(s.contractPrice)}</td>
                                <td className={cn("p-1.5 text-center font-bold", s.remainingAmount > 0 ? "text-expense" : "text-income")}>{fmtC(s.remainingAmount)}</td>
                              </>
                            )}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              );
            })()}

            {previewContent === 'shipment-detail' && selectedShipmentId && (() => {
              const s = shipments.find(sh => sh.id === selectedShipmentId);
              if (!s) return null;
              const c = containers.find(ct => ct.id === s.containerId);
              return (
                <>
                  <h3 className="text-sm font-bold text-center">تفاصيل شحنة: {s.clientName}</h3>
                  <div className="space-y-2 text-[10px]">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">العميل: </span><span className="font-bold">{s.clientName}</span></div>
                      <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">البضاعة: </span><span className="font-bold">{s.goodsType}</span></div>
                      <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">الحاوية: </span><span className="font-bold">{c?.containerNumber || '-'}</span></div>
                      <div className="p-2 rounded bg-muted/30"><span className="text-muted-foreground">رقم التتبع: </span><span className="font-bold">{s.trackingNumber || '-'}</span></div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="p-2 rounded bg-muted/30 text-center"><p className="text-muted-foreground">الأبعاد</p><p className="font-bold">{s.length}×{s.width}×{s.height} م</p></div>
                      <div className="p-2 rounded bg-muted/30 text-center"><p className="text-muted-foreground">الحجم</p><p className="font-bold">{s.cbm.toFixed(2)} CBM</p></div>
                      <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/30 text-center"><p className="text-muted-foreground">الكمية</p><p className="font-bold text-blue-600">{s.quantity}</p></div>
                      <div className="p-2 rounded bg-purple-50 dark:bg-purple-950/30 text-center"><p className="text-muted-foreground">الوزن</p><p className="font-bold text-purple-600">{(s.weight || 0).toLocaleString()} كغ</p></div>
                    </div>
                    {showFinancials && (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="p-2 rounded bg-accent"><p className="text-muted-foreground">المقاولة</p><p className="font-bold text-primary">{fmtC(s.contractPrice)}</p></div>
                          <div className="p-2 rounded bg-income/10"><p className="text-muted-foreground">المدفوع</p><p className="font-bold text-income">{fmtC(s.amountPaid)}</p></div>
                          <div className="p-2 rounded bg-expense/10"><p className="text-muted-foreground">المتبقي</p><p className={cn("font-bold", s.remainingAmount > 0 ? "text-expense" : "text-income")}>{fmtC(s.remainingAmount)}</p></div>
                        </div>
                        <div className="text-center p-2 rounded-lg" style={{ backgroundColor: s.paymentStatus === 'paid' ? 'hsl(145,65%,42%,0.15)' : s.paymentStatus === 'partial' ? 'hsl(45,93%,47%,0.15)' : 'hsl(0,72%,51%,0.15)' }}>
                          <p className={cn("font-bold text-xs", s.paymentStatus === 'paid' ? 'text-income' : s.paymentStatus === 'partial' ? 'text-amber-600' : 'text-expense')}>
                            {statusLabels[s.paymentStatus]}
                          </p>
                        </div>
                      </>
                    )}
                    {showFinancials && s.payments && s.payments.length > 0 && (
                      <div>
                        <p className="font-bold text-[11px] mb-1">سجل الدفعات:</p>
                        {s.payments.map((p, i) => (
                          <div key={p.id} className="flex justify-between p-1.5 rounded bg-muted/20 text-[9px]">
                            <span>{new Date(p.date).toLocaleDateString('ar-SA')}</span>
                            <span className="font-bold text-income">{fmtC(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {previewContent === 'projects' && (
              <>
                <h3 className="text-sm font-bold text-center">تقرير المشاريع</h3>
                <table className="w-full text-[9px] border-collapse">
                  <thead><tr className="bg-[hsl(215,70%,35%)] text-white"><th className="p-1.5">المشروع</th><th className="p-1.5">الحالة</th><th className="p-1.5">العقد</th><th className="p-1.5">المصروفات</th><th className="p-1.5">الربح</th></tr></thead>
                  <tbody>
                    {projects.map((p, i) => (
                      <tr key={p.id} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                        <td className="p-1.5 text-center">{p.name}</td>
                        <td className="p-1.5 text-center">{statusLabels[p.status]}</td>
                        <td className="p-1.5 text-center">{fmtC(p.contractValue)}</td>
                        <td className="p-1.5 text-center text-expense">{fmtC(p.expenses)}</td>
                        <td className={cn("p-1.5 text-center font-bold", p.profit >= 0 ? "text-income" : "text-expense")}>{fmtC(p.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {projects.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted font-bold border-t-2 border-primary">
                        <td className="p-1.5 text-center" colSpan={2}>الإجمالي</td>
                        <td className="p-1.5 text-center">{fmtC(projects.reduce((s, p) => s + p.contractValue, 0))}</td>
                        <td className="p-1.5 text-center text-expense">{fmtC(projects.reduce((s, p) => s + p.expenses, 0))}</td>
                        <td className={cn("p-1.5 text-center", projects.reduce((s, p) => s + p.profit, 0) >= 0 ? "text-income" : "text-expense")}>
                          {fmtC(projects.reduce((s, p) => s + p.profit, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </>
            )}

            {previewContent === 'general' && (
              <>
                <h3 className="text-sm font-bold text-center">التقرير العام</h3>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-center">
                  <div className="p-2 rounded bg-accent"><p className="text-muted-foreground">السيولة</p><p className="font-bold text-primary">{fmtC(stats?.totalLiquidity || 0)}</p></div>
                  <div className="p-2 rounded bg-income/10"><p className="text-muted-foreground">الأرباح</p><p className="font-bold text-income">{fmtC(stats?.netCompanyProfit || 0)}</p></div>
                  <div className="p-2 rounded bg-expense/10"><p className="text-muted-foreground">المصروفات</p><p className="font-bold text-expense">{fmtC(stats?.totalExpenses || 0)}</p></div>
                  <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30"><p className="text-muted-foreground">إجمالي مدين</p><p className="font-bold text-amber-600">{fmtC(stats?.totalReceivables || 0)}</p></div>
                </div>
                <div className="text-[10px] space-y-1">
                  <div className="flex justify-between p-1.5 rounded bg-muted/30"><span>الحاويات</span><span className="font-bold">{containers.length}</span></div>
                  <div className="flex justify-between p-1.5 rounded bg-muted/30"><span>الشحنات</span><span className="font-bold">{shipments.length}</span></div>
                  <div className="flex justify-between p-1.5 rounded bg-muted/30"><span>المشاريع</span><span className="font-bold">{projects.length}</span></div>
                  <div className="flex justify-between p-1.5 rounded bg-muted/30"><span>الصناديق</span><span className="font-bold">{funds.length}</span></div>
                </div>
              </>
            )}

            {/* Footer */}
            <div className="text-center text-[8px] text-muted-foreground border-t border-border pt-2">
              توطين © {new Date().getFullYear()} - جميع الحقوق محفوظة
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Costs Detail Dialog */}
      <Dialog open={!!costsDialogContainerId} onOpenChange={(open) => !open && setCostsDialogContainerId(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">تفاصيل تكاليف الحاوية</DialogTitle>
          </DialogHeader>
          {(() => {
            const c = containers.find(ct => ct.id === costsDialogContainerId);
            if (!c) return null;
            const extras = extraExpensesByContainer[c.id] || [];
            const baseRows: { label: string; amount: number }[] = [];
            if ((c.containerPrice ?? 0) > 0) baseRows.push({ label: 'سعر الحاوية', amount: c.containerPrice ?? 0 });
            if (c.shippingCost > 0) baseRows.push({ label: 'تكلفة الشحن', amount: c.shippingCost });
            if (c.customsCost > 0) baseRows.push({ label: 'الجمارك', amount: c.customsCost });
            if (c.portCost > 0) baseRows.push({ label: 'رسوم الميناء', amount: c.portCost });
            if ((c.glassFees ?? 0) > 0) baseRows.push({ label: 'رسوم الزجاج', amount: c.glassFees ?? 0 });
            if (c.otherCosts > 0) baseRows.push({ label: 'تكاليف أخرى', amount: c.otherCosts });
            const baseTotal = baseRows.reduce((s, r) => s + r.amount, 0);
            const extrasTotal = extras.reduce((s, e) => s + e.amount, 0);
            return (
              <div className="space-y-3 text-[11px]">
                <div className="text-center text-muted-foreground text-[10px]">
                  حاوية: <span className="font-bold text-foreground">{c.containerNumber}</span>
                </div>

                {/* Base costs */}
                <div className="rounded border border-border overflow-hidden">
                  <div className="bg-muted/50 px-2 py-1.5 text-[10px] font-semibold">التكاليف الأساسية</div>
                  {baseRows.length === 0 ? (
                    <div className="p-2 text-center text-muted-foreground text-[10px]">لا توجد تكاليف أساسية</div>
                  ) : (
                    <table className="w-full">
                      <tbody>
                        {baseRows.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                            <td className="p-1.5 text-muted-foreground">{r.label}</td>
                            <td className="p-1.5 text-left font-medium">{fmtC(r.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/40 border-t border-border font-semibold">
                          <td className="p-1.5">مجموع التكاليف الأساسية</td>
                          <td className="p-1.5 text-left">{fmtC(baseTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Extra expenses */}
                <div className="rounded border border-border overflow-hidden">
                  <div className="bg-muted/50 px-2 py-1.5 text-[10px] font-semibold">المصاريف الإضافية</div>
                  {extras.length === 0 ? (
                    <div className="p-2 text-center text-muted-foreground text-[10px]">لا توجد مصاريف إضافية</div>
                  ) : (
                    <table className="w-full">
                      <tbody>
                        {extras.map((e, i) => (
                          <tr key={e.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                            <td className="p-1.5 text-muted-foreground">
                              {e.description}
                              <span className="text-[9px] text-muted-foreground/70 mr-1">({new Date(e.date).toLocaleDateString('en-GB')})</span>
                            </td>
                            <td className="p-1.5 text-left font-medium text-expense">{fmtC(e.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/40 border-t border-border font-semibold">
                          <td className="p-1.5">مجموع المصاريف الإضافية</td>
                          <td className="p-1.5 text-left text-expense">{fmtC(extrasTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Final total */}
                <div className="rounded-lg bg-expense/10 border border-expense/30 p-3 flex items-center justify-between">
                  <span className="font-bold text-xs">الإجمالي النهائي للتكاليف</span>
                  <span className="font-bold text-sm text-expense">{fmtC(c.totalCost)}</span>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

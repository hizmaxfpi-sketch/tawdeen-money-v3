import { useMemo, useState } from 'react';
import {
  Printer, FileText, FileSpreadsheet, Plus, Wallet, Eye, EyeOff,
  Phone, Copy, Hash, Package, Weight, Box, MapPin, Calendar, Truck,
  ChevronDown, ChevronUp, MessageCircle, DollarSign, Layers,
  CheckCircle2, Receipt, Loader2, MoreHorizontal, FileBox, Activity,
  LayoutGrid,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import type { Container, Shipment, AccountOption, Fund } from '@/types/finance';

// ============================================================
// TYPES
// ============================================================
export type ViewMode = 'full' | 'financial' | 'operational' | 'public';

interface ContactInfo {
  id: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
}

interface Props {
  container: Container | null;
  shipments: Shipment[];
  contacts: AccountOption[];
  contactsFull?: ContactInfo[]; // optional richer contact info (with phone)
  funds: Fund[];
  fmt: (v: number) => string;
  onClose: () => void;
  onReceivePayment?: (shipmentId: string, amount: number, fundId: string, note?: string) => Promise<void> | void;
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
export function ContainerDetailDialog({
  container, shipments, contacts, contactsFull = [], funds, fmt,
  onClose, onReceivePayment, onRefresh,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const [paymentShipment, setPaymentShipment] = useState<Shipment | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expandedShipment, setExpandedShipment] = useState<string | null>(null);

  // Aggregate operational stats from shipments (must run before any early return)
  const ops = useMemo(() => {
    const totalPieces = shipments.reduce((s, sh) => s + (sh.quantity || 0), 0);
    const totalWeight = shipments.reduce((s, sh) => s + (sh.weight || 0), 0);
    const totalCBM = shipments.reduce((s, sh) => s + sh.cbm, 0);
    const totalRevenue = shipments.reduce((s, sh) => s + sh.contractPrice, 0);
    const totalCollected = shipments.reduce((s, sh) => s + sh.amountPaid, 0);
    const totalOutstanding = shipments.reduce((s, sh) => s + sh.remainingAmount, 0);
    const uniqueClients = new Set(shipments.map(s => s.clientId || s.clientName)).size;
    return { totalPieces, totalWeight, totalCBM, totalRevenue, totalCollected, totalOutstanding, uniqueClients };
  }, [shipments]);

  if (!container) return null;

  const showFinance = viewMode === 'full' || viewMode === 'financial';
  const showOperational = viewMode !== 'financial'; // financial mode focuses on money

  const fillRate = container.capacity > 0 ? (container.usedCapacity / container.capacity) * 100 : 0;
  const remainingCap = Math.max(0, container.capacity - container.usedCapacity);

  // Lookup helper for contact info (phone)
  const getContactInfo = (clientId?: string, fallbackName?: string): ContactInfo | null => {
    if (clientId) {
      const found = contactsFull.find(c => c.id === clientId);
      if (found) return found;
    }
    return fallbackName ? { id: clientId || '', name: fallbackName } : null;
  };

  // ============================================================
  // ACTIONS
  // ============================================================
  const copyText = (text: string, label = 'النص') => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  const callPhone = (phone: string) => {
    window.location.href = `tel:${phone.replace(/\s/g, '')}`;
  };

  const whatsapp = (phone: string) => {
    const clean = phone.replace(/[^\d]/g, '');
    window.open(`https://wa.me/${clean}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  // ============================================================
  // EXPORTS (respect view mode)
  // ============================================================
  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const autoTableMod = await import('jspdf-autotable');
    const autoTable = autoTableMod.default || (autoTableMod as any).autoTable || autoTableMod;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(25, 65, 120);
    doc.rect(0, 0, pw, 28, 'F');
    doc.setTextColor(255);
    doc.setFontSize(14);
    doc.text(`Container ${container.containerNumber}`, pw / 2, 12, { align: 'center' });
    doc.setFontSize(9);
    const modeLabel = viewMode === 'full' ? 'Full Report' : viewMode === 'financial' ? 'Financial Report' : viewMode === 'operational' ? 'Operational Report' : 'Public Report';
    doc.text(`${modeLabel} | ${new Date().toLocaleDateString('en-GB')}`, pw / 2, 20, { align: 'center' });
    doc.setTextColor(0);

    // Container info
    const baseInfo: [string, string][] = [
      ['Container No.', container.containerNumber],
      ['Type', container.type],
      ['Route', container.route],
      ['Status', STATUS_LABELS[container.status] || container.status],
      ['Capacity (CBM)', `${container.usedCapacity.toFixed(2)} / ${container.capacity}`],
      ['Fill Rate', `${fillRate.toFixed(1)}%`],
      ['Shipments', String(shipments.length)],
      ['Total Pieces', String(ops.totalPieces)],
      ['Total CBM', ops.totalCBM.toFixed(2)],
      ['Total Weight (kg)', ops.totalWeight.toLocaleString()],
    ];
    if (container.departureDate) baseInfo.push(['Departure', container.departureDate]);
    if (container.arrivalDate) baseInfo.push(['Arrival', container.arrivalDate]);

    autoTable(doc, {
      startY: 35,
      head: [['Field', 'Value']],
      body: baseInfo,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [25, 65, 120] },
      margin: { left: 12, right: 12 },
    });
    let y = (doc as any).lastAutoTable.finalY + 6;

    // Financial section
    if (showFinance) {
      autoTable(doc, {
        startY: y,
        head: [['Financial', 'Amount']],
        body: [
          ['Total Revenue', fmt(container.totalRevenue)],
          ['Total Cost', fmt(container.totalCost)],
          ['Net Profit', fmt(container.profit)],
          ['Collected', fmt(ops.totalCollected)],
          ['Outstanding', fmt(ops.totalOutstanding)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [22, 110, 60] },
        margin: { left: 12, right: 12 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Shipments table — columns depend on mode
    if (shipments.length > 0) {
      const head: string[] =
        viewMode === 'public' || viewMode === 'operational'
          ? ['#', 'Customer', 'Phone', 'Tracking', 'Goods', 'Qty', 'Weight', 'CBM', 'Status']
          : viewMode === 'financial'
          ? ['#', 'Customer', 'Goods', 'CBM', 'Revenue', 'Paid', 'Outstanding', 'Pay Status']
          : ['#', 'Customer', 'Phone', 'Tracking', 'Goods', 'Qty', 'CBM', 'Revenue', 'Paid', 'Outstanding', 'Pay Status'];

      const body = shipments.map((s, i) => {
        const info = getContactInfo(s.clientId, s.clientName);
        const phone = info?.phone || '-';
        const tracking = s.trackingNumber || (s as any).manualCargoCode || '-';
        if (viewMode === 'public' || viewMode === 'operational') {
          return [
            String(i + 1),
            s.clientName,
            phone,
            tracking,
            s.goodsType,
            String(s.quantity || 0),
            `${(s.weight || 0).toLocaleString()} kg`,
            s.cbm.toFixed(2),
            STATUS_LABELS[container.status] || '-',
          ];
        }
        if (viewMode === 'financial') {
          return [
            String(i + 1), s.clientName, s.goodsType, s.cbm.toFixed(2),
            fmt(s.contractPrice), fmt(s.amountPaid), fmt(s.remainingAmount),
            STATUS_LABELS[s.paymentStatus],
          ];
        }
        return [
          String(i + 1), s.clientName, phone, tracking, s.goodsType,
          String(s.quantity || 0), s.cbm.toFixed(2),
          fmt(s.contractPrice), fmt(s.amountPaid), fmt(s.remainingAmount),
          STATUS_LABELS[s.paymentStatus],
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [head],
        body,
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [80, 80, 110] },
        margin: { left: 6, right: 6 },
      });
    }

    doc.save(`Container_${container.containerNumber}_${viewMode}_${Date.now()}.pdf`);
    toast.success('تم تصدير PDF');
  };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const info: any[] = [
      { Field: 'Container', Value: container.containerNumber },
      { Field: 'Type', Value: container.type },
      { Field: 'Route', Value: container.route },
      { Field: 'Status', Value: STATUS_LABELS[container.status] },
      { Field: 'Capacity', Value: `${container.usedCapacity}/${container.capacity}` },
      { Field: 'Fill Rate', Value: `${fillRate.toFixed(1)}%` },
      { Field: 'Shipments', Value: shipments.length },
      { Field: 'Pieces', Value: ops.totalPieces },
      { Field: 'CBM', Value: ops.totalCBM.toFixed(2) },
      { Field: 'Weight (kg)', Value: ops.totalWeight },
    ];
    if (showFinance) {
      info.push(
        { Field: 'Revenue', Value: container.totalRevenue },
        { Field: 'Cost', Value: container.totalCost },
        { Field: 'Profit', Value: container.profit },
        { Field: 'Collected', Value: ops.totalCollected },
        { Field: 'Outstanding', Value: ops.totalOutstanding },
      );
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), 'Container Info');

    const shipmentsData = shipments.map(s => {
      const info = getContactInfo(s.clientId, s.clientName);
      const row: any = {
        Customer: s.clientName,
        Phone: info?.phone || '',
        Tracking: s.trackingNumber || (s as any).manualCargoCode || '',
        Goods: s.goodsType,
        Quantity: s.quantity,
        Weight_kg: s.weight || 0,
        CBM: s.cbm,
      };
      if (showFinance) {
        row.Revenue = s.contractPrice;
        row.Paid = s.amountPaid;
        row.Outstanding = s.remainingAmount;
        row.Status = STATUS_LABELS[s.paymentStatus];
      }
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shipmentsData), 'Shipments');

    XLSX.writeFile(wb, `Container_${container.containerNumber}_${viewMode}.xlsx`);
    toast.success('تم تصدير Excel');
  };

  // ============================================================
  // RENDER
  // ============================================================
  const ModeIcon = viewMode === 'financial' ? DollarSign : viewMode === 'operational' ? Truck : viewMode === 'public' ? EyeOff : Eye;
  const modeLabel = viewMode === 'full' ? 'كامل' : viewMode === 'financial' ? 'مالي' : viewMode === 'operational' ? 'تشغيلي' : 'عام';

  return (
    <>
      <Dialog open={!!container} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
          {/* ========== COMPACT HEADER (always visible) ========== */}
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-border bg-card/50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Package className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-sm font-bold truncate">
                    {container.containerNumber}
                  </DialogTitle>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5" />
                      {container.route}
                    </span>
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded-full text-[9px] border font-semibold', STATUS_COLORS[container.status])}>
                      {STATUS_LABELS[container.status]}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Compact summary chips */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-3">
              <SummaryChip label="السعة" value={`${container.usedCapacity.toFixed(1)}/${container.capacity}`} />
              <SummaryChip label="الإشغال" value={`${fillRate.toFixed(0)}%`} accent={fillRate > 90 ? 'red' : 'green'} />
              <SummaryChip label="الشحنات" value={String(shipments.length)} />
              <SummaryChip label="القطع" value={ops.totalPieces.toLocaleString()} />
              <SummaryChip label="CBM" value={ops.totalCBM.toFixed(1)} />
              {showFinance ? (
                <SummaryChip label="الربح" value={fmt(container.profit)} accent={container.profit >= 0 ? 'green' : 'red'} />
              ) : (
                <SummaryChip label="الوزن" value={`${(ops.totalWeight / 1000).toFixed(1)}t`} />
              )}
            </div>
          </DialogHeader>

          {/* ========== TABS ========== */}
          <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-border bg-background sticky top-0 z-10 px-2">
              <TabsList className="h-9 w-full justify-start gap-0.5 bg-transparent p-0 overflow-x-auto">
                <TabsTrigger value="overview" className="text-[11px] gap-1 h-8 data-[state=active]:bg-muted">
                  <LayoutGrid className="h-3 w-3" /> نظرة عامة
                </TabsTrigger>
                <TabsTrigger value="shipments" className="text-[11px] gap-1 h-8 data-[state=active]:bg-muted">
                  <Package className="h-3 w-3" /> الشحنات ({shipments.length})
                </TabsTrigger>
                {showFinance && (
                  <TabsTrigger value="finance" className="text-[11px] gap-1 h-8 data-[state=active]:bg-muted">
                    <DollarSign className="h-3 w-3" /> المالية
                  </TabsTrigger>
                )}
                <TabsTrigger value="documents" className="text-[11px] gap-1 h-8 data-[state=active]:bg-muted">
                  <FileBox className="h-3 w-3" /> المستندات
                </TabsTrigger>
                <TabsTrigger value="activity" className="text-[11px] gap-1 h-8 data-[state=active]:bg-muted">
                  <Activity className="h-3 w-3" /> النشاط
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {/* ========== OVERVIEW TAB ========== */}
              <TabsContent value="overview" className="mt-0 space-y-2.5">
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-primary" /> معلومات اللوجستيات
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <InfoTile icon={Box} label="نسبة الإشغال" value={`${fillRate.toFixed(0)}%`} sub={`متبقي ${remainingCap.toFixed(1)}`} color={fillRate > 90 ? 'red' : 'green'} />
                      <InfoTile icon={Layers} label="العملاء" value={String(ops.uniqueClients)} sub="عميل" color="purple" />
                      <InfoTile icon={Weight} label="الوزن" value={`${ops.totalWeight.toLocaleString()}`} sub="كجم" color="purple" />
                      <InfoTile icon={Hash} label="القطع" value={ops.totalPieces.toLocaleString()} sub={`${ops.totalCBM.toFixed(1)} CBM`} color="blue" />
                      <InfoTile icon={MapPin} label="من" value={container.originCountry || '-'} sub={container.destinationCountry ? `إلى ${container.destinationCountry}` : ''} color="cyan" />
                      <InfoTile icon={Calendar} label="مغادرة" value={container.departureDate || '-'} sub={container.arrivalDate ? `وصول ${container.arrivalDate}` : ''} color="blue" />
                      <InfoTile icon={Truck} label="النوع" value={container.type} sub={container.clearanceDate ? `تخليص ${container.clearanceDate}` : ''} color="amber" />
                      <InfoTile icon={Package} label="السعة الكلية" value={`${container.capacity}`} sub="CBM" color="cyan" />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {container.notes && (
                  <Collapsible defaultOpen>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                      <span className="text-xs font-bold">ملاحظات الحاوية</span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="p-2.5 rounded-lg bg-muted/30 border border-border">
                        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{container.notes}</p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </TabsContent>

              {/* ========== SHIPMENTS TAB ========== */}
              <TabsContent value="shipments" className="mt-0">
                {shipments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    لا توجد شحنات في هذه الحاوية
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {shipments.map((s, idx) => {
                      const info = getContactInfo(s.clientId, s.clientName);
                      const expanded = expandedShipment === s.id;
                      return (
                        <div key={s.id} className="rounded-lg border border-border bg-card overflow-hidden">
                          <button
                            onClick={() => setExpandedShipment(expanded ? null : s.id)}
                            className="w-full p-2.5 text-right hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <div className="h-6 w-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                  {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0 text-right">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold truncate">{s.clientName}</span>
                                    <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[9px] border', STATUS_COLORS[s.paymentStatus])}>
                                      {STATUS_LABELS[s.paymentStatus]}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {s.goodsType} • {s.quantity || 0} قطعة • {s.cbm.toFixed(2)} CBM
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {showFinance && (
                                  <span className="text-[10px] font-bold text-green-600 tabular-nums">
                                    {fmt(s.contractPrice)}
                                  </span>
                                )}
                                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </div>
                            </div>
                          </button>

                          {expanded && (
                            <div className="border-t border-border bg-muted/10 p-2.5 space-y-2">
                              {showOperational && (
                                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                  <DetailRow label="رقم التتبع" value={s.trackingNumber || '-'} copyable />
                                  <DetailRow label="كود البضاعة" value={(s as any).manualCargoCode || '-'} copyable />
                                  <DetailRow label="الباكج" value={(s as any).packageNumber || '-'} copyable />
                                  <DetailRow label="الأبعاد" value={`${s.length}×${s.width}×${s.height}`} />
                                  <DetailRow label="الكمية" value={String(s.quantity || 0)} />
                                  <DetailRow label="الوزن" value={`${(s.weight || 0).toLocaleString()} كغ`} />
                                  <DetailRow label="CBM" value={s.cbm.toFixed(3)} />
                                  <DetailRow label="تاريخ الإنشاء" value={new Date(s.createdAt).toLocaleDateString('en-GB')} />
                                </div>
                              )}

                              {info?.phone && (
                                <div className="flex items-center gap-1.5 text-[10px] p-1.5 rounded bg-background border border-border">
                                  <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="font-medium tabular-nums flex-1 truncate">{info.phone}</span>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); copyText(info.phone!, 'الهاتف'); }}>
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); callPhone(info.phone!); }}>
                                    <Phone className="h-3 w-3 text-blue-600" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); whatsapp(info.phone!); }}>
                                    <MessageCircle className="h-3 w-3 text-green-600" />
                                  </Button>
                                </div>
                              )}

                              {showFinance && (
                                <div className="grid grid-cols-3 gap-1.5">
                                  <MiniStat label="الإيراد" value={fmt(s.contractPrice)} tone="blue" />
                                  <MiniStat label="المحصل" value={fmt(s.amountPaid)} tone="green" />
                                  <MiniStat label="المتبقي" value={fmt(s.remainingAmount)} tone="red" />
                                </div>
                              )}

                              {s.notes && (
                                <div className="text-[10px] p-1.5 rounded bg-background border border-border">
                                  <span className="text-muted-foreground">ملاحظات: </span>
                                  <span>{s.notes}</span>
                                </div>
                              )}

                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {s.trackingNumber && (
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => copyText(s.trackingNumber!, 'رقم التتبع')}>
                                    <Copy className="h-3 w-3" /> نسخ التتبع
                                  </Button>
                                )}
                                {showFinance && onReceivePayment && s.remainingAmount > 0 && (
                                  <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => setPaymentShipment(s)}>
                                    <Wallet className="h-3 w-3" /> استلام دفعة
                                  </Button>
                                )}
                                {info?.phone && (
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => whatsapp(info.phone!)}>
                                    <MessageCircle className="h-3 w-3 text-green-600" /> واتساب
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ========== FINANCE TAB ========== */}
              {showFinance && (
                <TabsContent value="finance" className="mt-0 space-y-2.5">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <h3 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-green-600" /> الأداء المالي
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      <FinTile label="الإيراد" value={fmt(container.totalRevenue)} tone="blue" />
                      <FinTile label="التكلفة" value={fmt(container.totalCost)} tone="red" />
                      <FinTile label="الربح" value={fmt(container.profit)} tone={container.profit >= 0 ? 'green' : 'red'} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <FinTile label="المحصل" value={fmt(ops.totalCollected)} tone="green" small />
                      <FinTile label="المتبقي" value={fmt(ops.totalOutstanding)} tone="amber" small />
                    </div>
                  </div>

                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                      <span className="text-xs font-bold">تفصيل التكاليف</span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="p-2.5 rounded-lg border border-border bg-card space-y-1 text-[11px]">
                        {(container.containerPrice || 0) > 0 && <CostRow label="سعر الحاوية" value={fmt(container.containerPrice || 0)} />}
                        {container.shippingCost > 0 && <CostRow label="الشحن" value={fmt(container.shippingCost)} />}
                        {container.customsCost > 0 && <CostRow label="الجمارك" value={fmt(container.customsCost)} />}
                        {container.portCost > 0 && <CostRow label="الميناء" value={fmt(container.portCost)} />}
                        {(container.glassFees || 0) > 0 && <CostRow label="رسوم الزجاج" value={fmt(container.glassFees || 0)} />}
                        {container.otherCosts > 0 && <CostRow label="أخرى" value={fmt(container.otherCosts)} />}
                        <div className="border-t border-border pt-1 mt-1">
                          <CostRow label="الإجمالي" value={fmt(container.totalCost)} bold />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </TabsContent>
              )}

              {/* ========== DOCUMENTS TAB ========== */}
              <TabsContent value="documents" className="mt-0">
                {(container.attachments && container.attachments.length > 0) ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {container.attachments.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="p-2 rounded-lg border border-border bg-card hover:bg-muted/30 flex items-center gap-2 text-[11px]">
                        <FileBox className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">مستند {i + 1}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    لا توجد مستندات مرفقة
                  </div>
                )}
              </TabsContent>

              {/* ========== ACTIVITY TAB ========== */}
              <TabsContent value="activity" className="mt-0 space-y-1.5">
                <ActivityRow label="إنشاء الحاوية" date={new Date(container.createdAt).toLocaleString('en-GB')} />
                {container.departureDate && <ActivityRow label="مغادرة" date={container.departureDate} />}
                {container.arrivalDate && <ActivityRow label="الوصول" date={container.arrivalDate} />}
                {container.clearanceDate && <ActivityRow label="التخليص" date={container.clearanceDate} />}
                <ActivityRow label="آخر تحديث" date={new Date(container.updatedAt).toLocaleString('en-GB')} />
              </TabsContent>
            </div>
          </Tabs>

          {/* ========== STICKY ACTION BAR ========== */}
          <div className="border-t border-border bg-card/80 backdrop-blur px-3 py-2 flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1 flex-1 sm:flex-initial" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" /> طباعة
            </Button>

            {/* Finance Toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1">
                  <ModeIcon className="h-3.5 w-3.5" /> {modeLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-[11px]">وضع العرض</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setViewMode('full')} className="text-xs gap-2"><Eye className="h-3.5 w-3.5" /> كامل</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode('financial')} className="text-xs gap-2"><DollarSign className="h-3.5 w-3.5" /> مالي فقط</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode('operational')} className="text-xs gap-2"><Truck className="h-3.5 w-3.5" /> تشغيلي</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode('public')} className="text-xs gap-2"><EyeOff className="h-3.5 w-3.5" /> عام (بدون مالية)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1">
                  <MoreHorizontal className="h-3.5 w-3.5" /> المزيد
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportPDF} className="text-xs gap-2"><FileText className="h-3.5 w-3.5" /> تصدير PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel} className="text-xs gap-2"><FileSpreadsheet className="h-3.5 w-3.5" /> تصدير Excel</DropdownMenuItem>
                {showFinance && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setExpenseOpen(true)} className="text-xs gap-2"><Receipt className="h-3.5 w-3.5" /> إضافة مصروف</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== PAYMENT MODAL ========== */}
      {paymentShipment && onReceivePayment && (
        <PaymentDialog
          shipment={paymentShipment}
          funds={funds}
          fmt={fmt}
          onClose={() => setPaymentShipment(null)}
          onSubmit={async (amount, fundId, note) => {
            await onReceivePayment(paymentShipment.id, amount, fundId, note);
            setPaymentShipment(null);
            onRefresh?.();
          }}
        />
      )}

      {/* ========== EXPENSE MODAL ========== */}
      {expenseOpen && (
        <ExpenseDialog
          containerId={container.id}
          contacts={contacts}
          funds={funds}
          onClose={() => setExpenseOpen(false)}
          onAdded={() => { setExpenseOpen(false); onRefresh?.(); }}
        />
      )}
    </>
  );
}

// ============================================================
// SUMMARY CHIP (compact header)
// ============================================================
function SummaryChip({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'red' }) {
  const accentClass =
    accent === 'green' ? 'text-green-600 dark:text-green-400'
    : accent === 'red' ? 'text-red-600 dark:text-red-400'
    : 'text-foreground';
  return (
    <div className="rounded-md bg-muted/50 border border-border px-1.5 py-1 text-center min-w-0">
      <p className="text-[9px] text-muted-foreground truncate leading-none">{label}</p>
      <p className={cn('text-[11px] font-bold tabular-nums truncate mt-0.5', accentClass)}>{value}</p>
    </div>
  );
}

// ============================================================
// ACTIVITY ROW
// ============================================================
function ActivityRow({ label, date }: { label: string; date: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg border border-border bg-card text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{date}</span>
    </div>
  );
}

// ============================================================
// HELPER COMPONENTS
// ============================================================
function InfoTile({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: 'cyan' | 'purple' | 'blue' | 'green' | 'red' | 'amber' }) {
  const colorMap = {
    cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20',
    purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    green: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    red: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  };
  return (
    <div className={cn('rounded-lg border p-2', colorMap[color])}>
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="h-3 w-3 opacity-70" />
        <span className="text-[9px] opacity-80">{label}</span>
      </div>
      <p className="text-xs font-bold tabular-nums truncate">{value}</p>
      {sub && <p className="text-[9px] opacity-60 truncate">{sub}</p>}
    </div>
  );
}

function FinTile({ label, value, tone, small }: { label: string; value: string; tone: 'blue' | 'green' | 'red' | 'amber'; small?: boolean }) {
  const toneMap = {
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    green: 'bg-green-500/10 text-green-700 dark:text-green-400',
    red: 'bg-red-500/10 text-red-700 dark:text-red-400',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  };
  return (
    <div className={cn('rounded-lg p-2 text-center', toneMap[tone])}>
      <p className="text-[9px] opacity-80">{label}</p>
      <p className={cn('font-bold tabular-nums', small ? 'text-[11px]' : 'text-sm')}>{value}</p>
    </div>
  );
}

function CostRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', bold && 'font-bold text-foreground')}>{value}</span>
    </div>
  );
}

function DetailRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-1 p-1 rounded bg-background border border-border">
      <span className="text-muted-foreground text-[10px] shrink-0">{label}:</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="truncate font-medium tabular-nums">{value}</span>
        {copyable && value !== '-' && (
          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(value); toast.success('تم النسخ'); }}>
            <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'green' | 'red' }) {
  const toneMap = {
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    green: 'bg-green-500/10 text-green-700 dark:text-green-400',
    red: 'bg-red-500/10 text-red-700 dark:text-red-400',
  };
  return (
    <div className={cn('rounded p-1.5 text-center', toneMap[tone])}>
      <p className="text-[8px] opacity-80">{label}</p>
      <p className="text-[10px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

// ============================================================
// PAYMENT DIALOG
// ============================================================
function PaymentDialog({
  shipment, funds, fmt, onClose, onSubmit,
}: {
  shipment: Shipment;
  funds: Fund[];
  fmt: (v: number) => string;
  onClose: () => void;
  onSubmit: (amount: number, fundId: string, note?: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(shipment.remainingAmount.toString());
  const [fundId, setFundId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('أدخل مبلغ صحيح'); return; }
    if (!fundId) { toast.error('اختر الصندوق'); return; }
    setSubmitting(true);
    try {
      await onSubmit(amt, fundId, note.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-green-600" />
            استلام دفعة
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/30 p-2.5 text-[11px] space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">العميل:</span><span className="font-bold">{shipment.clientName}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">إجمالي الفاتورة:</span><span className="font-bold tabular-nums">{fmt(shipment.contractPrice)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">المحصل:</span><span className="font-bold text-green-600 tabular-nums">{fmt(shipment.amountPaid)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="text-muted-foreground">المتبقي:</span><span className="font-bold text-red-600 tabular-nums">{fmt(shipment.remainingAmount)}</span></div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">المبلغ المستلم</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-sm tabular-nums" />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">إيداع في الصندوق</label>
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
              <SelectContent>
                {funds.map(f => <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">ملاحظات (اختياري)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-xs resize-none" />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-9 text-xs" onClick={onClose}>إلغاء</Button>
            <Button className="flex-1 h-9 text-xs gap-1" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              تأكيد الاستلام
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// EXPENSE DIALOG
// ============================================================
function ExpenseDialog({
  containerId, contacts, funds, onClose, onAdded,
}: {
  containerId: string;
  contacts: AccountOption[];
  funds: Fund[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [contactId, setContactId] = useState('');
  const [fundId, setFundId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!desc.trim()) { toast.error('أدخل الوصف'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('أدخل مبلغ صحيح'); return; }
    if (!contactId) { toast.error('يجب اختيار المستفيد'); return; }
    setSubmitting(true);
    const { error } = await (supabase.rpc as any)('add_container_expense', {
      p_container_id: containerId,
      p_amount: amt,
      p_description: desc.trim(),
      p_contact_id: contactId,
      p_fund_id: fundId || null,
      p_notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message || 'فشل إضافة المصروف'); return; }
    toast.success('تم إضافة المصروف وتسجيل القيد');
    onAdded();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4 text-orange-600" />
            إضافة مصروف على الحاوية
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">وصف المصروف *</label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="h-9 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">المبلغ *</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-sm tabular-nums" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">المستفيد * (إلزامي)</label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر المستفيد" /></SelectTrigger>
              <SelectContent>
                {contacts.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">السداد الفوري (اختياري)</label>
            <Select value={fundId || 'none'} onValueChange={(v) => setFundId(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="بدون سداد" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">بدون سداد فوري</SelectItem>
                {funds.map(f => <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">ملاحظات</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-xs resize-none" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-9 text-xs" onClick={onClose}>إلغاء</Button>
            <Button className="flex-1 h-9 text-xs gap-1" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              إضافة
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

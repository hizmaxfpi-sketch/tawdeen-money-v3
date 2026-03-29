import { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Eye, FileText, Printer, Image, X, Clock, Trash2, Edit3, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDateGregorian, formatTime, formatDateTime } from '@/utils/formatUtils';
import { generateHDPreviewPDF } from '@/utils/hdPreview';
import { toast } from 'sonner';
import { usePersistedFilter } from '@/hooks/usePersistedFilters';
import { useActivityLog, ActivityEvent } from '@/hooks/useActivityLog';

const ACTION_LABELS: Record<string, string> = {
  transaction_created: 'إنشاء عملية',
  transaction_modified: 'تعديل عملية',
  transaction_deleted: 'حذف عملية',
  account_created: 'إنشاء حساب',
  account_updated: 'تعديل حساب',
  account_deleted: 'حذف حساب',
  fund_created: 'إنشاء صندوق',
  fund_updated: 'تعديل صندوق',
  fund_deleted: 'حذف صندوق',
  contact_created: 'إنشاء جهة اتصال',
  contact_updated: 'تعديل جهة اتصال',
  contact_deleted: 'حذف جهة اتصال',
  shipment_created: 'إنشاء شحنة',
  shipment_updated: 'تعديل شحنة',
  shipment_deleted: 'حذف شحنة',
  project_created: 'إنشاء مشروع',
  project_updated: 'تعديل مشروع',
  project_deleted: 'حذف مشروع',
  status_changed: 'تغيير حالة',
};

const ACTION_ICONS: Record<string, typeof Plus> = {
  transaction_created: Plus, transaction_modified: Edit3, transaction_deleted: Trash2,
  account_created: Plus, account_updated: Edit3, account_deleted: Trash2,
  fund_created: Plus, fund_updated: Edit3, fund_deleted: Trash2,
  contact_created: Plus, contact_updated: Edit3, contact_deleted: Trash2,
  shipment_created: Plus, shipment_updated: Edit3, shipment_deleted: Trash2,
  project_created: Plus, project_updated: Edit3, project_deleted: Trash2,
  status_changed: Edit3,
};

const ACTION_COLORS: Record<string, string> = {
  transaction_created: 'text-income bg-income/10',
  transaction_modified: 'text-amber-600 bg-amber-500/10',
  transaction_deleted: 'text-expense bg-expense/10',
  account_created: 'text-income bg-income/10',
  account_updated: 'text-amber-600 bg-amber-500/10',
  account_deleted: 'text-expense bg-expense/10',
  fund_created: 'text-income bg-income/10',
  fund_updated: 'text-amber-600 bg-amber-500/10',
  fund_deleted: 'text-expense bg-expense/10',
  contact_created: 'text-income bg-income/10',
  contact_updated: 'text-amber-600 bg-amber-500/10',
  contact_deleted: 'text-expense bg-expense/10',
  shipment_created: 'text-income bg-income/10',
  shipment_updated: 'text-amber-600 bg-amber-500/10',
  shipment_deleted: 'text-expense bg-expense/10',
  project_created: 'text-income bg-income/10',
  project_updated: 'text-amber-600 bg-amber-500/10',
  project_deleted: 'text-expense bg-expense/10',
  status_changed: 'text-primary bg-primary/10',
};

export function ActivityLogReport() {
  const { events, loading, fetchEvents } = useActivityLog();
  const [search, setSearch] = usePersistedFilter('activity-search', '');
  const [dateFrom, setDateFrom] = usePersistedFilter('activity-datefrom', '');
  const [dateTo, setDateTo] = usePersistedFilter('activity-dateto', '');
  const [statusFilter, setStatusFilter] = usePersistedFilter<'all' | 'active' | 'deleted'>('activity-status', 'all');
  const [showPreview, setShowPreview] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchEvents(); }, []);

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(e.entityName || '').toLowerCase().includes(q) && !ACTION_LABELS[e.eventType]?.toLowerCase().includes(q)) return false;
      }
      const eventDate = e.createdAt.split('T')[0];
      if (dateFrom && eventDate < dateFrom) return false;
      if (dateTo && eventDate > dateTo) return false;
      return true;
    });
  }, [events, statusFilter, search, dateFrom, dateTo]);

  const handleExportImage = async () => {
    if (!previewRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(previewRef.current, { scale: 4, useCORS: true, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `سجل_النشاط_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
      toast.success('تم تصدير الصورة بدقة عالية');
    } catch { toast.error('خطأ في التصدير'); }
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();

    doc.setFillColor(25, 65, 120);
    doc.rect(0, 0, pw, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('سجل نشاط النظام', pw / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}`, pw / 2, 30, { align: 'center' });

    let y = 50;
    if (filteredEvents.length > 0) {
      (doc as any).autoTable({
        startY: y,
        head: [['التاريخ', 'الوقت', 'المستخدم', 'الحدث', 'البيان', 'المبلغ', 'الحالة']],
        body: filteredEvents.map(e => [
          formatDateGregorian(e.createdAt),
          formatTime(e.createdAt),
          e.userName,
          ACTION_LABELS[e.eventType] || e.eventType,
          e.entityName || '-',
          e.details?.amount ? `$${Number(e.details.amount).toLocaleString()}` : '-',
          e.status === 'deleted' ? 'محذوف' : 'نشط',
        ]),
        styles: { font: 'Helvetica', fontSize: 8, halign: 'center' },
        headStyles: { fillColor: [25, 65, 120], textColor: 255 },
        margin: { left: 10, right: 10 },
      });
    }

    const ph = doc.internal.pageSize.getHeight();
    doc.setFillColor(245, 245, 245);
    doc.rect(0, ph - 20, pw, 20, 'F');
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.text(`توطين © ${new Date().getFullYear()} - جميع الحقوق محفوظة`, pw / 2, ph - 8, { align: 'center' });

    doc.save(`سجل_نشاط_${Date.now()}.pdf`);
    toast.success('تم تصدير PDF بنجاح');
  };

  const handlePrint = () => {
    if (!previewRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl"><head><title>سجل نشاط النظام</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; direction:rtl; padding:15mm; color:#1a1a1a; }
        table { width:100%; border-collapse:collapse; font-size:11px; }
        th { background:#194178; color:white; padding:8px; }
        td { padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:center; }
        tr:nth-child(even) { background:#f9fafb; }
        .header { background:#194178; color:white; padding:20px; text-align:center; border-radius:8px; margin-bottom:20px; }
        .header h1 { font-size:20px; }
        .footer { text-align:center; margin-top:30px; font-size:9px; color:#999; }
        @media print { body { padding:10mm; } }
      </style></head><body>
      ${previewRef.current.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 400);
  };

  if (loading) return <div className="text-center py-6 text-xs text-muted-foreground">جاري التحميل...</div>;

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-3 shadow-sm border border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />
            سجل نشاط النظام
          </h3>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={() => setShowPreview(true)}>
              <Eye className="h-3 w-3" /> معاينة
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={handleExportPDF}>
              <FileText className="h-3 w-3" /> PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-2 mb-3">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في السجل..." className="h-8 text-xs pr-8" />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'active', 'deleted'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn("flex-1 py-1.5 rounded-md text-[10px] font-medium transition-colors",
                  statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80")}>
                {s === 'all' ? 'الكل' : s === 'active' ? 'نشط' : 'محذوف'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground mb-0.5 block">من تاريخ</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground mb-0.5 block">إلى تاريخ</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
            </div>
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="mt-3 p-1 hover:bg-muted rounded">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground mb-2">عرض {filteredEvents.length} من {events.length} حدث</p>

        {/* Events List */}
        <div className="space-y-1 max-h-[400px] overflow-y-auto scrollbar-hide">
          {filteredEvents.length === 0 ? (
            <p className="text-center py-6 text-xs text-muted-foreground">لا توجد أحداث مطابقة</p>
          ) : (
            filteredEvents.map((event, i) => {
              const ActionIcon = ACTION_ICONS[event.eventType] || Clock;
              const colorClass = ACTION_COLORS[event.eventType] || 'text-primary bg-primary/10';
              return (
                <motion.div key={event.id} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                  className={cn("flex items-center gap-2.5 p-2 rounded-lg border transition-colors",
                    event.status === 'deleted' ? "border-destructive/20 bg-destructive/5 opacity-70" : "border-border hover:bg-muted/50"
                  )}>
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-full shrink-0", colorClass)}>
                    <ActionIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{event.entityName || '-'}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="font-semibold text-primary/70">{event.userName}</span>
                      <span>•</span>
                      <span>{formatDateTime(event.createdAt)}</span>
                      <span>•</span>
                      <span>{ACTION_LABELS[event.eventType] || event.eventType}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-left">
                    {event.details?.amount && (
                      <p className={cn("text-xs font-bold", event.details?.type === 'in' ? "text-income" : "text-expense")}>
                        {event.details?.type === 'in' ? '+' : '-'}${Number(event.details.amount).toLocaleString()}
                      </p>
                    )}
                    {event.status === 'deleted' && (
                      <span className="text-[9px] text-destructive font-medium">محذوف</span>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="p-4 pb-2 sticky top-0 bg-card z-10 border-b border-border">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm">سجل نشاط النظام</DialogTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={handlePrint}>
                  <Printer className="h-3 w-3" /> طباعة
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={handleExportImage}>
                  <Image className="h-3 w-3" /> صورة HD
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1" onClick={handleExportPDF}>
                  <FileText className="h-3 w-3" /> PDF
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div ref={previewRef} className="p-4 space-y-3 bg-white text-black" dir="rtl">
            <div style={{ background: '#194178', color: 'white', padding: '16px', textAlign: 'center', borderRadius: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>سجل نشاط النظام</h2>
              <p style={{ fontSize: '10px', opacity: 0.8 }}>توطين - المساعد المالي</p>
              <p style={{ fontSize: '9px', opacity: 0.7, marginTop: '4px' }}>تاريخ الإصدار: {formatDateGregorian(new Date(), 'long')}</p>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ background: '#194178', color: 'white' }}>
                  <th style={{ padding: '6px' }}>التاريخ</th>
                  <th style={{ padding: '6px' }}>الوقت</th>
                  <th style={{ padding: '6px' }}>المستخدم</th>
                  <th style={{ padding: '6px' }}>الحدث</th>
                  <th style={{ padding: '6px' }}>البيان</th>
                  <th style={{ padding: '6px' }}>المبلغ</th>
                  <th style={{ padding: '6px' }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 === 0 ? '#f9fafb' : '#fff', borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '5px', textAlign: 'center', whiteSpace: 'nowrap' }}>{formatDateGregorian(e.createdAt)}</td>
                    <td style={{ padding: '5px', textAlign: 'center', whiteSpace: 'nowrap' }}>{formatTime(e.createdAt)}</td>
                    <td style={{ padding: '5px', textAlign: 'center', fontWeight: 'bold', color: '#194178' }}>{e.userName}</td>
                    <td style={{ padding: '5px', textAlign: 'center' }}>{ACTION_LABELS[e.eventType] || e.eventType}</td>
                    <td style={{ padding: '5px', textAlign: 'center' }}>{e.entityName || '-'}</td>
                    <td style={{ padding: '5px', textAlign: 'center', fontWeight: 'bold', color: e.details?.type === 'in' ? '#16a34a' : '#dc2626' }}>
                      {e.details?.amount ? `$${Number(e.details.amount).toLocaleString()}` : '-'}
                    </td>
                    <td style={{ padding: '5px', textAlign: 'center' }}>
                      {e.status === 'deleted' ? <span style={{ color: '#dc2626', fontWeight: 'bold' }}>محذوف</span> : 'نشط'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredEvents.length === 0 && (
              <p style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '11px' }}>لا توجد أحداث</p>
            )}

            <div style={{ textAlign: 'center', fontSize: '8px', color: '#999', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
              توطين © {new Date().getFullYear()} - جميع الحقوق محفوظة
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

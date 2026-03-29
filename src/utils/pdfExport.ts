import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Shipment, Container, Transaction, Debt } from '@/types/finance';

// تعريف الخط العربي
const ARABIC_FONT_CONFIG = {
  fontName: 'Helvetica',
};

// شعار الثقة التجارية
const COMPANY_NAME = 'الثقة التجارية';
const COMPANY_SLOGAN = 'شريكك الموثوق في الشحن والتجارة';

// تنسيق التاريخ
const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
};

// تنسيق المبلغ
const formatAmount = (amount: number): string => {
  return amount.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// إنشاء ترويسة الفاتورة
const createHeader = (doc: jsPDF, title: string) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // خلفية الترويسة
  doc.setFillColor(25, 65, 120);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // اسم الشركة
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text(COMPANY_NAME, pageWidth / 2, 20, { align: 'center' });
  
  // الشعار
  doc.setFontSize(10);
  doc.text(COMPANY_SLOGAN, pageWidth / 2, 32, { align: 'center' });
  
  // عنوان المستند
  doc.setTextColor(25, 65, 120);
  doc.setFontSize(18);
  doc.text(title, pageWidth / 2, 60, { align: 'center' });
  
  // التاريخ
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`تاريخ الإصدار: ${formatDate(new Date())}`, pageWidth - 15, 70, { align: 'right' });
  
  return 80;
};

// إنشاء تذييل
const createFooter = (doc: jsPDF) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.setFillColor(245, 245, 245);
  doc.rect(0, pageHeight - 25, pageWidth, 25, 'F');
  
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.text(`${COMPANY_NAME} - جميع الحقوق محفوظة © ${new Date().getFullYear()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
};

// تصدير فاتورة شحنة
export const exportShipmentInvoice = (shipment: Shipment, container?: Container): void => {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  let yPos = createHeader(doc, 'فاتورة شحنة');
  
  // معلومات العميل
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  
  const clientInfo = [
    ['اسم العميل:', shipment.clientName],
    ['نوع البضاعة:', shipment.goodsType],
    ['رقم التتبع:', shipment.trackingNumber || 'غير متوفر'],
  ];
  
  clientInfo.forEach(([label, value]) => {
    doc.setTextColor(100, 100, 100);
    doc.text(label, 195, yPos, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.text(value, 140, yPos, { align: 'right' });
    yPos += 8;
  });
  
  yPos += 10;
  
  // تفاصيل الشحنة
  doc.setFillColor(245, 247, 250);
  doc.rect(15, yPos - 5, 180, 50, 'F');
  
  const shipmentDetails = [
    ['الأبعاد (م):', `${shipment.length} × ${shipment.width} × ${shipment.height}`],
    ['الكمية:', shipment.quantity.toString()],
    ['الحجم (CBM):', formatAmount(shipment.cbm)],
    ['سعر المتر:', `$${formatAmount(shipment.pricePerMeter)}`],
  ];
  
  yPos += 5;
  shipmentDetails.forEach(([label, value]) => {
    doc.setTextColor(100, 100, 100);
    doc.text(label, 185, yPos, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.text(value, 100, yPos, { align: 'right' });
    yPos += 10;
  });
  
  yPos += 15;
  
  // الملخص المالي
  doc.setFillColor(25, 65, 120);
  doc.rect(15, yPos - 5, 180, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text('الملخص المالي', 105, yPos, { align: 'center' });
  
  yPos += 12;
  
  const financialSummary = [
    ['قيمة المقاولة:', `$${formatAmount(shipment.contractPrice)}`, '25, 65, 120'],
    ['المبلغ المدفوع:', `$${formatAmount(shipment.amountPaid)}`, '34, 139, 34'],
    ['المتبقي:', `$${formatAmount(shipment.remainingAmount)}`, shipment.remainingAmount > 0 ? '220, 53, 69' : '34, 139, 34'],
  ];
  
  financialSummary.forEach(([label, value, color]) => {
    const [r, g, b] = color.split(', ').map(Number);
    doc.setTextColor(100, 100, 100);
    doc.text(label, 185, yPos, { align: 'right' });
    doc.setTextColor(r, g, b);
    doc.setFontSize(14);
    doc.text(value, 80, yPos, { align: 'right' });
    doc.setFontSize(11);
    yPos += 12;
  });
  
  // حالة الدفع
  yPos += 10;
  const statusColors: Record<string, [number, number, number]> = {
    paid: [34, 139, 34],
    partial: [255, 165, 0],
    unpaid: [220, 53, 69],
  };
  const statusLabels: Record<string, string> = {
    paid: 'مدفوع بالكامل',
    partial: 'مدفوع جزئياً',
    unpaid: 'غير مدفوع',
  };
  
  const [sr, sg, sb] = statusColors[shipment.paymentStatus] || [100, 100, 100];
  doc.setFillColor(sr, sg, sb);
  doc.roundedRect(70, yPos - 5, 70, 12, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(statusLabels[shipment.paymentStatus] || 'غير محدد', 105, yPos + 3, { align: 'center' });
  
  createFooter(doc);
  
  doc.save(`فاتورة_${shipment.clientName}_${Date.now()}.pdf`);
};

// تصدير تقرير حاوية
export const exportContainerReport = (container: Container, shipments: Shipment[]): void => {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  let yPos = createHeader(doc, 'تقرير حاوية');
  
  // معلومات الحاوية
  const containerInfo = [
    ['رقم الحاوية:', container.containerNumber],
    ['النوع:', container.type],
    ['المسار:', container.route],
    ['الحالة:', getStatusLabel(container.status)],
  ];
  
  containerInfo.forEach(([label, value]) => {
    doc.setTextColor(100, 100, 100);
    doc.text(label, 195, yPos, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.text(value, 140, yPos, { align: 'right' });
    yPos += 8;
  });
  
  yPos += 10;
  
  // إحصائيات السعة
  doc.setFillColor(245, 247, 250);
  doc.rect(15, yPos - 5, 180, 30, 'F');
  
  const capacityInfo = [
    ['السعة الكلية:', `${container.capacity} CBM`],
    ['المستخدم:', `${formatAmount(container.usedCapacity)} CBM`],
    ['المتبقي:', `${formatAmount(container.capacity - container.usedCapacity)} CBM`],
  ];
  
  yPos += 5;
  capacityInfo.forEach(([label, value]) => {
    doc.setTextColor(100, 100, 100);
    doc.text(label, 185, yPos, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.text(value, 100, yPos, { align: 'right' });
    yPos += 8;
  });
  
  yPos += 15;
  
  // جدول الشحنات
  if (shipments.length > 0) {
    doc.setFillColor(25, 65, 120);
    doc.rect(15, yPos - 5, 180, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('قائمة الشحنات', 105, yPos, { align: 'center' });
    
    yPos += 10;
    
    (doc as any).autoTable({
      startY: yPos,
      head: [['العميل', 'البضاعة', 'CBM', 'المقاولة', 'المتبقي']],
      body: shipments.map(s => [
        s.clientName,
        s.goodsType,
        formatAmount(s.cbm),
        formatAmount(s.contractPrice),
        formatAmount(s.remainingAmount),
      ]),
      styles: { font: 'Helvetica', fontSize: 9, halign: 'center' },
      headStyles: { fillColor: [25, 65, 120], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 15, right: 15 },
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 15;
  }
  
  // الملخص المالي
  const financialSummary = [
    ['إجمالي الإيرادات:', `$${formatAmount(container.totalRevenue)}`],
    ['إجمالي التكاليف:', `$${formatAmount(container.totalCost)}`],
    ['صافي الربح:', `$${formatAmount(container.profit)}`],
  ];
  
  financialSummary.forEach(([label, value], index) => {
    const isProfit = index === 2;
    doc.setTextColor(100, 100, 100);
    doc.text(label, 185, yPos, { align: 'right' });
    doc.setTextColor(isProfit ? (container.profit >= 0 ? 34 : 220) : 0, isProfit ? (container.profit >= 0 ? 139 : 53) : 0, isProfit ? (container.profit >= 0 ? 34 : 69) : 0);
    doc.setFontSize(12);
    doc.text(value, 80, yPos, { align: 'right' });
    doc.setFontSize(11);
    yPos += 10;
  });
  
  createFooter(doc);
  
  doc.save(`تقرير_حاوية_${container.containerNumber}_${Date.now()}.pdf`);
};

// تصدير سند قبض/صرف
export const exportVoucher = (
  type: 'receipt' | 'payment',
  data: {
    amount: number;
    clientName: string;
    description: string;
    fundName: string;
    date: Date;
    voucherNumber?: string;
  }
): void => {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  const title = type === 'receipt' ? 'سند قبض' : 'سند صرف';
  let yPos = createHeader(doc, title);
  
  // رقم السند
  const voucherNum = data.voucherNumber || `V${Date.now()}`;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`رقم السند: ${voucherNum}`, 15, yPos - 15);
  
  // البيانات
  const voucherInfo = [
    ['المستلم/المستفيد:', data.clientName],
    ['المبلغ:', `$${formatAmount(data.amount)}`],
    ['البيان:', data.description],
    ['الصندوق:', data.fundName],
    ['التاريخ:', formatDate(data.date)],
  ];
  
  doc.setFillColor(245, 247, 250);
  doc.rect(15, yPos - 5, 180, 70, 'F');
  
  yPos += 5;
  voucherInfo.forEach(([label, value]) => {
    doc.setTextColor(100, 100, 100);
    doc.text(label, 185, yPos, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(value, 100, yPos, { align: 'right' });
    doc.setFontSize(11);
    yPos += 12;
  });
  
  // المبلغ كتابة
  yPos += 20;
  doc.setFillColor(25, 65, 120);
  doc.rect(15, yPos - 5, 180, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(`${formatAmount(data.amount)} ريال سعودي`, 105, yPos + 3, { align: 'center' });
  
  // التوقيعات
  yPos += 40;
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.text('توقيع المستلم', 160, yPos, { align: 'center' });
  doc.text('توقيع المسؤول', 50, yPos, { align: 'center' });
  doc.line(130, yPos + 5, 190, yPos + 5);
  doc.line(20, yPos + 5, 80, yPos + 5);
  
  createFooter(doc);
  
  doc.save(`${title}_${voucherNum}.pdf`);
};

// Helper function
const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    loading: 'قيد التحميل',
    shipped: 'تم الشحن',
    arrived: 'وصلت',
    delivered: 'تم التسليم',
  };
  return labels[status] || status;
};

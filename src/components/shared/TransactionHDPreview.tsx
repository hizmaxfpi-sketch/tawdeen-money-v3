import { useRef, useState, useMemo } from 'react';
import { Transaction } from '@/types/finance';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { generateHDPreviewPDF } from '@/utils/hdPreview';
import { toast } from 'sonner';
import { formatDateGregorian, formatAmount } from '@/utils/formatUtils';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { useFunds } from '@/hooks/useFunds';

interface TransactionHDPreviewProps {
  transaction: Transaction | null;
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  client_collection: 'تحصيل عميل',
  vendor_payment: 'صرف مورد',
  expense: 'مصروفات',
  partner_payment: 'صرف شريك',
  partner_collection: 'تحصيل شريك',
  fund_transfer: 'تحويل بين صناديق',
  debt_payment: 'سداد دين',
  debt_collection: 'تحصيل دين',
  other: 'أخرى',
};

const LEGAL_DISCLAIMER = 'هذا المستند تم إنشاؤه آلياً من النظام وهو معتمد بدون توقيع أو ختم. تخلي المؤسسة مسؤوليتها عن أي كشط، شطب، أو تعديل يدوي يطرأ على هذه الورقة.';

export function TransactionHDPreview({ transaction, open, onClose }: TransactionHDPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const { contacts } = useSupabaseContacts();
  const { funds } = useFunds();

  // Resolve contact name & fund name
  const contactName = useMemo(() => {
    if (!transaction?.contactId) return null;
    return contacts.find(c => c.id === transaction.contactId)?.name || null;
  }, [transaction, contacts]);

  const fundName = useMemo(() => {
    if (!transaction?.fundId) return null;
    return funds.find(f => f.id === transaction.fundId)?.name || null;
  }, [transaction, funds]);

  if (!transaction) return null;

  const isIncome = transaction.type === 'in';
  const title = isIncome ? 'سند قبض' : 'سند صرف';
  const voucherNum = `V-${transaction.id.slice(0, 8).toUpperCase()}`;

  const handleExportPDF = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      await generateHDPreviewPDF(previewRef.current, `${title}_${voucherNum}.pdf`);
      toast.success('تم تصدير PDF بنجاح');
    } catch {
      toast.error('خطأ في التصدير');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    if (!previewRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl"><head><title>${title}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; direction:rtl; padding:15mm; color:#1a1a1a; }
        .header { background:#194178; color:white; padding:20px; text-align:center; border-radius:8px; margin-bottom:20px; }
        .header h1 { font-size:24px; margin-bottom:4px; }
        .header p { font-size:12px; opacity:0.9; }
        .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; }
        .info-item { background:#f5f7fa; padding:12px; border-radius:6px; }
        .info-item label { font-size:11px; color:#666; display:block; margin-bottom:4px; }
        .info-item span { font-size:14px; font-weight:bold; }
        .amount-box { text-align:center; padding:20px; border-radius:8px; margin:20px 0; }
        .amount-box.income { background:#dcfce7; color:#166534; }
        .amount-box.expense { background:#fef2f2; color:#991b1b; }
        .amount-box .amount { font-size:28px; font-weight:bold; }
        .amount-box .label { font-size:13px; margin-top:4px; }
        .footer { margin-top:40px; display:flex; justify-content:space-between; padding-top:20px; border-top:1px solid #e5e7eb; }
        .sign-block { text-align:center; width:40%; }
        .sign-line { border-bottom:1px solid #999; height:30px; margin-bottom:6px; }
        .sign-label { font-size:11px; color:#666; }
        .brand { text-align:center; margin-top:30px; font-size:10px; color:#999; }
        @media print { body { padding:10mm; } }
      </style></head><body>
      ${previewRef.current.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 400);
  };

  // Build info items dynamically
  const infoItems: { label: string; value: string }[] = [
    { label: 'البيان', value: transaction.description || '-' },
    { label: 'التصنيف', value: CATEGORY_LABELS[transaction.category] || transaction.category },
    { label: 'التاريخ', value: formatDateGregorian(transaction.date, 'long') },
    { label: 'النوع', value: isIncome ? 'مدين (قبض)' : 'دائن (صرف)' },
  ];

  if (contactName) {
    infoItems.push({ label: isIncome ? 'المستلم منه' : 'المستفيد', value: contactName });
  }

  if (fundName) {
    infoItems.push({ label: isIncome ? 'الصندوق المستلم' : 'الصندوق المصروف منه', value: fundName });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm">{title} - معاينة HD</DialogTitle>
          </div>
        </DialogHeader>

        {/* HD Preview Content */}
        <div ref={previewRef} className="mx-4 mb-2 bg-white text-black rounded-lg overflow-hidden" style={{ direction: 'rtl' }}>
          {/* Header */}
          <div style={{ background: '#194178', color: 'white', padding: '20px', textAlign: 'center', borderRadius: '8px 8px 0 0' }}>
            <h1 style={{ fontSize: '22px', marginBottom: '4px', fontWeight: 'bold' }}>{title}</h1>
            <p style={{ fontSize: '11px', opacity: 0.9 }}>توطين - المساعد المالي</p>
            <p style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px' }}>رقم السند: {voucherNum}</p>
          </div>

          {/* Date */}
          <div style={{ textAlign: 'center', padding: '8px', fontSize: '11px', color: '#666', background: '#f5f7fa' }}>
            تاريخ الإصدار: {formatDateGregorian(new Date().toISOString(), 'long')}
          </div>

          {/* Info Grid - dynamic items */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '16px' }}>
            {infoItems.map((item, i) => (
              <div key={i} style={{ background: '#f5f7fa', padding: '10px', borderRadius: '6px' }}>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '3px' }}>{item.label}</div>
                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Amount Box */}
          <div style={{
            textAlign: 'center', padding: '20px', margin: '0 16px',
            borderRadius: '8px',
            background: isIncome ? '#dcfce7' : '#fef2f2',
            color: isIncome ? '#166534' : '#991b1b',
          }}>
            <div style={{ fontSize: '26px', fontWeight: 'bold' }}>
              ${formatAmount(transaction.amount)}
            </div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              {isIncome ? 'مبلغ مستلم' : 'مبلغ مصروف'}
            </div>
          </div>

          {/* Notes */}
          {transaction.notes && (
            <div style={{ margin: '12px 16px', padding: '10px', background: '#f5f7fa', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '3px' }}>ملاحظات</div>
              <div style={{ fontSize: '11px' }}>{transaction.notes}</div>
            </div>
          )}

          {/* Signatures */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 30px', marginTop: '20px' }}>
            <div style={{ textAlign: 'center', width: '40%' }}>
              <div style={{ borderBottom: '1px solid #999', height: '30px', marginBottom: '6px' }}></div>
              <div style={{ fontSize: '10px', color: '#666' }}>توقيع المستلم</div>
            </div>
            <div style={{ textAlign: 'center', width: '40%' }}>
              <div style={{ borderBottom: '1px solid #999', height: '30px', marginBottom: '6px' }}></div>
              <div style={{ fontSize: '10px', color: '#666' }}>توقيع المسؤول</div>
            </div>
          </div>

          {/* Legal Disclaimer */}
          <div style={{ margin: '0 16px', padding: '8px 12px', background: '#fafafa', borderRadius: '4px', border: '1px solid #eee' }}>
            <p style={{ fontSize: '7px', color: '#888', textAlign: 'center', lineHeight: '1.6' }}>
              {LEGAL_DISCLAIMER}
            </p>
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '10px', fontSize: '9px', color: '#999', borderTop: '1px solid #eee', marginTop: '8px' }}>
            توطين © {new Date().getFullYear()} - جميع الحقوق محفوظة
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 p-4 pt-2 border-t border-border">
          <Button
            size="sm"
            className="flex-1 gap-1 h-9 text-xs"
            onClick={handleExportPDF}
            disabled={exporting}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'جاري التصدير...' : 'تحميل PDF'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1 h-9 text-xs"
            onClick={handlePrint}
          >
            <Printer className="h-3.5 w-3.5" />
            طباعة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

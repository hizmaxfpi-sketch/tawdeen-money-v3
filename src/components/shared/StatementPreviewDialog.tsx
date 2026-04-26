import { useMemo, useRef, useState } from 'react';
import { Download, Eye, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Transaction } from '@/types/finance';
import { compareTransactionsByBusinessDateAsc } from '@/utils/transactionSort';
import { formatAmount, formatDateGregorian, formatDateShort, formatNumber } from '@/utils/formatUtils';
import { generateHDPreviewPDF, printHDPreview } from '@/utils/hdPreview';
import { toast } from 'sonner';

const LEGAL_DISCLAIMER = 'هذا المستند تم إنشاؤه آلياً من النظام وهو معتمد بدون توقيع أو ختم. تخلي المؤسسة مسؤوليتها عن أي كشط، شطب، أو تعديل يدوي يطرأ على هذه الورقة.';

interface StatementPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dialogTitle: string;
  documentTitle: string;
  entityName: string;
  entityType?: string;
  entityMeta?: string[];
  transactions: Transaction[];
  fileBaseName: string;
  tableTitle?: string;
  emptyLabel?: string;
  onExportPdf?: (transactions: Transaction[]) => void;
  onExportExcel?: (transactions: Transaction[]) => void;
}

export function StatementPreviewDialog({
  open,
  onOpenChange,
  dialogTitle,
  documentTitle,
  entityName,
  entityType,
  entityMeta = [],
  transactions,
  fileBaseName,
  tableTitle = 'سجل العمليات',
  emptyLabel = 'لا توجد عمليات مسجلة',
  onExportPdf,
  onExportExcel,
}: StatementPreviewDialogProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort(compareTransactionsByBusinessDateAsc);
  }, [transactions]);

  const stats = useMemo(() => {
    const totalDebit = sortedTransactions
      .filter((transaction) => transaction.type === 'in')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalCredit = sortedTransactions
      .filter((transaction) => transaction.type === 'out')
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit,
      transactionCount: sortedTransactions.length,
    };
  }, [sortedTransactions]);

  const ledgerRows = useMemo(() => {
    let runningBalance = 0;
    return sortedTransactions.map((transaction) => {
      runningBalance += transaction.type === 'in' ? transaction.amount : -transaction.amount;
      return {
        ...transaction,
        runningBalance,
      };
    });
  }, [sortedTransactions]);

  const metaLine = [entityType, ...entityMeta].filter(Boolean).join(' | ');

  const handleDownloadHDPDF = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      await generateHDPreviewPDF(previewRef.current, `${fileBaseName}.pdf`);
      toast.success('تم تصدير المعاينة بنجاح');
    } catch {
      toast.error('خطأ في التصدير');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    if (!previewRef.current) return;
    printHDPreview(previewRef.current);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4" /> {dialogTitle}
          </DialogTitle>
        </DialogHeader>

        <div ref={previewRef} className="mx-4 bg-white text-black rounded-lg overflow-hidden" style={{ direction: 'rtl' }}>
          <div style={{ background: '#194178', color: 'white', padding: '16px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>{documentTitle}</h1>
            <p style={{ fontSize: '10px', opacity: 0.9 }}>توطين - المساعد المالي</p>
            <p style={{ fontSize: '9px', opacity: 0.8, marginTop: '2px' }}>
              تاريخ الإصدار: {formatDateGregorian(new Date().toISOString(), 'long')}
            </p>
          </div>

          <div style={{ padding: '12px 16px', background: '#f5f7fa', textAlign: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#194178' }}>{entityName}</div>
            {metaLine && (
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{metaLine}</div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', padding: '12px 16px' }}>
            <div style={{ textAlign: 'center', padding: '10px 6px', background: '#dcfce7', borderRadius: '6px' }}>
              <div style={{ fontSize: '9px', color: '#166534', marginBottom: '2px' }}>مدين (Debit)</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#166534' }}>${formatNumber(stats.totalDebit)}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 6px', background: '#fef2f2', borderRadius: '6px' }}>
              <div style={{ fontSize: '9px', color: '#991b1b', marginBottom: '2px' }}>دائن (Credit)</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#991b1b' }}>${formatNumber(stats.totalCredit)}</div>
            </div>
            <div
              style={{
                textAlign: 'center',
                padding: '10px 6px',
                borderRadius: '6px',
                background: stats.balance > 0 ? '#dcfce7' : stats.balance < 0 ? '#fef2f2' : '#f5f5f5',
              }}
            >
              <div style={{ fontSize: '9px', color: '#666', marginBottom: '2px' }}>الرصيد (Balance)</div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 'bold',
                  color: stats.balance > 0 ? '#16a34a' : stats.balance < 0 ? '#dc2626' : '#666',
                }}
              >
                ${formatNumber(Math.abs(stats.balance))}
              </div>
            </div>
          </div>

          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#194178', marginBottom: '8px', textAlign: 'center' }}>
              {tableTitle} ({formatNumber(stats.transactionCount)})
            </div>
            {ledgerRows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '11px' }}>{emptyLabel}</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead>
                  <tr style={{ background: '#194178', color: 'white' }}>
                    <th style={{ padding: '6px 4px', textAlign: 'center' }}>التاريخ</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center' }}>البيان</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center' }}>مدين</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center' }}>دائن</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center' }}>الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row, index) => (
                    <tr key={row.id} style={{ background: index % 2 === 0 ? '#fff' : '#f5f7fa', borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '5px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>{formatDateShort(row.date)}</td>
                      <td
                        style={{
                          padding: '5px 4px',
                          textAlign: 'center',
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.description || '-'}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'center', color: '#16a34a', fontWeight: row.type === 'in' ? 'bold' : 'normal' }}>
                        {row.type === 'in' ? `$${formatAmount(row.amount)}` : '-'}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'center', color: '#dc2626', fontWeight: row.type === 'out' ? 'bold' : 'normal' }}>
                        {row.type === 'out' ? `$${formatAmount(row.amount)}` : '-'}
                      </td>
                      <td
                        style={{
                          padding: '5px 4px',
                          textAlign: 'center',
                          fontWeight: 'bold',
                          color: row.runningBalance > 0 ? '#16a34a' : row.runningBalance < 0 ? '#dc2626' : '#666',
                        }}
                      >
                        ${formatAmount(Math.abs(row.runningBalance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: '#fafafa', borderRadius: '4px', border: '1px solid #eee' }}>
            <p style={{ fontSize: '7px', color: '#888', textAlign: 'center', lineHeight: '1.6' }}>{LEGAL_DISCLAIMER}</p>
          </div>
          <div style={{ textAlign: 'center', padding: '8px', fontSize: '8px', color: '#999', borderTop: '1px solid #eee' }}>
            توطين © {new Date().getFullYear()} - جميع الحقوق محفوظة
          </div>
        </div>

        <div className="flex flex-wrap gap-2 p-4 pt-2">
          <Button size="sm" className="flex-1 gap-1 h-9 text-xs min-w-[120px]" onClick={handleDownloadHDPDF} disabled={exporting}>
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'جاري التصدير...' : 'تحميل HD PDF'}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1 h-9 text-xs min-w-[100px]" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" /> طباعة
          </Button>
          {onExportPdf && (
            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9 text-xs min-w-[90px]" onClick={() => onExportPdf(sortedTransactions)}>
              <FileText className="h-3.5 w-3.5" /> PDF
            </Button>
          )}
          {onExportExcel && (
            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9 text-xs min-w-[90px]" onClick={() => onExportExcel(sortedTransactions)}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

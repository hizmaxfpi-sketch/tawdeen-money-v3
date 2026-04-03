import { Transaction } from '@/types/finance';
import { translateLegacyText } from '@/i18n/translations';
import { formatCurrencyAmount, formatDateGregorian, getCategoryLabel } from '@/utils/formatUtils';
import { calculateLedgerSummary } from '@/utils/ledgerSummary';

interface AccountStatementData {
  entityName: string;
  entityType: string;
  balance: number;
  totalDebit: number;
  totalCredit: number;
  phone?: string;
  email?: string;
  company?: string;
  transactions: Transaction[];
}

const LEGAL_DISCLAIMER = translateLegacyText('هذا المستند تم إنشاؤه آلياً من النظام وهو معتمد بدون توقيع أو ختم. تخلي المؤسسة مسؤوليتها عن أي كشط، شطب، أو تعديل يدوي يطرأ على هذه الورقة.');

export async function exportAccountStatement(data: AccountStatementData) {
  const [{ jsPDF }, _] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const sortedTransactions = [...data.transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const ledgerSummary = calculateLedgerSummary(sortedTransactions);

  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  // Header
  doc.setFillColor(25, 65, 120);
  doc.rect(0, 0, pw, 42, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(translateLegacyText('كشف حساب'), pw / 2, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`${translateLegacyText('تاريخ الإصدار')}: ${formatDateGregorian(new Date())}`, pw / 2, 30, { align: 'center' });
  doc.text(translateLegacyText('توطين - المساعد المالي'), pw / 2, 37, { align: 'center' });

  let y = 52;

  // Entity info box
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(15, y - 3, pw - 30, 35, 3, 3, 'F');
  doc.setTextColor(25, 65, 120);
  doc.setFontSize(13);
  doc.text(data.entityName, pw / 2, y + 5, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`${translateLegacyText('النوع')}: ${translateLegacyText(data.entityType)}`, pw / 2, y + 13, { align: 'center' });
  
  const contactLine = [data.phone, data.email, data.company].filter(Boolean).join(' | ');
  if (contactLine) {
    doc.text(contactLine, pw / 2, y + 20, { align: 'center' });
  }

  // Balance highlight
  y += 40;
  const balanceColor = ledgerSummary.balance > 0 ? [34, 139, 34] : ledgerSummary.balance < 0 ? [220, 53, 69] : [100, 100, 100];
  doc.setFillColor(balanceColor[0], balanceColor[1], balanceColor[2]);
  doc.roundedRect(pw / 2 - 35, y - 3, 70, 16, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  const balanceLabel = ledgerSummary.balance > 0 ? translateLegacyText('مدين') : ledgerSummary.balance < 0 ? translateLegacyText('دائن') : translateLegacyText('مسوّى');
  doc.text(`${balanceLabel}: ${formatCurrencyAmount(Math.abs(ledgerSummary.balance))}`, pw / 2, y + 7, { align: 'center' });

  // Stats row
  y += 22;
  const stats = [
    [translateLegacyText('مدين (Debit)'), formatCurrencyAmount(ledgerSummary.totalDebit)],
    [translateLegacyText('دائن (Credit)'), formatCurrencyAmount(ledgerSummary.totalCredit)],
    [translateLegacyText('عدد العمليات'), ledgerSummary.transactionCount.toString()],
  ];
  (doc as any).autoTable({
    startY: y,
    body: stats,
    styles: { fontSize: 10, halign: 'center', font: 'Helvetica' },
    columnStyles: { 0: { fontStyle: 'bold', halign: 'right' }, 1: { halign: 'left' } },
    margin: { left: 30, right: 30 },
    theme: 'plain',
  });

  // Transactions table
  y = (doc as any).lastAutoTable.finalY + 10;
  doc.setTextColor(25, 65, 120);
  doc.setFontSize(12);
  doc.text(translateLegacyText('سجل العمليات المالية'), pw / 2, y, { align: 'center' });
  y += 6;

  if (sortedTransactions.length > 0) {
    let runningBalance = 0;
    const rows = sortedTransactions.map(t => {
        if (t.type === 'in') runningBalance += t.amount;
        else runningBalance -= t.amount;
        let desc = t.description || '';
        if (desc.length > 35) desc = desc.substring(0, 35) + '...';
        return [
          formatDateGregorian(t.date),
          desc,
          getCategoryLabel(t.category),
          t.type === 'in' ? formatCurrencyAmount(t.amount) : '-',
          t.type === 'out' ? formatCurrencyAmount(t.amount) : '-',
          formatCurrencyAmount(Math.abs(runningBalance)),
        ];
      });

    (doc as any).autoTable({
      startY: y,
      head: [[translateLegacyText('التاريخ'), translateLegacyText('البيان'), translateLegacyText('النوع'), translateLegacyText('مدين'), translateLegacyText('دائن'), translateLegacyText('الرصيد')]],
      body: rows,
      styles: { font: 'Helvetica', fontSize: 8, halign: 'center', cellPadding: 2 },
      headStyles: { fillColor: [25, 65, 120], textColor: 255, fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 10, right: 10 },
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(translateLegacyText('لا توجد عمليات مالية مسجلة'), pw / 2, y + 10, { align: 'center' });
  }

  // Legal Disclaimer
  const disclaimerY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 15 : y + 20;
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  const splitDisclaimer = doc.splitTextToSize(LEGAL_DISCLAIMER, pw - 30);
  doc.text(splitDisclaimer, pw / 2, Math.min(disclaimerY, ph - 30), { align: 'center' });

  // Footer
  doc.setFillColor(245, 245, 245);
  doc.rect(0, ph - 20, pw, 20, 'F');
  doc.setTextColor(100);
  doc.setFontSize(8);
  doc.text(`${translateLegacyText('توطين')} © ${new Date().getFullYear()} - ${translateLegacyText('جميع الحقوق محفوظة')}`, pw / 2, ph - 8, { align: 'center' });

  doc.save(`${translateLegacyText('كشف حساب')}_${data.entityName}_${Date.now()}.pdf`);
}

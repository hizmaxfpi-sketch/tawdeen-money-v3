import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, TrendingDown, User, Building2, Truck, Users, Phone, Mail, Briefcase, UserCog, Building, Tag, Eye, Download, FileText, FileSpreadsheet, Scale } from 'lucide-react';
import { LedgerAccount, Transaction, LedgerAccountType } from '@/types/finance';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BottomNav } from '@/components/layout/BottomNav';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateGregorian, formatDateShort, formatAmount, formatNumber } from '@/utils/formatUtils';
import { compareTransactionsByBusinessDateAsc } from '@/utils/transactionSort';
import { generateHDPreviewPDF } from '@/utils/hdPreview';
import { exportAccountStatement } from '@/utils/accountStatementPdf';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const LEGAL_DISCLAIMER = 'هذا المستند تم إنشاؤه آلياً من النظام وهو معتمد بدون توقيع أو ختم. تخلي المؤسسة مسؤوليتها عن أي كشط، شطب، أو تعديل يدوي يطرأ على هذه الورقة.';

interface AccountDetailsProps {
  accounts: LedgerAccount[];
  transactions: Transaction[];
}

const ACCOUNT_ICONS: Record<LedgerAccountType, typeof User> = {
  client: Building2, vendor: Truck, partner: Users, expense: User,
  investor: Briefcase, employee: UserCog, government: Building, custom: Tag,
};

const ACCOUNT_LABELS: Record<LedgerAccountType, string> = {
  client: 'عميل', vendor: 'مورد', partner: 'شريك', expense: 'مصروفات',
  investor: 'مستثمر', employee: 'موظف', government: 'جهة حكومية', custom: 'مخصص',
};

const CATEGORY_LABELS: Record<string, string> = {
  client_collection: 'تحصيل', vendor_payment: 'صرف مورد', expense: 'مصروفات',
  partner_payment: 'صرف شريك', partner_collection: 'تحصيل شريك',
  fund_transfer: 'تحويل', debt_payment: 'سداد دين', other: 'أخرى',
};

export function AccountDetails({ accounts }: AccountDetailsProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showPreview, setShowPreview] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const account = accounts.find(a => a.id === id);

  // Fetch ALL account transactions directly from DB (no pagination)
  const [accountTransactions, setAccountTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  useEffect(() => {
    if (!account || !user) return;
    setTxLoading(true);
    supabase
      .from('transactions')
      .select('id, type, category, amount, description, date, fund_id, account_id, contact_id, project_id, notes, created_at, currency_code, exchange_rate')
      .eq('account_id', account.id)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setAccountTransactions(data.map((t: any) => ({
            id: t.id, type: t.type as any, category: t.category as any, amount: Number(t.amount),
            description: t.description || '', date: t.date, fundId: t.fund_id || '',
            accountId: t.account_id || undefined, contactId: t.contact_id || undefined,
            projectId: t.project_id || undefined, notes: t.notes || undefined,
            createdAt: new Date(t.created_at),
            currencyCode: t.currency_code || 'USD', exchangeRate: Number(t.exchange_rate || 1),
          })).sort(compareTransactionsByBusinessDateAsc));
        }
        setTxLoading(false);
      });
  }, [account, user]);

  const stats = useMemo(() => {
    const totalDebit = accountTransactions.filter(t => t.type === 'in').reduce((sum, t) => sum + t.amount, 0);
    const totalCredit = accountTransactions.filter(t => t.type === 'out').reduce((sum, t) => sum + t.amount, 0);
    const balance = totalDebit - totalCredit;
    return { totalDebit, totalCredit, balance, count: accountTransactions.length };
  }, [accountTransactions]);

  // Build running balance rows
  const ledgerRows = useMemo(() => {
    let running = 0;
    return accountTransactions.map(t => {
      if (t.type === 'in') running += t.amount;
      else running -= t.amount;
      return { ...t, runningBalance: running };
    });
  }, [accountTransactions]);

  if (!account) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">الحساب غير موجود</p>
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>
        </div>
      </div>
    );
  }

  const Icon = ACCOUNT_ICONS[account.type];
  const getAccountTypeLabel = () => account.type === 'custom' && account.customType ? account.customType : ACCOUNT_LABELS[account.type];

  const handleDownloadHDPDF = async () => {
    if (!previewRef.current) return;
    try {
      await generateHDPreviewPDF(previewRef.current, `كشف_حساب_HD_${account.name}.pdf`);
      toast.success('تم تصدير كشف الحساب HD');
    } catch { toast.error('خطأ في التصدير'); }
  };

  const handleExportPDF = () => {
    exportAccountStatement({
      entityName: account.name, entityType: getAccountTypeLabel(),
      balance: stats.balance, totalDebit: stats.totalDebit, totalCredit: stats.totalCredit,
      phone: account.phone, email: account.email,
      transactions: accountTransactions,
    });
    toast.success('تم تصدير PDF');
  };

  const handleExportExcel = () => {
    const header = 'التاريخ,البيان,التصنيف,مدين,دائن,الرصيد\n';
    let running = 0;
    const rows = accountTransactions.map(t => {
      if (t.type === 'in') running += t.amount; else running -= t.amount;
      return `${formatDateGregorian(t.date)},${(t.description || '').replace(/,/g, ' ')},${CATEGORY_LABELS[t.category] || t.category},${t.type === 'in' ? formatAmount(t.amount) : ''},${t.type === 'out' ? formatAmount(t.amount) : ''},${formatAmount(running)}`;
    }).join('\n');
    const csv = '\uFEFF' + header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `كشف_حساب_${account.name}_${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('تم تصدير Excel/CSV');
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-primary text-primary-foreground shadow-lg">
        <div className="container flex h-14 items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-primary-foreground/10">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{account.name}</h1>
            <p className="text-xs opacity-80">{getAccountTypeLabel()}</p>
          </div>
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => setShowPreview(true)}>
            <Eye className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Contact Info */}
        {(account.phone || account.email) && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {account.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /><span dir="ltr">{account.phone}</span></span>}
            {account.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /><span dir="ltr">{account.email}</span></span>}
          </div>
        )}

        {/* 3 Power Cards */}
        <div className="grid grid-cols-3 gap-3">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
            <TrendingUp className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-emerald-600">${formatNumber(stats.totalDebit)}</p>
            <p className="text-[10px] text-emerald-600 font-medium">مدين (Debit)</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-center">
            <TrendingDown className="h-5 w-5 text-rose-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-rose-600">${formatNumber(stats.totalCredit)}</p>
            <p className="text-[10px] text-rose-600 font-medium">دائن (Credit)</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={cn("rounded-xl border p-3 text-center",
              stats.balance > 0 ? "bg-emerald-500/10 border-emerald-500/20" :
              stats.balance < 0 ? "bg-rose-500/10 border-rose-500/20" :
              "bg-muted border-border"
            )}>
            <Scale className={cn("h-5 w-5 mx-auto mb-1", stats.balance > 0 ? "text-emerald-600" : stats.balance < 0 ? "text-rose-600" : "text-muted-foreground")} />
            <p className={cn("text-lg font-bold", stats.balance > 0 ? "text-emerald-600" : stats.balance < 0 ? "text-rose-600" : "text-muted-foreground")}>
              ${formatNumber(Math.abs(stats.balance))}
            </p>
            <p className="text-[10px] text-muted-foreground font-medium">الرصيد (Balance)</p>
          </motion.div>
        </div>

        {/* Action Buttons - Read-only: preview & export only */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(true)} className="flex-1 gap-2 h-9 text-xs">
            <Eye className="h-3.5 w-3.5" /> معاينة كشف الحساب
          </Button>
        </div>

        {/* Professional Ledger Table */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-xl bg-card shadow-sm border border-border overflow-hidden">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-bold">سجل العمليات المالية ({formatNumber(stats.count)})</h3>
          </div>
          {txLoading ? (
            <p className="text-center py-8 text-sm text-muted-foreground">جاري تحميل العمليات...</p>
          ) : ledgerRows.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">لا توجد عمليات مسجلة</p>
          ) : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-center text-[11px] font-bold px-2">التاريخ</TableHead>
                    <TableHead className="text-center text-[11px] font-bold px-2">البيان</TableHead>
                    <TableHead className="text-center text-[11px] font-bold text-emerald-600 px-2">مدين</TableHead>
                    <TableHead className="text-center text-[11px] font-bold text-rose-600 px-2">دائن</TableHead>
                    <TableHead className="text-center text-[11px] font-bold px-2">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerRows.map((row) => (
                    <TableRow key={row.id} className="text-xs">
                      <TableCell className="text-center px-2 py-2 text-[11px] whitespace-nowrap">
                        {formatDateShort(row.date)}
                      </TableCell>
                      <TableCell className="text-center px-2 py-2 text-[11px] max-w-[120px] truncate">
                        {row.description || '-'}
                      </TableCell>
                      <TableCell className="text-center px-2 py-2 text-[11px] text-emerald-600 font-semibold">
                        {row.type === 'in' ? `$${formatAmount(row.amount)}` : '-'}
                      </TableCell>
                      <TableCell className="text-center px-2 py-2 text-[11px] text-rose-600 font-semibold">
                        {row.type === 'out' ? `$${formatAmount(row.amount)}` : '-'}
                      </TableCell>
                      <TableCell className={cn("text-center px-2 py-2 text-[11px] font-bold",
                        row.runningBalance > 0 ? "text-emerald-600" : row.runningBalance < 0 ? "text-rose-600" : "")}>
                        ${formatAmount(Math.abs(row.runningBalance))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </motion.div>

        {/* Notes */}
        {account.notes && (
          <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">{account.notes}</p>
        )}

        {/* Legal Footer */}
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground leading-relaxed">{LEGAL_DISCLAIMER}</p>
        </div>
      </main>

      <BottomNav currentPage="accounts" onNavigate={() => navigate('/')} />

      {/* HD Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> كشف حساب - {account.name}
            </DialogTitle>
          </DialogHeader>

          <div ref={previewRef} className="mx-4 bg-white text-black rounded-lg overflow-hidden" style={{ direction: 'rtl' }}>
            <div style={{ background: '#194178', color: 'white', padding: '16px', textAlign: 'center' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>كشف حساب</h1>
              <p style={{ fontSize: '10px', opacity: 0.9 }}>توطين - المساعد المالي</p>
              <p style={{ fontSize: '9px', opacity: 0.8, marginTop: '2px' }}>تاريخ الإصدار: {formatDateGregorian(new Date(), 'long')}</p>
            </div>

            <div style={{ padding: '12px 16px', background: '#f5f7fa', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#194178' }}>{account.name}</div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                {getAccountTypeLabel()}
                {account.phone && ` | ${account.phone}`}
                {account.email && ` | ${account.email}`}
              </div>
            </div>

            {/* 3 Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', padding: '12px 16px' }}>
              <div style={{ textAlign: 'center', padding: '10px 6px', background: '#dcfce7', borderRadius: '6px' }}>
                <div style={{ fontSize: '9px', color: '#166534', marginBottom: '2px' }}>مدين (Debit)</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#166534' }}>${formatNumber(stats.totalDebit)}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '10px 6px', background: '#fef2f2', borderRadius: '6px' }}>
                <div style={{ fontSize: '9px', color: '#991b1b', marginBottom: '2px' }}>دائن (Credit)</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#991b1b' }}>${formatNumber(stats.totalCredit)}</div>
              </div>
              <div style={{
                textAlign: 'center', padding: '10px 6px', borderRadius: '6px',
                background: stats.balance > 0 ? '#dcfce7' : stats.balance < 0 ? '#fef2f2' : '#f5f5f5',
              }}>
                <div style={{ fontSize: '9px', color: '#666', marginBottom: '2px' }}>الرصيد (Balance)</div>
                <div style={{
                  fontSize: '14px', fontWeight: 'bold',
                  color: stats.balance > 0 ? '#16a34a' : stats.balance < 0 ? '#dc2626' : '#666',
                }}>
                  ${formatNumber(Math.abs(stats.balance))}
                </div>
              </div>
            </div>

            {/* Transactions Table - account-specific only, no company summaries */}
            <div style={{ padding: '0 16px 12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#194178', marginBottom: '8px', textAlign: 'center' }}>
                سجل العمليات ({formatNumber(stats.count)})
              </div>
              {ledgerRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '11px' }}>لا توجد عمليات مسجلة</div>
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
                    {ledgerRows.map((row, i) => (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f7fa', borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '5px 4px', textAlign: 'center' }}>{formatDateShort(row.date)}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.description || '-'}
                        </td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', color: '#16a34a', fontWeight: row.type === 'in' ? 'bold' : 'normal' }}>
                          {row.type === 'in' ? `$${formatAmount(row.amount)}` : '-'}
                        </td>
                        <td style={{ padding: '5px 4px', textAlign: 'center', color: '#dc2626', fontWeight: row.type === 'out' ? 'bold' : 'normal' }}>
                          {row.type === 'out' ? `$${formatAmount(row.amount)}` : '-'}
                        </td>
                        <td style={{
                          padding: '5px 4px', textAlign: 'center', fontWeight: 'bold',
                          color: row.runningBalance > 0 ? '#16a34a' : row.runningBalance < 0 ? '#dc2626' : '#666',
                        }}>
                          ${formatAmount(Math.abs(row.runningBalance))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Legal Disclaimer */}
            <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: '#fafafa', borderRadius: '4px', border: '1px solid #eee' }}>
              <p style={{ fontSize: '7px', color: '#888', textAlign: 'center', lineHeight: '1.6' }}>{LEGAL_DISCLAIMER}</p>
            </div>
            <div style={{ textAlign: 'center', padding: '8px', fontSize: '8px', color: '#999', borderTop: '1px solid #eee' }}>
              توطين © {new Date().getFullYear()} - جميع الحقوق محفوظة
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-2 p-4 pt-2">
            <Button size="sm" className="flex-1 gap-1 h-9 text-xs" onClick={handleDownloadHDPDF}>
              <Download className="h-3.5 w-3.5" /> تحميل HD PDF
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9 text-xs" onClick={handleExportPDF}>
              <FileText className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9 text-xs" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

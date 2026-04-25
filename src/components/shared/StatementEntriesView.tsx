import { LayoutGrid, List } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatAmount, formatDateGregorian } from '@/utils/formatUtils';

export interface StatementEntry {
  id: string;
  date: string;
  description?: string;
  type: 'in' | 'out';
  amount: number;
  runningBalance: number;
}

interface StatementEntriesViewProps {
  title: string;
  rows: StatementEntry[];
  viewMode: 'table' | 'cards';
  onViewModeChange: (mode: 'table' | 'cards') => void;
  emptyLabel?: string;
}

export function StatementEntriesView({
  title,
  rows,
  viewMode,
  onViewModeChange,
  emptyLabel = 'لا توجد عمليات مسجلة',
}: StatementEntriesViewProps) {
  return (
    <div className="rounded-xl bg-card shadow-sm border border-border overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg shrink-0">
          <button
            onClick={() => onViewModeChange('table')}
            className={cn(
              'p-1.5 rounded-md transition-all flex items-center gap-1 text-[10px] font-medium',
              viewMode === 'table' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
            title="عرض جدولي"
          >
            <List className="h-3.5 w-3.5" /> جدول
          </button>
          <button
            onClick={() => onViewModeChange('cards')}
            className={cn(
              'p-1.5 rounded-md transition-all flex items-center gap-1 text-[10px] font-medium',
              viewMode === 'cards' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
            title="عرض بطاقات"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> بطاقات
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-center py-8 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : viewMode === 'table' ? (
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-center text-[11px] font-bold px-2">التاريخ</TableHead>
                <TableHead className="text-center text-[11px] font-bold px-2">البيان</TableHead>
                <TableHead className="text-center text-[11px] font-bold text-income px-2">مدين</TableHead>
                <TableHead className="text-center text-[11px] font-bold text-expense px-2">دائن</TableHead>
                <TableHead className="text-center text-[11px] font-bold px-2">الرصيد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="text-xs">
                  <TableCell className="text-center px-2 py-2 text-[11px] whitespace-nowrap">{formatDateGregorian(row.date)}</TableCell>
                  <TableCell className="text-center px-2 py-2 text-[11px] max-w-[140px] truncate">{row.description || '-'}</TableCell>
                  <TableCell className="text-center px-2 py-2 text-[11px] text-income font-semibold">{row.type === 'in' ? `$${formatAmount(row.amount)}` : '-'}</TableCell>
                  <TableCell className="text-center px-2 py-2 text-[11px] text-expense font-semibold">{row.type === 'out' ? `$${formatAmount(row.amount)}` : '-'}</TableCell>
                  <TableCell className={cn('text-center px-2 py-2 text-[11px] font-bold', row.runningBalance > 0 ? 'text-income' : row.runningBalance < 0 ? 'text-expense' : 'text-muted-foreground')}>
                    ${formatAmount(Math.abs(row.runningBalance))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="p-2 space-y-2 max-h-[480px] overflow-y-auto">
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-xs font-semibold truncate">{row.description || '-'}</p>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDateGregorian(row.date)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-income/10 px-2 py-1">
                  <p className="text-[9px] text-muted-foreground">مدين</p>
                  <p className="text-[10px] font-bold text-income">{row.type === 'in' ? `$${formatAmount(row.amount)}` : '-'}</p>
                </div>
                <div className="rounded-md bg-expense/10 px-2 py-1">
                  <p className="text-[9px] text-muted-foreground">دائن</p>
                  <p className="text-[10px] font-bold text-expense">{row.type === 'out' ? `$${formatAmount(row.amount)}` : '-'}</p>
                </div>
                <div className="rounded-md bg-muted px-2 py-1">
                  <p className="text-[9px] text-muted-foreground">الرصيد</p>
                  <p className={cn('text-[10px] font-bold', row.runningBalance > 0 ? 'text-income' : row.runningBalance < 0 ? 'text-expense' : 'text-muted-foreground')}>
                    ${formatAmount(Math.abs(row.runningBalance))}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
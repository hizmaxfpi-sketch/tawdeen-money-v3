import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Asset } from '@/hooks/useAssets';
import { Transaction } from '@/types/finance';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ArrowDownRight, ArrowUpRight, History } from 'lucide-react';

interface AssetLedgerProps {
  asset: Asset;
  transactions: Transaction[];
}

export function AssetLedger({ asset, transactions }: AssetLedgerProps) {
  // Filter transactions related to this asset
  const assetTxs = transactions.filter(tx =>
    (tx as any).asset_id === asset.id ||
    (tx as any).assetId === asset.id ||
    tx.description.includes(asset.name)
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <History className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-bold">سجل الأصل: {asset.name}</h4>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">قيمة الشراء</p>
            <p className="text-sm font-bold">${asset.value.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30 border-none shadow-none">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">الإهلاك التراكمي</p>
            <p className="text-sm font-bold text-expense">${asset.totalDepreciation.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-1.5">
        {assetTxs.length === 0 ? (
          <p className="text-center py-4 text-xs text-muted-foreground">لا توجد عمليات مسجلة لهذا الأصل</p>
        ) : (
          assetTxs.map(tx => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center justify-between p-2 rounded-lg border border-border bg-card shadow-sm"
            >
              <div className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  tx.type === 'in' ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'
                }`}>
                  {tx.type === 'in' ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                </div>
                <div>
                  <p className="text-[11px] font-medium leading-none">{tx.description}</p>
                  <p className="text-[9px] text-muted-foreground mt-1">
                    {format(new Date(tx.date), 'dd MMMM yyyy', { locale: ar })}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-xs font-bold ${tx.type === 'in' ? 'text-income' : 'text-expense'}`}>
                  {tx.type === 'in' ? '+' : '-'}${tx.amount.toLocaleString()}
                </p>
                <p className="text-[8px] text-muted-foreground uppercase">{tx.category.replace('_', ' ')}</p>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

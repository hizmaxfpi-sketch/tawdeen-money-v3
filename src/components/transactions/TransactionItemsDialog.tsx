import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Transaction } from '@/types/finance';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';

interface TransactionItemsDialogProps {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionItemsDialog({ transaction, open, onOpenChange }: TransactionItemsDialogProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { contacts } = useSupabaseContacts();

  useEffect(() => {
    if (open && transaction.id) {
      fetchItems();
    }
  }, [open, transaction.id]);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('transaction_items')
      .select('*')
      .eq('transaction_id', transaction.id);

    if (!error && data) {
      setItems(data);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold">تفاصيل العملية: {transaction.description}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-xs text-muted-foreground animate-pulse">جاري تحميل البنود...</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">لا توجد بنود فرعية مسجلة</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="h-8 text-[10px] text-right">البيان</TableHead>
                <TableHead className="h-8 text-[10px] text-right">المبلغ</TableHead>
                <TableHead className="h-8 text-[10px] text-right">الحساب</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => {
                const contact = contacts.find(c => c.id === item.contact_id);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="py-2 text-[10px]">{item.description}</TableCell>
                    <TableCell className="py-2 text-[10px] font-bold">${Number(item.amount).toLocaleString()}</TableCell>
                    <TableCell className="py-2 text-[10px]">{contact?.name || '-'}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/20 font-bold">
                <TableCell className="py-2 text-[10px]">الإجمالي</TableCell>
                <TableCell className="py-2 text-[10px]">${items.reduce((s, i) => s + Number(i.amount), 0).toLocaleString()}</TableCell>
                <TableCell className="py-2"></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

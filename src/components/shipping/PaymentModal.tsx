import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CreditCard, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Fund, Shipment } from '@/types/finance';

interface PaymentModalProps {
  shipment: Shipment;
  funds: Fund[];
  onSubmit: (amount: number, fundId: string, note?: string) => void;
  onClose: () => void;
}

export function PaymentModal({ shipment, funds, onSubmit, onClose }: PaymentModalProps) {
  const [amount, setAmount] = useState(shipment.remainingAmount.toString());
  const [fundId, setFundId] = useState('');
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    const paymentAmount = parseFloat(amount) || 0;
    if (paymentAmount <= 0 || !fundId) return;
    
    onSubmit(paymentAmount, fundId, note.trim() || undefined);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-border p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-income/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-income" />
              </div>
              <div>
                <h2 className="text-lg font-bold">تسجيل دفعة</h2>
                <p className="text-xs text-muted-foreground">{shipment.clientName} - {shipment.goodsType}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* ملخص الشحنة */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">سعر المقاولة:</span>
                <span className="font-bold">${shipment.contractPrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المستلم:</span>
                <span className="font-bold text-income">${shipment.amountPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="text-muted-foreground">المتبقي:</span>
                <span className="font-bold text-destructive">${shipment.remainingAmount.toLocaleString()}</span>
              </div>
            </div>

            {/* المبلغ */}
            <div className="space-y-2">
              <Label>مبلغ الدفعة *</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="text-right text-lg font-bold"
                max={shipment.remainingAmount}
              />
              <p className="text-xs text-muted-foreground">
                الحد الأقصى: ${shipment.remainingAmount.toLocaleString()}
              </p>
            </div>

            {/* الصندوق */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                الصندوق المستلم *
              </Label>
              <Select value={fundId} onValueChange={setFundId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الصندوق" />
                </SelectTrigger>
                <SelectContent>
                  {funds.map(fund => (
                    <SelectItem key={fund.id} value={fund.id}>
                      {fund.name} (${fund.balance.toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ملاحظة */}
            <div className="space-y-2">
              <Label>ملاحظة (اختياري)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ملاحظة على الدفعة..."
                className="text-right resize-none"
                rows={2}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border p-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              إلغاء
            </Button>
            <Button 
              className="flex-1 bg-income hover:bg-income/90" 
              onClick={handleSubmit}
              disabled={!fundId || (parseFloat(amount) || 0) <= 0}
            >
              تسجيل الدفعة
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

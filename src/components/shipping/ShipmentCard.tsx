import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, User, ChevronDown, ChevronUp, Edit, Trash2, 
  CreditCard, Calendar, Paperclip
} from 'lucide-react';
import { DocumentAttachment } from '@/components/shared/DocumentAttachment';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shipment } from '@/types/finance';

interface ShipmentCardProps {
  shipment: Shipment;
  onEdit: () => void;
  onDelete: () => void;
  onAddPayment: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const paymentStatusLabels: Record<string, { label: string; color: string }> = {
  unpaid: { label: 'غير مسدد', color: 'bg-destructive' },
  partial: { label: 'جزئي', color: 'bg-yellow-500' },
  paid: { label: 'مسدد', color: 'bg-income' },
};

export function ShipmentCard({ shipment, onEdit, onDelete, onAddPayment, canEdit = true, canDelete = true }: ShipmentCardProps) {
  const [showPayments, setShowPayments] = useState(false);
  const status = paymentStatusLabels[shipment.paymentStatus] || paymentStatusLabels.unpaid;
  const progressPercent = (shipment.amountPaid / shipment.contractPrice) * 100;

  return (
    <div dir="rtl" className="bg-background rounded-lg border border-border p-3 space-y-2 text-right">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
            <Package className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
           <p className="font-medium text-sm leading-none mb-1">
              {shipment.goodsType}
              {shipment.attachments && shipment.attachments.length > 0 && (
                <Paperclip className="h-3 w-3 text-primary inline mr-1" />
              )}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              {shipment.clientName}
            </p>
          </div>
        </div>
        <Badge className={`${status.color} text-white text-[10px] px-1.5 py-0.5`}>
          {status.label}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] py-1">
        <div>
          <span className="text-muted-foreground block">الحجم</span>
          <p className="font-bold">{shipment.cbm.toFixed(2)} CBM</p>
        </div>
        <div>
          <span className="text-muted-foreground block">المقاولة</span>
          <p className="font-bold font-sans">{shipment.contractPrice.toLocaleString('ar-SA')}</p>
        </div>
        <div>
          <span className="text-muted-foreground block">المتبقي</span>
          <p className={`font-bold font-sans ${shipment.remainingAmount > 0 ? 'text-destructive' : 'text-income'}`}>
            {shipment.remainingAmount.toLocaleString('ar-SA')}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${
              progressPercent >= 100 ? 'bg-income' : 
              progressPercent > 0 ? 'bg-yellow-500' : 'bg-destructive'
            }`}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground font-sans">
          <span>المستلم: {shipment.amountPaid.toLocaleString('ar-SA')}</span>
          <span>{progressPercent.toFixed(0)}%</span>
        </div>
      </div>

      {shipment.createdByName && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <User className="h-2.5 w-2.5" />
          <span>بواسطة: <span className="text-primary font-medium">{shipment.createdByName}</span></span>
        </div>
      )}

      {shipment.payments.length > 0 && (
        <button
          onClick={() => setShowPayments(!showPayments)}
          className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t border-border/50 mt-1"
        >
          <span className="flex items-center gap-1">
            <CreditCard className="h-3 w-3" />
            سجل الدفعات ({shipment.payments.length})
          </span>
          {showPayments ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}

      <AnimatePresence>
        {showPayments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1 pt-1">
              {shipment.payments.map((payment, index) => (
                <div key={payment.id} className="flex items-center justify-between text-[10px] bg-muted/40 rounded px-2 py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">#{index + 1}</span>
                    <span className="font-bold font-sans">${payment.amount.toLocaleString()}</span>
                  </div>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5" />
                    {new Date(payment.date).toLocaleDateString('ar-SA')}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachments */}
      {shipment.attachments && shipment.attachments.length > 0 && (
        <div className="px-2 pb-2">
          <DocumentAttachment
            attachments={shipment.attachments}
            onAttachmentsChange={() => {}}
            compact
            readOnly
          />
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-border mt-1">
        {shipment.paymentStatus !== 'paid' && canEdit && (
          <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] gap-1" onClick={onAddPayment}>
            <CreditCard className="h-3 w-3" />
            تسجيل دفعة
          </Button>
        )}
        {canEdit && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
        {canDelete && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
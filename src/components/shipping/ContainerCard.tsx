import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Ship, Package, ChevronDown, ChevronUp, Edit, Trash2, Plus,
  MapPin, DollarSign, Lock, Unlock, Paperclip, User, Eye, EyeOff, Loader2
} from 'lucide-react';
import { DocumentAttachment } from '@/components/shared/DocumentAttachment';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Container, Shipment, AccountOption, FundOption } from '@/types/finance';
import { ShipmentCard } from './ShipmentCard';
import { VisualContainerLoader } from './VisualContainerLoader';
import { StatusTimeline } from './StatusTimeline';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ContainerExpense {
  id: string;
  amount: number;
  description: string;
  date: string;
  contact_id?: string;
}

interface ContainerCardProps {
  container: Container;
  shipments: Shipment[];
  contacts?: AccountOption[];
  funds?: FundOption[];
  onEdit: (container: Container) => void;
  onDelete: (containerId: string) => void;
  onAddShipment: (containerId: string) => void;
  onEditShipment: (shipment: Shipment) => void;
  onDeleteShipment: (shipmentId: string) => void;
  onAddPayment: (shipmentId: string) => void;
  onToggleClosed?: (containerId: string, isClosed: boolean) => void;
  onExpenseChanged?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  loading: { label: 'قيد التحميل', color: 'bg-yellow-500' },
  shipped: { label: 'تم الشحن', color: 'bg-blue-500' },
  arrived: { label: 'وصلت', color: 'bg-purple-500' },
  delivered: { label: 'تم التسليم', color: 'bg-income' },
};

export function ContainerCard({
  container,
  shipments,
  contacts = [],
  funds = [],
  onEdit,
  onDelete,
  onAddShipment,
  onEditShipment,
  onDeleteShipment,
  onAddPayment,
  onToggleClosed,
  onExpenseChanged,
  canEdit = true,
  canDelete = true,
}: ContainerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCostDetails, setShowCostDetails] = useState(false);
  const [extraExpenses, setExtraExpenses] = useState<ContainerExpense[]>([]);
  const [addingExpense, setAddingExpense] = useState(false);
  const [newExpDesc, setNewExpDesc] = useState('');
  const [newExpAmount, setNewExpAmount] = useState('');
  const [newExpContactId, setNewExpContactId] = useState('');
  const [newExpFundId, setNewExpFundId] = useState('');
  const [submittingExpense, setSubmittingExpense] = useState(false);

  const isOverCapacity = container.usedCapacity > container.capacity;
  const isClosed = container.isManuallyClosed;
  const canAddShipment = container.status === 'loading' && !isClosed;
  const status = statusLabels[container.status] || statusLabels.loading;

  // Load extra expenses when expanded
  useEffect(() => {
    if (isExpanded) {
      supabase
        .from('container_expenses')
        .select('id, amount, description, date')
        .eq('container_id', container.id)
        .order('created_at', { ascending: true })
        .then(({ data }) => {
          if (data) setExtraExpenses(data.map(e => ({ ...e, amount: Number(e.amount) })));
        });
    }
  }, [isExpanded, container.id]);

  const extraTotal = extraExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card rounded-xl border shadow-sm overflow-hidden ${isClosed ? 'border-destructive/40' : 'border-border'}`}
      dir="rtl"
    >
      {/* Header */}
      <div className="p-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
              isClosed ? 'bg-destructive/10' : isOverCapacity ? 'bg-destructive/10' : 'bg-primary/10'
            }`}>
              {isClosed ? (
                <Lock className="h-5 w-5 text-destructive" />
              ) : (
                <Ship className={`h-5 w-5 ${isOverCapacity ? 'text-destructive' : 'text-primary'}`} />
              )}
            </div>
            <div>
              <h3 className="font-bold text-sm">
                {container.containerNumber}
                {container.attachments && container.attachments.length > 0 && (
                  <Paperclip className="h-3 w-3 text-primary inline mr-1" />
                )}
              </h3>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{container.type}</Badge>
                <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{container.route}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isClosed && <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">مغلقة</Badge>}
            <Badge className={`${status.color} text-white text-[10px] px-1.5 py-0.5`}>{status.label}</Badge>
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        <VisualContainerLoader container={container} compact />

        <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">الشحنات</p>
            <p className="font-bold text-xs">{shipments.length}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">الإيرادات</p>
            <p className="font-bold text-xs text-income">{container.totalRevenue.toLocaleString('ar-SA')}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">الربح</p>
            <p className={`font-bold text-xs ${container.profit >= 0 ? 'text-income' : 'text-destructive'}`}>
              {container.profit.toLocaleString('ar-SA')}
            </p>
          </div>
        </div>
        {container.createdByName && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
            <User className="h-2.5 w-2.5" />
            <span>بواسطة: <span className="text-primary font-medium">{container.createdByName}</span></span>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              {/* إقفال يدوي */}
              {onToggleClosed && (
                <div 
                  className={`flex items-center justify-between rounded-lg p-3 transition-all cursor-pointer border ${
                    isClosed ? 'bg-destructive/5 border-destructive/20 hover:bg-destructive/10' : 'bg-income/5 border-income/20 hover:bg-income/10'
                  }`}
                  onClick={(e) => { e.stopPropagation(); onToggleClosed(container.id, !isClosed); }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${isClosed ? 'bg-destructive/15' : 'bg-income/15'}`}>
                      {isClosed ? <Lock className="h-4 w-4 text-destructive" /> : <Unlock className="h-4 w-4 text-income" />}
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${isClosed ? 'text-destructive' : 'text-income'}`}>
                        {isClosed ? '🔒 الحاوية مغلقة' : '🔓 الحاوية مفتوحة'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {isClosed ? 'اضغط لفتح الحاوية وإتاحة إضافة شحنات' : 'اضغط لإغلاق الحاوية ومنع إضافة شحنات'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isClosed}
                    onCheckedChange={(checked) => { onToggleClosed(container.id, checked); }}
                    onClick={(e) => e.stopPropagation()}
                    className={isClosed ? 'data-[state=checked]:bg-destructive' : ''}
                  />
                </div>
              )}

              <StatusTimeline 
                currentStatus={container.status} 
                departureDate={container.departureDate}
                arrivalDate={container.arrivalDate}
              />

              {/* التكاليف - مع زر إظهار/إخفاء التفاصيل */}
              <div className="bg-muted/50 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" />
                    التكاليف
                  </h4>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2"
                      onClick={(e) => { e.stopPropagation(); setShowCostDetails(!showCostDetails); }}
                    >
                      {showCostDetails ? <><EyeOff className="h-3 w-3" />إخفاء</> : <><Eye className="h-3 w-3" />تفاصيل</>}
                    </Button>
                    {canEdit && (
                      <Button
                        size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2"
                        onClick={(e) => { e.stopPropagation(); setAddingExpense(!addingExpense); }}
                      >
                        <Plus className="h-3 w-3" />مصروف
                      </Button>
                    )}
                  </div>
                </div>

                {showCostDetails && (
                  <div className="space-y-1 text-[11px]">
                    {container.containerPrice > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">سعر الحاوية:</span><span>${container.containerPrice.toLocaleString()}</span></div>
                    )}
                    {container.shippingCost > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">الشحن:</span><span>${container.shippingCost.toLocaleString()}</span></div>
                    )}
                    {container.customsCost > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">الجمارك:</span><span>${container.customsCost.toLocaleString()}</span></div>
                    )}
                    {container.portCost > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">الميناء:</span><span>${container.portCost.toLocaleString()}</span></div>
                    )}
                    {container.glassFees > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">رسوم الزجاج:</span><span>${container.glassFees.toLocaleString()}</span></div>
                    )}
                    {container.otherCosts > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">أخرى:</span><span>${container.otherCosts.toLocaleString()}</span></div>
                    )}
                    {/* Extra expenses */}
                    {extraExpenses.length > 0 && (
                      <div className="border-t border-border pt-1.5 space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground">مصروفات إضافية:</p>
                        {extraExpenses.map(exp => (
                          <div key={exp.id} className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">{exp.description}:</span>
                            <span className="text-destructive">${exp.amount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Add expense inline form - requires beneficiary */}
                {addingExpense && (
                  <div className="border-t border-border pt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="وصف المصروف" value={newExpDesc} onChange={(e) => setNewExpDesc(e.target.value)} className="h-7 text-[11px]" />
                      <Input type="number" placeholder="المبلغ" value={newExpAmount} onChange={(e) => setNewExpAmount(e.target.value)} className="h-7 text-[11px]" />
                    </div>
                    <Select value={newExpContactId} onValueChange={setNewExpContactId}>
                      <SelectTrigger className="h-7 text-[11px]">
                        <SelectValue placeholder="* المستفيد (إلزامي)" />
                      </SelectTrigger>
                      <SelectContent>
                        {contacts.map(c => (
                          <SelectItem key={c.id} value={c.id} className="text-[11px]">{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newExpFundId || 'none'} onValueChange={(v) => setNewExpFundId(v === 'none' ? '' : v)}>
                      <SelectTrigger className="h-7 text-[11px]">
                        <SelectValue placeholder="الصندوق (اختياري - للسداد الفوري)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-[11px]">بدون سداد فوري</SelectItem>
                        {funds.map(f => (
                          <SelectItem key={f.id} value={f.id} className="text-[11px]">{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm" className="w-full h-7 text-[10px]"
                      disabled={submittingExpense || !newExpDesc.trim() || !(parseFloat(newExpAmount) > 0) || !newExpContactId}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!newExpContactId) { toast.error('يجب اختيار المستفيد'); return; }
                        setSubmittingExpense(true);
                        const { data, error } = await (supabase.rpc as any)('add_container_expense', {
                          p_container_id: container.id,
                          p_amount: parseFloat(newExpAmount),
                          p_description: newExpDesc.trim(),
                          p_contact_id: newExpContactId,
                          p_fund_id: newExpFundId || null,
                        });
                        if (error) { toast.error(error.message || 'خطأ في إضافة المصروف'); }
                        else if (data) {
                          // Reload expenses
                          const { data: refreshed } = await supabase.from('container_expenses')
                            .select('id, amount, description, date, contact_id').eq('container_id', container.id).order('created_at', { ascending: true });
                          if (refreshed) setExtraExpenses(refreshed.map(x => ({ ...x, amount: Number(x.amount) })));
                          setNewExpDesc(''); setNewExpAmount(''); setNewExpContactId(''); setNewExpFundId('');
                          setAddingExpense(false);
                          toast.success('تم إضافة المصروف وتسجيل القيد المحاسبي');
                          onExpenseChanged?.();
                        }
                        setSubmittingExpense(false);
                      }}
                    >
                      {submittingExpense ? <Loader2 className="h-3 w-3 animate-spin" /> : 'إضافة المصروف'}
                    </Button>
                  </div>
                )}

                <div className="flex justify-between pt-1.5 border-t border-border font-bold text-xs">
                  <span>إجمالي التكاليف:</span>
                  <span className="text-destructive">${container.totalCost.toLocaleString()}</span>
                </div>
              </div>

              {/* الشحنات */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" />
                    الشحنات ({shipments.length})
                  </h4>
                  {canAddShipment && canEdit && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2"
                      onClick={(e) => { e.stopPropagation(); onAddShipment(container.id); }}>
                      <Plus className="h-3 w-3" />إضافة
                    </Button>
                  )}
                </div>
                {shipments.length === 0 ? (
                  <div className="text-center py-3 text-xs text-muted-foreground">لا توجد شحنات في هذه الحاوية</div>
                ) : (
                  <div className="space-y-1.5">
                    {shipments.map(shipment => (
                      <ShipmentCard key={shipment.id} shipment={shipment}
                        onEdit={() => onEditShipment(shipment)}
                        onDelete={() => onDeleteShipment(shipment.id)}
                        onAddPayment={() => onAddPayment(shipment.id)}
                        canEdit={canEdit} canDelete={canDelete} />
                    ))}
                  </div>
                )}
              </div>

              {/* Attachments */}
              {container.attachments && container.attachments.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-1">
                    <Paperclip className="h-3.5 w-3.5" />المرفقات ({container.attachments.length})
                  </h4>
                  <DocumentAttachment attachments={container.attachments} onAttachmentsChange={() => {}} compact readOnly />
                </div>
              )}

              {/* Actions */}
              {(canEdit || canDelete) && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  {canEdit && (
                    <Button size="sm" variant="outline" className="flex-1 gap-1 h-8 text-xs"
                      onClick={(e) => { e.stopPropagation(); onEdit(container); }}>
                      <Edit className="h-3.5 w-3.5" />تعديل
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="destructive" className="gap-1 h-8 text-xs"
                      onClick={(e) => { e.stopPropagation(); onDelete(container.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />حذف
                    </Button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

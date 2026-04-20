import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Ship, DollarSign, MapPin, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { ContainerType, ContainerStatus } from '@/types/finance';
import { CONTAINER_CAPACITIES } from '@/constants/shipping';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ContainerFormProps {
  onSubmit: (data: {
    containerNumber: string;
    type: ContainerType;
    capacity: number;
    route: string;
    shippingCost: number;
    customsCost: number;
    portCost: number;
    otherCosts: number;
    status: ContainerStatus;
    departureDate?: string;
    arrivalDate?: string;
    notes?: string;
  }) => void;
  onClose: () => void;
  initialData?: Partial<{
    containerNumber: string;
    type: ContainerType;
    capacity: number;
    route: string;
    shippingCost: number;
    customsCost: number;
    portCost: number;
    otherCosts: number;
    status: ContainerStatus;
    departureDate?: string;
    arrivalDate?: string;
    notes?: string;
    usedCapacity?: number;
  }>;
}

export function ContainerForm({ onSubmit, onClose, initialData }: ContainerFormProps) {
  const [containerNumber, setContainerNumber] = useState(initialData?.containerNumber || '');
  const [type, setType] = useState<ContainerType>(initialData?.type || '40ft');
  const [capacity, setCapacity] = useState(initialData?.capacity || CONTAINER_CAPACITIES['40ft']);
  const [route, setRoute] = useState(initialData?.route || '');
  const [shippingCost, setShippingCost] = useState(initialData?.shippingCost?.toString() || '');
  const [customsCost, setCustomsCost] = useState(initialData?.customsCost?.toString() || '');
  const [portCost, setPortCost] = useState(initialData?.portCost?.toString() || '');
  const [otherCosts, setOtherCosts] = useState(initialData?.otherCosts?.toString() || '');
  const [status, setStatus] = useState<ContainerStatus>(initialData?.status || 'loading');
  const [departureDate, setDepartureDate] = useState<Date | undefined>(
    initialData?.departureDate ? new Date(initialData.departureDate) : undefined
  );
  const [arrivalDate, setArrivalDate] = useState<Date | undefined>(
    initialData?.arrivalDate ? new Date(initialData.arrivalDate) : undefined
  );
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [showClearance, setShowClearance] = useState(
    !!(initialData?.customsCost || initialData?.portCost)
  );

  const usedCapacity = initialData?.usedCapacity || 0;
  const capacityPercentage = (usedCapacity / capacity) * 100;

  const handleTypeChange = (newType: ContainerType) => {
    setType(newType);
    setCapacity(CONTAINER_CAPACITIES[newType]);
  };

  const totalCost = (parseFloat(shippingCost) || 0) + 
                    (parseFloat(customsCost) || 0) + 
                    (parseFloat(portCost) || 0) + 
                    (parseFloat(otherCosts) || 0);

  const handleSubmit = () => {
    if (!containerNumber.trim() || !route.trim()) return;
    
    onSubmit({
      containerNumber: containerNumber.trim(),
      type,
      capacity,
      route: route.trim(),
      shippingCost: parseFloat(shippingCost) || 0,
      customsCost: parseFloat(customsCost) || 0,
      portCost: parseFloat(portCost) || 0,
      otherCosts: parseFloat(otherCosts) || 0,
      status,
      departureDate: departureDate?.toISOString().split('T')[0],
      arrivalDate: arrivalDate?.toISOString().split('T')[0],
      notes: notes.trim() || undefined,
    });
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
          className="bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-card border-b border-border p-3 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Ship className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-base font-bold">{initialData ? 'تعديل الحاوية' : 'حاوية جديدة'}</h2>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Form */}
          <div className="p-3 space-y-3">
            {/* رقم الحاوية ونوعها */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">رقم الحاوية *</Label>
                <Input
                  value={containerNumber}
                  onChange={(e) => setContainerNumber(e.target.value)}
                  placeholder="CONT-123"
                  className="text-right h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع الحاوية</Label>
                <Select value={type} onValueChange={(v) => handleTypeChange(v as ContainerType)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20ft">20 قدم (33 CBM)</SelectItem>
                    <SelectItem value="40ft">40 قدم (67 CBM)</SelectItem>
                    <SelectItem value="40hc">40 HC (76 CBM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* عداد السعة البصري */}
            {initialData && (
              <div className="bg-muted/50 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span>السعة المستخدمة</span>
                  <span className={capacityPercentage > 100 ? 'text-destructive font-bold' : 'text-primary font-bold'}>
                    {usedCapacity.toFixed(1)} / {capacity} CBM
                  </span>
                </div>
                <Progress 
                  value={Math.min(capacityPercentage, 100)} 
                  className={cn("h-2", capacityPercentage > 100 && "[&>div]:bg-destructive")}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>المتبقي: {(capacity - usedCapacity).toFixed(1)} CBM</span>
                  <span>{capacityPercentage.toFixed(0)}%</span>
                </div>
              </div>
            )}

            {/* المسار والحالة */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">المسار *</Label>
                <Input
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                  placeholder="الصين - جدة"
                  className="text-right h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الحالة</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ContainerStatus)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loading">قيد التحميل</SelectItem>
                    <SelectItem value="shipped">تم الشحن</SelectItem>
                    <SelectItem value="arrived">وصلت</SelectItem>
                    <SelectItem value="delivered">تم التسليم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* التواريخ - Date Picker */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">تاريخ المغادرة</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-9 justify-start text-right text-sm font-normal",
                        !departureDate && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="ml-2 h-3.5 w-3.5" />
                      {departureDate ? format(departureDate, "dd/MM/yyyy") : "اختر التاريخ"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={departureDate}
                      onSelect={setDepartureDate}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تاريخ الوصول المتوقع</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-9 justify-start text-right text-sm font-normal",
                        !arrivalDate && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="ml-2 h-3.5 w-3.5" />
                      {arrivalDate ? format(arrivalDate, "dd/MM/yyyy") : "اختر التاريخ"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={arrivalDate}
                      onSelect={setArrivalDate}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* تكلفة الشحن */}
            <div className="space-y-1">
              <Label className="text-xs">تكلفة الشحن</Label>
              <Input
                type="number"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
                placeholder="0"
                className="text-right h-9 text-sm"
              />
            </div>

            {/* خيار التخليص */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-between text-xs h-8"
              onClick={() => setShowClearance(!showClearance)}
            >
              <span className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                مصاريف التخليص والميناء
              </span>
              {showClearance ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>

            {showClearance && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="grid grid-cols-3 gap-2"
              >
                <div className="space-y-1">
                  <Label className="text-[10px]">الجمارك</Label>
                  <Input
                    type="number"
                    value={customsCost}
                    onChange={(e) => setCustomsCost(e.target.value)}
                    placeholder="0"
                    className="text-right h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">مصاريف الميناء</Label>
                  <Input
                    type="number"
                    value={portCost}
                    onChange={(e) => setPortCost(e.target.value)}
                    placeholder="0"
                    className="text-right h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">مصاريف أخرى</Label>
                  <Input
                    type="number"
                    value={otherCosts}
                    onChange={(e) => setOtherCosts(e.target.value)}
                    placeholder="0"
                    className="text-right h-8 text-xs"
                  />
                </div>
              </motion.div>
            )}

            {/* إجمالي التكاليف */}
            <div className="flex items-center justify-between bg-destructive/10 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-destructive">إجمالي التكاليف</span>
              <span className="text-base font-bold text-destructive">${totalCost.toLocaleString()}</span>
            </div>

            {/* ملاحظات */}
            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                className="text-right resize-none text-sm"
                rows={2}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-card border-t border-border p-3 flex gap-2">
            <Button variant="outline" className="flex-1 h-10" onClick={onClose}>
              إلغاء
            </Button>
            <Button 
              className="flex-1 h-10" 
              onClick={handleSubmit}
              disabled={!containerNumber.trim() || !route.trim()}
            >
              {initialData ? 'حفظ التعديلات' : 'إضافة الحاوية'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

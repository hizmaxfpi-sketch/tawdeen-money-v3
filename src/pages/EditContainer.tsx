import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Ship, Calendar, MapPin, DollarSign, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSupabaseShipping } from '@/hooks/useSupabaseShipping';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { toast } from 'sonner';

const ORIGIN_COUNTRIES = [
  { id: 'china', label: 'الصين' },
  { id: 'uae', label: 'الإمارات' },
  { id: 'turkey', label: 'تركيا' },
  { id: 'india', label: 'الهند' },
];

const DESTINATION_COUNTRIES = [
  { id: 'saudi', label: 'السعودية' },
  { id: 'uae', label: 'الإمارات' },
  { id: 'kuwait', label: 'الكويت' },
  { id: 'bahrain', label: 'البحرين' },
  { id: 'qatar', label: 'قطر' },
  { id: 'oman', label: 'عمان' },
];

const CONTAINER_CAPACITIES: Record<string, number> = {
  '40ft': 67,
  '20ft': 33,
  '40hc': 76,
};

export default function EditContainer() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const shippingStore = useSupabaseShipping();
  useScrollToTop();

  const container = shippingStore.containers.find(c => c.id === id);

  // Form state
  const [containerNumber, setContainerNumber] = useState('');
  const [type, setType] = useState<'40ft' | '20ft' | '40hc'>('40ft');
  const [originCountry, setOriginCountry] = useState('الصين');
  const [destinationCountry, setDestinationCountry] = useState('السعودية');
  const [departureDate, setDepartureDate] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [rentalDate, setRentalDate] = useState('');
  const [status, setStatus] = useState<'loading' | 'shipped' | 'arrived' | 'cleared' | 'delivered'>('loading');
  const [shippingCost, setShippingCost] = useState('');
  const [customsCost, setCustomsCost] = useState('');
  const [portCost, setPortCost] = useState('');
  const [otherCosts, setOtherCosts] = useState('');
  const [notes, setNotes] = useState('');
  const [showCosts, setShowCosts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load container data
  useEffect(() => {
    if (container) {
      setContainerNumber(container.containerNumber);
      setType(container.type as '40ft' | '20ft' | '40hc');
      setDepartureDate(container.departureDate || '');
      setArrivalDate(container.arrivalDate || '');
      setStatus(container.status);
      setShippingCost(container.shippingCost?.toString() || '');
      setCustomsCost(container.customsCost?.toString() || '');
      setPortCost(container.portCost?.toString() || '');
      setOtherCosts(container.otherCosts?.toString() || '');
      setNotes(container.notes || '');
      // Parse route for origin/destination
      const routeParts = container.route.split(' - ');
      if (routeParts.length >= 2) {
        setOriginCountry(routeParts[0]);
        setDestinationCountry(routeParts[1]);
      }
    }
  }, [container]);

  const capacity = CONTAINER_CAPACITIES[type] || 67;
  const route = `${originCountry} - ${destinationCountry}`;
  
  const totalCost = useMemo(() => {
    return (parseFloat(shippingCost) || 0) +
           (parseFloat(customsCost) || 0) +
           (parseFloat(portCost) || 0) +
           (parseFloat(otherCosts) || 0);
  }, [shippingCost, customsCost, portCost, otherCosts]);

  const handleSubmit = async () => {
    if (!containerNumber.trim()) {
      toast.error('يرجى إدخال رقم الحاوية');
      return;
    }

    setIsSubmitting(true);

    try {
      await shippingStore.updateContainer(id!, {
        containerNumber: containerNumber.trim(),
        type: type as any,
        route,
        status,
        departureDate: departureDate || undefined,
        arrivalDate: arrivalDate || undefined,
        shippingCost: parseFloat(shippingCost) || 0,
        customsCost: parseFloat(customsCost) || 0,
        portCost: parseFloat(portCost) || 0,
        otherCosts: parseFloat(otherCosts) || 0,
        notes: notes.trim() || undefined,
      });

      toast.success('تم تحديث الحاوية بنجاح');
      navigate(-1);
    } catch (error) {
      toast.error('حدث خطأ أثناء تحديث الحاوية');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!container) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">الحاوية غير موجودة</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Ship className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-sm font-semibold">تعديل الحاوية</h1>
            </div>
          </div>
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="container max-w-lg mx-auto px-4 py-6 space-y-4"
      >
        {/* بيانات الحاوية */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-primary">
            <Ship className="h-4 w-4" />
            <span className="text-xs font-semibold">بيانات الحاوية</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">رقم الحاوية *</Label>
              <Input
                value={containerNumber}
                onChange={(e) => setContainerNumber(e.target.value)}
                placeholder="XXXX-123456"
                className="h-10 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">نوع الحاوية</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20ft" className="text-xs">20ft (33 CBM)</SelectItem>
                  <SelectItem value="40ft" className="text-xs">40ft (67 CBM)</SelectItem>
                  <SelectItem value="40hc" className="text-xs">40HC (76 CBM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">بلد المنشأ</Label>
              <Select value={originCountry} onValueChange={setOriginCountry}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORIGIN_COUNTRIES.map(c => (
                    <SelectItem key={c.id} value={c.label} className="text-xs">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">بلد الوصول</Label>
              <Select value={destinationCountry} onValueChange={setDestinationCountry}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DESTINATION_COUNTRIES.map(c => (
                    <SelectItem key={c.id} value={c.label} className="text-xs">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">الحالة</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loading" className="text-xs">قيد التحميل</SelectItem>
                <SelectItem value="shipped" className="text-xs">تم الشحن</SelectItem>
                <SelectItem value="arrived" className="text-xs">وصلت</SelectItem>
                <SelectItem value="cleared" className="text-xs">تم التخليص</SelectItem>
                <SelectItem value="delivered" className="text-xs">تم التسليم</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-primary/10 rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-xs font-medium">السعة</span>
            <span className="text-lg font-bold text-primary">{capacity} CBM</span>
          </div>
        </div>

        {/* التواريخ */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-primary">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-semibold">التواريخ</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">تاريخ الانطلاق</Label>
              <Input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">تاريخ الوصول المقدر</Label>
              <Input
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
          </div>
        </div>

        {/* التكاليف */}
        <Collapsible open={showCosts} onOpenChange={setShowCosts}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-11 text-xs">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                <span>التكاليف</span>
                {totalCost > 0 && (
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px]">
                    ${totalCost.toLocaleString()}
                  </span>
                )}
              </div>
              {showCosts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-card rounded-xl p-4 mt-2 space-y-3 border border-border">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">تكلفة الشحن</Label>
                  <Input
                    type="number"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                    placeholder="0"
                    className="h-10 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">الجمارك</Label>
                  <Input
                    type="number"
                    value={customsCost}
                    onChange={(e) => setCustomsCost(e.target.value)}
                    placeholder="0"
                    className="h-10 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">مصاريف الميناء</Label>
                  <Input
                    type="number"
                    value={portCost}
                    onChange={(e) => setPortCost(e.target.value)}
                    placeholder="0"
                    className="h-10 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">مصاريف أخرى</Label>
                  <Input
                    type="number"
                    value={otherCosts}
                    onChange={(e) => setOtherCosts(e.target.value)}
                    placeholder="0"
                    className="h-10 text-xs"
                  />
                </div>
              </div>
              
              <div className="bg-muted/50 rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-xs font-medium">إجمالي التكاليف</span>
                <span className="text-lg font-bold text-destructive">${totalCost.toLocaleString()}</span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* ملاحظات */}
        <div className="space-y-2">
          <Label className="text-xs">ملاحظات</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات إضافية..."
            className="text-right resize-none text-xs"
            rows={3}
          />
        </div>

        {/* زر الحفظ */}
        <div className="pt-4 pb-8">
          <Button 
            className="w-full h-12 text-sm font-medium gap-2" 
            onClick={handleSubmit}
            disabled={!containerNumber.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                حفظ التعديلات
              </>
            )}
          </Button>
        </div>
      </motion.main>
    </div>
  );
}

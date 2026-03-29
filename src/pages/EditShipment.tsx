import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Package, Calculator, User, DollarSign, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseShipping } from '@/hooks/useSupabaseShipping';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function EditShipment() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const shippingStore = useSupabaseShipping();

  const shipment = shippingStore.shipments.find(s => s.id === id);

  const [clientName, setClientName] = useState(shipment?.clientName || '');
  const [goodsType, setGoodsType] = useState(shipment?.goodsType || '');
  const [length, setLength] = useState(shipment?.length?.toString() || '0');
  const [width, setWidth] = useState(shipment?.width?.toString() || '0');
  const [height, setHeight] = useState(shipment?.height?.toString() || '0');
  const [quantity, setQuantity] = useState(shipment?.quantity?.toString() || '1');
  const [pricePerMeter, setPricePerMeter] = useState(shipment?.pricePerMeter?.toString() || '0');
  const [trackingNumber, setTrackingNumber] = useState(shipment?.trackingNumber || '');
  const [notes, setNotes] = useState(shipment?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cbm = useMemo(() => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const q = parseInt(quantity) || 1;
    return l * w * h * q;
  }, [length, width, height, quantity]);

  const contractPrice = useMemo(() => {
    return cbm * (parseFloat(pricePerMeter) || 0);
  }, [cbm, pricePerMeter]);

  if (!shipment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">الشحنة غير موجودة</p>
          <Button size="sm" className="mt-3" onClick={() => navigate(-1)}>رجوع</Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!goodsType.trim()) {
      toast.error('يرجى تحديد نوع البضاعة');
      return;
    }

    setIsSubmitting(true);
    try {
      await shippingStore.updateShipment(shipment.id, {
        clientName: clientName.trim() || shipment.clientName,
        goodsType: goodsType.trim(),
        length: parseFloat(length) || 0,
        width: parseFloat(width) || 0,
        height: parseFloat(height) || 0,
        quantity: parseInt(quantity) || 1,
        pricePerMeter: parseFloat(pricePerMeter) || 0,
        trackingNumber: trackingNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success('تم تعديل الشحنة بنجاح');
      navigate(-1);
    } catch (err) {
      console.error('Edit shipment error:', err);
      toast.error('خطأ في تعديل الشحنة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-sm font-semibold">تعديل الشحنة</h1>
            </div>
          </div>
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="container max-w-lg mx-auto px-4 py-6 space-y-4"
      >
        {/* بيانات العميل */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-primary">
            <User className="h-4 w-4" />
            <span className="text-xs font-semibold">بيانات العميل</span>
          </div>
          <div className="space-y-2">
            <Label className="text-[11px]">اسم العميل</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="h-10 text-xs" />
          </div>
          <div className="space-y-2">
            <Label className="text-[11px]">نوع البضاعة *</Label>
            <Input value={goodsType} onChange={(e) => setGoodsType(e.target.value)} className="h-10 text-xs" />
          </div>
        </div>

        {/* الأبعاد */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-primary">
            <Calculator className="h-4 w-4" />
            <span className="text-xs font-semibold">الأبعاد والحجم</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">الطول (م)</Label>
              <Input type="number" value={length} onChange={(e) => setLength(e.target.value)} className="h-10 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">العرض (م)</Label>
              <Input type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="h-10 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">الارتفاع (م)</Label>
              <Input type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="h-10 text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">الكمية</Label>
              <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-10 text-xs" />
            </div>
            <div className="bg-primary/5 rounded-lg p-2 flex flex-col items-center justify-center">
              <span className="text-[10px] text-muted-foreground">الحجم</span>
              <span className="text-sm font-bold text-primary">{cbm.toFixed(3)} CBM</span>
            </div>
          </div>
        </div>

        {/* التسعير */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-primary">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-semibold">التسعير</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">سعر المتر ($)</Label>
              <Input type="number" value={pricePerMeter} onChange={(e) => setPricePerMeter(e.target.value)} className="h-10 text-xs" />
            </div>
            <div className="bg-primary/5 rounded-lg p-2 flex flex-col items-center justify-center">
              <span className="text-[10px] text-muted-foreground">المقاولة</span>
              <span className="text-sm font-bold text-primary">${contractPrice.toLocaleString('en-US')}</span>
            </div>
          </div>
        </div>

        {/* معلومات إضافية */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <div className="space-y-2">
            <Label className="text-[11px]">رقم التتبع</Label>
            <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="h-10 text-xs" />
          </div>
          <div className="space-y-2">
            <Label className="text-[11px]">ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="text-xs min-h-[60px]" />
          </div>
        </div>

        {/* زر الحفظ */}
        <Button className="w-full h-12 gap-2 text-sm font-bold" onClick={handleSubmit} disabled={isSubmitting}>
          <Save className="h-4 w-4" />
          {isSubmitting ? 'جاري الحفظ...' : 'حفظ التعديلات'}
        </Button>
      </motion.main>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Package, Calculator, User, Search, Shirt, Cog, Apple, Smartphone, Sofa, Camera, ChevronDown, ChevronUp, Weight, DollarSign, Anchor, Truck, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentAttachment } from '@/components/shared/DocumentAttachment';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSupabaseShipping } from '@/hooks/useSupabaseShipping';
import { useSupabaseFinance } from '@/hooks/useSupabaseFinance';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { COMMON_PRICES, GOODS_CATEGORIES } from '@/constants/shipping';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ShipmentOCRScanner } from '@/components/shipping/ShipmentOCRScanner';

// أيقونات البضائع
const GoodsIcons: Record<string, any> = {
  clothes: Shirt,
  machines: Cog,
  food: Apple,
  electronics: Smartphone,
  furniture: Sofa,
  other: Package,
};

export default function AddShipment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedContainerId = searchParams.get('containerId') || '';
  
  const shippingStore = useSupabaseShipping();
  const financeStore = useSupabaseFinance();
  const contactStore = useSupabaseContacts();
  
  // الحقول الأساسية
  const [containerId, setContainerId] = useState(preSelectedContainerId);
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showOCRScanner, setShowOCRScanner] = useState(false);
  
  // بيانات العميل والشحنة
  const [clientCode, setClientCode] = useState('');
  const [selectedGoodsCategory, setSelectedGoodsCategory] = useState<string>('');
  const [customGoodsType, setCustomGoodsType] = useState('');
  
  // الأبعاد والحجم
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [weight, setWeight] = useState('');
  
  // الأسعار
  const [pricePerMeter, setPricePerMeter] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [receivingFundId, setReceivingFundId] = useState(''); // الصندوق المستلم للدفعة
  
  // CBM مخصص
  const [useCustomCBM, setUseCustomCBM] = useState(false);
  const [customCBM, setCustomCBM] = useState('');
  
  // المصاريف الإضافية
  const [showExpenses, setShowExpenses] = useState(false);
  const [chinaExpenses, setChinaExpenses] = useState('');
  const [seaFreight, setSeaFreight] = useState('');
  const [portDeliveryFees, setPortDeliveryFees] = useState('');
  const [customsFees, setCustomsFees] = useState('');
  const [internalTransportFees, setInternalTransportFees] = useState('');
  
  // بيانات إضافية
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [shipmentAttachments, setShipmentAttachments] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // الحاويات المتاحة للتحميل فقط
  const availableContainers = shippingStore.containers.filter(c => c.status === 'loading');

  // جهات الاتصال (العملاء)
  const clients = useMemo(() =>
    contactStore.contacts.filter(c => c.type === 'client'),
    [contactStore.contacts]
  );
  
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 10);
    return clients.filter(c =>
      c.name.toLowerCase().includes(clientSearch.toLowerCase())
    );
  }, [clients, clientSearch]);

  const selectedClient = clients.find(c => c.id === clientId);

  // عند اختيار عميل - تعبئة رمز العميل تلقائياً
  const handleClientSelect = (client: typeof clients[0]) => {
    setClientId(client.id);
    setClientSearch(client.name);
    // تعبئة رمز العميل تلقائياً
    setClientCode(`C-${client.id.slice(0, 6).toUpperCase()}`);
    setShowClientDropdown(false);
  };

  // حساب الحجم التلقائي أو استخدام القيمة المخصصة
  const calculatedCBM = useMemo(() => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const q = parseInt(quantity) || 1;
    return l * w * h * q;
  }, [length, width, height, quantity]);

  // CBM النهائي (مخصص أو محسوب)
  const cbm = useMemo(() => {
    if (useCustomCBM && customCBM) {
      return parseFloat(customCBM) || 0;
    }
    return calculatedCBM;
  }, [useCustomCBM, customCBM, calculatedCBM]);

  // حساب سعر المقاولة تلقائياً
  const contractPrice = useMemo(() => {
    const price = parseFloat(pricePerMeter) || 0;
    return cbm * price;
  }, [cbm, pricePerMeter]);

  // حساب إجمالي المصاريف الإضافية
  const totalAdditionalExpenses = useMemo(() => {
    return (parseFloat(chinaExpenses) || 0) +
           (parseFloat(seaFreight) || 0) +
           (parseFloat(portDeliveryFees) || 0) +
           (parseFloat(customsFees) || 0) +
           (parseFloat(internalTransportFees) || 0);
  }, [chinaExpenses, seaFreight, portDeliveryFees, customsFees, internalTransportFees]);

  // حساب المتبقي (سعر المقاولة + المصاريف - المدفوع)
  const remaining = useMemo(() => {
    const paid = parseFloat(amountPaid) || 0;
    const totalDue = contractPrice + totalAdditionalExpenses;
    return Math.max(0, totalDue - paid);
  }, [contractPrice, totalAdditionalExpenses, amountPaid]);

  // المساحة المتبقية في الحاوية
  const container = shippingStore.containers.find(c => c.id === containerId);
  const remainingCapacity = containerId ? shippingStore.getRemainingCapacity(containerId) : 0;
  const willOverflow = cbm > remainingCapacity && containerId;
  const capacityPercentage = container ? ((container.usedCapacity + cbm) / container.capacity) * 100 : 0;

  // نوع البضاعة النهائي
  const goodsType = selectedGoodsCategory === 'other' 
    ? customGoodsType 
    : GOODS_CATEGORIES.find(g => g.id === selectedGoodsCategory)?.label || customGoodsType;

  const handleSubmit = async () => {
    if (!containerId) {
      toast.error('يرجى اختيار الحاوية');
      return;
    }
    if (!clientId) {
      toast.error('يرجى اختيار العميل');
      return;
    }
    if (!goodsType.trim()) {
      toast.error('يرجى تحديد نوع البضاعة');
      return;
    }
    if (cbm <= 0 && !useCustomCBM) {
      toast.error('يرجى إدخال الأبعاد أو تفعيل CBM مخصص');
      return;
    }
    
    if (willOverflow) {
      toast.warning(`⚠️ المساحة المتبقية (${remainingCapacity.toFixed(2)} CBM) لا تكفي!`, {
        action: {
          label: 'إضافة على أي حال',
          onClick: () => submitData(),
        },
      });
      return;
    }
    
    await submitData();
  };

  const submitData = async () => {
    setIsSubmitting(true);
    
    try {
      const shipmentData = {
        containerId,
        clientId,
        clientName: selectedClient?.name || '',
        clientCode: clientCode.trim() || undefined,
        goodsType: goodsType.trim(),
        length: parseFloat(length) || 0,
        width: parseFloat(width) || 0,
        height: parseFloat(height) || 0,
        quantity: parseInt(quantity) || 1,
        cbm, // CBM محسوب أو مخصص
        weight: parseFloat(weight) || undefined,
        pricePerMeter: parseFloat(pricePerMeter) || 0,
        amountPaid: parseFloat(amountPaid) || 0,
        chinaExpenses: parseFloat(chinaExpenses) || undefined,
        seaFreight: parseFloat(seaFreight) || undefined,
        portDeliveryFees: parseFloat(portDeliveryFees) || undefined,
        customsFees: parseFloat(customsFees) || undefined,
        internalTransportFees: parseFloat(internalTransportFees) || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      
      // إرسال fundId ضمن البيانات ليتم تمريره للـ RPC
      const fundId = receivingFundId || financeStore.funds[0]?.id || undefined;
      const result = await shippingStore.addShipment({ ...shipmentData, fundId, attachments: shipmentAttachments });
      if (!result) {
        setIsSubmitting(false);
        return;
      }
      
      navigate(-1);
    } catch (error) {
      toast.error('حدث خطأ أثناء إضافة الشحنة');
    } finally {
      setIsSubmitting(false);
    }
  };

  // معالج بيانات OCR
  const handleOCRData = (data: any) => {
    if (data.clientName) {
      setClientSearch(data.clientName);
      const matchedClient = clients.find(c =>
        c.name.toLowerCase().includes(data.clientName.toLowerCase())
      );
      if (matchedClient) {
        handleClientSelect(matchedClient);
      }
    }
    if (data.goodsType) {
      setSelectedGoodsCategory('other');
      setCustomGoodsType(data.goodsType);
    }
    if (data.dimensions) {
      if (data.dimensions.length) setLength(data.dimensions.length);
      if (data.dimensions.width) setWidth(data.dimensions.width);
      if (data.dimensions.height) setHeight(data.dimensions.height);
    }
    toast.success('تم تعبئة البيانات من المستند');
  };

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
                <Package className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-sm font-semibold">شحنة جديدة</h1>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-1 text-xs"
            onClick={() => setShowOCRScanner(true)}
          >
            <Camera className="h-4 w-4" />
            مسح ذكي
          </Button>
        </div>
      </header>

      {/* Form */}
      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="container max-w-lg mx-auto px-4 py-6 space-y-4"
      >
        {/* قسم 1: اختيار الحاوية */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-primary">
            <Package className="h-4 w-4" />
            <span className="text-xs font-semibold">الحاوية الأم</span>
          </div>
          
          <Select value={containerId} onValueChange={setContainerId}>
            <SelectTrigger className="h-11 text-xs">
              <SelectValue placeholder="اختر الحاوية" />
            </SelectTrigger>
            <SelectContent>
              {availableContainers.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  لا توجد حاويات متاحة للتحميل
                </div>
              ) : (
                availableContainers.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.containerNumber} ({c.type}) - متبقي {shippingStore.getRemainingCapacity(c.id).toFixed(1)} CBM
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          
          {/* عداد السعة البصري */}
          {containerId && (
            <div className="space-y-1">
              <Progress 
                value={Math.min(capacityPercentage, 100)} 
                className={cn("h-2", capacityPercentage > 100 && "[&>div]:bg-destructive")}
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span className={willOverflow ? 'text-destructive font-bold' : ''}>
                  {willOverflow ? '⚠️ تجاوز السعة!' : `متبقي: ${(remainingCapacity - cbm).toFixed(2)} CBM`}
                </span>
                <span>{capacityPercentage.toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>

        {/* قسم 2: الحساب الدفتري */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-primary">
            <User className="h-4 w-4" />
            <span className="text-xs font-semibold">الحساب الدفتري</span>
          </div>
          
          {/* بحث العميل */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value);
                setShowClientDropdown(true);
              }}
              onFocus={() => setShowClientDropdown(true)}
              placeholder={selectedClient ? selectedClient.name : "ابحث عن العميل..."}
              className="text-right h-11 pr-10 text-xs"
            />
            
            {showClientDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute z-20 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto"
              >
                {filteredClients.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">
                    لا يوجد عملاء مطابقين
                  </div>
                ) : (
                  filteredClients.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(
                        "w-full text-right px-4 py-3 hover:bg-muted transition-colors text-xs flex items-center justify-between",
                        clientId === c.id && "bg-primary/10 text-primary"
                      )}
                      onClick={() => handleClientSelect(c)}
                    >
                      <span>{c.name}</span>
                      <span className="text-[10px] text-muted-foreground">عميل</span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </div>
          
          {/* رمز العميل */}
          <div className="space-y-1">
            <Label className="text-[11px]">رمز العميل</Label>
            <Input
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value)}
              placeholder="يُملأ تلقائياً"
              className="text-right h-10 text-xs"
              disabled={!clientId}
            />
          </div>
        </div>

        {/* قسم 3: نوع البضاعة */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <Label className="text-xs font-semibold">نوع البضاعة *</Label>
          <div className="grid grid-cols-6 gap-2">
            {GOODS_CATEGORIES.map(cat => {
              const Icon = GoodsIcons[cat.id] || Package;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={cn(
                    "flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all",
                    selectedGoodsCategory === cat.id 
                      ? "border-primary bg-primary/10 text-primary" 
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => setSelectedGoodsCategory(cat.id)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] leading-tight">{cat.label}</span>
                </button>
              );
            })}
          </div>
          
          {selectedGoodsCategory === 'other' && (
            <Input
              value={customGoodsType}
              onChange={(e) => setCustomGoodsType(e.target.value)}
              placeholder="حدد نوع البضاعة"
              className="text-right h-10 mt-2 text-xs"
            />
          )}
        </div>

        {/* قسم 4: الأبعاد والحجم */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-primary">
            <Calculator className="h-4 w-4" />
            <span className="text-xs font-semibold">الأبعاد والحجم</span>
          </div>
          
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">الطول (م)</Label>
              <Input
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="0.00"
                className="text-center h-10 text-xs"
                step="0.01"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">العرض (م)</Label>
              <Input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="0.00"
                className="text-center h-10 text-xs"
                step="0.01"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">الارتفاع (م)</Label>
              <Input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="0.00"
                className="text-center h-10 text-xs"
                step="0.01"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">العدد</Label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
                className="text-center h-10 text-xs"
                min="1"
              />
            </div>
          </div>
          
          {/* الوزن */}
          <div className="flex items-center gap-2">
            <Weight className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <Input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="الوزن (كجم) - اختياري"
                className="text-right h-10 text-xs"
                step="0.1"
              />
            </div>
          </div>
          
          {/* نتيجة CBM مع خيار مخصص */}
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-primary/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">الحجم (CBM)</span>
                <button
                  type="button"
                  onClick={() => setUseCustomCBM(!useCustomCBM)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full transition-colors",
                    useCustomCBM 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-muted-foreground hover:bg-primary/20"
                  )}
                >
                  {useCustomCBM ? 'مخصص ✓' : 'مخصص'}
                </button>
              </div>
              <span className={cn(
                "text-lg font-bold",
                willOverflow ? "text-destructive" : "text-primary"
              )}>
                {cbm.toFixed(3)}
              </span>
            </div>
            
            {useCustomCBM && (
              <Input
                type="number"
                value={customCBM}
                onChange={(e) => setCustomCBM(e.target.value)}
                placeholder="أدخل قيمة CBM مخصصة"
                className="text-center h-10 text-xs"
                step="0.001"
              />
            )}
          </div>
        </div>

        {/* قسم 5: الأسعار */}
        <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-primary">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-semibold">التسعير</span>
          </div>
          
          <div className="space-y-2">
            <Label className="text-[11px]">سعر المتر على العميل</Label>
            <div className="flex flex-wrap gap-2">
              {COMMON_PRICES.map(p => (
                <Button
                  key={p}
                  type="button"
                  variant={pricePerMeter === p.toString() ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => setPricePerMeter(p.toString())}
                >
                  {p.toLocaleString('ar-SA')}
                </Button>
              ))}
            </div>
            <Input
              type="number"
              value={pricePerMeter}
              onChange={(e) => setPricePerMeter(e.target.value)}
              placeholder="أو أدخل سعر مخصص"
              className="text-right h-10 text-xs"
            />
          </div>
          
          {/* المبلغ المدفوع واختيار الصندوق */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">المبلغ المستلم</Label>
              <Input
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="0"
                className="text-right h-10 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">إلى صندوق</Label>
              <Select value={receivingFundId} onValueChange={setReceivingFundId}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="اختر الصندوق" />
                </SelectTrigger>
                <SelectContent>
                  {financeStore.funds.map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* قسم 6: المصاريف الإضافية */}
        <Collapsible open={showExpenses} onOpenChange={setShowExpenses}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-11 text-xs">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span>المصاريف الإضافية</span>
                {totalAdditionalExpenses > 0 && (
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px]">
                    ${totalAdditionalExpenses.toLocaleString()}
                  </span>
                )}
              </div>
              {showExpenses ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-card rounded-xl p-4 mt-2 space-y-3 border border-border">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    مصاريف الصين
                  </Label>
                  <Input
                    type="number"
                    value={chinaExpenses}
                    onChange={(e) => setChinaExpenses(e.target.value)}
                    placeholder="0"
                    className="text-right h-10 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1">
                    <Anchor className="h-3 w-3" />
                    الشحن البحري
                  </Label>
                  <Input
                    type="number"
                    value={seaFreight}
                    onChange={(e) => setSeaFreight(e.target.value)}
                    placeholder="0"
                    className="text-right h-10 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1">
                    <Anchor className="h-3 w-3" />
                    مصاريف الميناء
                  </Label>
                  <Input
                    type="number"
                    value={portDeliveryFees}
                    onChange={(e) => setPortDeliveryFees(e.target.value)}
                    placeholder="0"
                    className="text-right h-10 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    الجمارك
                  </Label>
                  <Input
                    type="number"
                    value={customsFees}
                    onChange={(e) => setCustomsFees(e.target.value)}
                    placeholder="0"
                    className="text-right h-10 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] flex items-center gap-1">
                  <Truck className="h-3 w-3" />
                  أجور النقل الداخلي
                </Label>
                <Input
                  type="number"
                  value={internalTransportFees}
                  onChange={(e) => setInternalTransportFees(e.target.value)}
                  placeholder="0"
                  className="text-right h-10 text-xs"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* ملخص المالية */}
        <div className="bg-muted/50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span>سعر المقاولة</span>
            <span className="font-bold text-primary">${contractPrice.toLocaleString()}</span>
          </div>
          {totalAdditionalExpenses > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span>المصاريف الإضافية</span>
              <span className="font-medium">${totalAdditionalExpenses.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-xs">
            <span>الإجمالي</span>
            <span className="font-bold">${(contractPrice + totalAdditionalExpenses).toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span>المستلم</span>
            <span className="font-medium text-income">${(parseFloat(amountPaid) || 0).toLocaleString()}</span>
          </div>
          <div className="border-t border-border pt-2 flex justify-between items-center">
            <span className="text-xs font-medium">المتبقي</span>
            <span className={cn(
              "text-base font-bold",
              remaining > 0 ? "text-destructive" : "text-income"
            )}>
              ${remaining.toLocaleString()}
            </span>
          </div>
        </div>

        {/* رقم التتبع */}
        <div className="space-y-2">
          <Label className="text-xs">رقم التتبع (اختياري)</Label>
          <Input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="رقم التتبع أو الباركود"
            className="text-right h-10 text-xs"
          />
        </div>

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

        {/* المرفقات */}
        <DocumentAttachment
          attachments={shipmentAttachments}
          onAttachmentsChange={setShipmentAttachments}
          maxFiles={5}
        />

        {/* زر الحفظ */}
        <div className="pt-4 pb-8">
          <Button 
            className="w-full h-12 text-sm font-medium" 
            onClick={handleSubmit}
            disabled={!containerId || !clientId || !goodsType.trim() || isSubmitting}
          >
            {isSubmitting ? 'جاري الإضافة...' : 'إضافة الشحنة'}
          </Button>
        </div>
      </motion.main>

      {/* OCR Scanner Modal */}
      {showOCRScanner && (
        <ShipmentOCRScanner
          onDataExtracted={handleOCRData}
          onClose={() => setShowOCRScanner(false)}
        />
      )}
    </div>
  );
}

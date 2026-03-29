import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Package, Calculator, User, Ruler, Copy, Search, Camera, UserPlus,
  DollarSign, ChevronDown, ChevronUp, Truck, Ship, Scale,
  Shirt, Cog, Apple, Smartphone, Sofa, Sparkles, Gamepad2, Wrench, Hammer, Layers, Square
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentAttachment } from '@/components/shared/DocumentAttachment';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Container } from '@/types/finance';
import { Contact } from '@/types/contacts';
import { GOODS_CATEGORIES_EXTENDED, COMMON_PRICES_EXTENDED } from '@/types/shipping-extended';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ShipmentOCRScanner } from './ShipmentOCRScanner';

interface ShipmentFormEnhancedProps {
  containers: Container[];
  clients: Contact[];
  selectedContainerId?: string;
  onSubmit: (data: {
    containerId: string;
    clientId: string;
    clientCode?: string;
    clientName: string;
    recipientName?: string;
    goodsType: string;
    length: number;
    width: number;
    height: number;
    quantity: number;
    weight: number;
    pricePerMeter: number;
    amountPaid: number;
    chinaExpenses: number;
    seaFreight: number;
    portDeliveryFees: number;
    customsFees: number;
    internalTransportFees: number;
    domesticShippingCost: number;
    transitCost: number;
    packageNumber?: string;
    trackingNumber?: string;
    notes?: string;
  }) => void;
  onClose: () => void;
  getRemainingCapacity: (containerId: string) => number;
}

// أيقونات البضائع
const GoodsIcons: Record<string, any> = {
  clothes: Shirt,
  machines: Cog,
  food: Apple,
  electronics: Smartphone,
  furniture: Sofa,
  cosmetics: Sparkles,
  toys: Gamepad2,
  spare_parts: Wrench,
  building_materials: Hammer,
  fabrics: Layers,
  glass: Square,
  other: Package,
};

export function ShipmentFormEnhanced({ 
  containers, 
  clients, 
  selectedContainerId, 
  onSubmit, 
  onClose,
  getRemainingCapacity,
}: ShipmentFormEnhancedProps) {
  // بيانات الحاوية
  const [containerId, setContainerId] = useState(selectedContainerId || '');
  
  // بيانات العميل
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [clientCode, setClientCode] = useState('');
  const [recipientName, setRecipientName] = useState('');
  
  // نوع البضاعة
  const [selectedGoodsCategory, setSelectedGoodsCategory] = useState<string>('');
  const [customGoodsType, setCustomGoodsType] = useState('');
  
  // الأبعاد والحجم
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [weight, setWeight] = useState('');
  
  // التسعير
  const [pricePerMeter, setPricePerMeter] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  
  // المصاريف الإضافية
  const [chinaExpenses, setChinaExpenses] = useState('');
  const [seaFreight, setSeaFreight] = useState('');
  const [portDeliveryFees, setPortDeliveryFees] = useState('');
  const [customsFees, setCustomsFees] = useState('');
  const [internalTransportFees, setInternalTransportFees] = useState('');
  const [domesticShippingCost, setDomesticShippingCost] = useState('');
  const [transitCost, setTransitCost] = useState('');
  
  // رقم الباكج
  const [packageNumber, setPackageNumber] = useState('');
  
  // تفاصيل إضافية
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [shipmentAttachments, setShipmentAttachments] = useState<string[]>([]);
  
  // حالة العرض
  const [showOCRScanner, setShowOCRScanner] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);

  // حساب الحجم التلقائي CBM
  const cbm = useMemo(() => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const q = parseInt(quantity) || 1;
    return l * w * h * q;
  }, [length, width, height, quantity]);

  // حساب سعر المقاولة
  const contractPrice = useMemo(() => {
    const price = parseFloat(pricePerMeter) || 0;
    return cbm * price;
  }, [cbm, pricePerMeter]);

  // حساب إجمالي المصاريف الإضافية
  const totalExpenses = useMemo(() => {
    return (
      (parseFloat(chinaExpenses) || 0) +
      (parseFloat(seaFreight) || 0) +
      (parseFloat(portDeliveryFees) || 0) +
      (parseFloat(customsFees) || 0) +
      (parseFloat(internalTransportFees) || 0) +
      (parseFloat(domesticShippingCost) || 0) +
      (parseFloat(transitCost) || 0)
    );
  }, [chinaExpenses, seaFreight, portDeliveryFees, customsFees, internalTransportFees, domesticShippingCost, transitCost]);

  // حساب المتبقي
  const remaining = useMemo(() => {
    const paid = parseFloat(amountPaid) || 0;
    return Math.max(0, contractPrice - paid);
  }, [contractPrice, amountPaid]);

  // المساحة المتبقية في الحاوية
  const container = containers.find(c => c.id === containerId);
  const remainingCapacity = containerId ? getRemainingCapacity(containerId) : 0;
  const willOverflow = cbm > remainingCapacity && containerId;
  const capacityPercentage = container ? ((container.usedCapacity + cbm) / container.capacity) * 100 : 0;

  // تصفية العملاء من جهات الاتصال
  const filteredClients = useMemo(() => {
    const clientList = clients.filter(c => c.status === 'active');
    if (!clientSearch.trim()) return clientList.slice(0, 10);
    return clientList.filter(c => 
      c.name.toLowerCase().includes(clientSearch.toLowerCase())
    );
  }, [clients, clientSearch]);

  const selectedClient = clients.find(c => c.id === clientId);

  // نوع البضاعة النهائي
  const goodsType = selectedGoodsCategory === 'other' 
    ? customGoodsType 
    : GOODS_CATEGORIES_EXTENDED.find(g => g.id === selectedGoodsCategory)?.label || customGoodsType;

  // تحديث رمز العميل عند اختياره
  const handleClientSelect = (client: Contact) => {
    setClientId(client.id);
    setClientSearch(client.name);
    setClientCode(client.id.slice(0, 8).toUpperCase()); // رمز تلقائي
    setShowClientDropdown(false);
  };

  const handleSubmit = () => {
    if (!containerId || !clientId || !goodsType.trim() || cbm <= 0) {
      toast.error('يرجى ملء جميع البيانات المطلوبة');
      return;
    }
    
    if (willOverflow) {
      toast.warning(`⚠️ المساحة المتبقية (${remainingCapacity.toFixed(2)} CBM) لا تكفي`, {
        duration: 5000,
        action: {
          label: 'إضافة على أي حال',
          onClick: () => submitData(),
        },
      });
      return;
    }
    
    submitData();
  };

  const submitData = () => {
    onSubmit({
      containerId,
      clientId,
      clientCode: clientCode.trim() || undefined,
      clientName: selectedClient?.name || '',
      recipientName: recipientName.trim() || undefined,
      goodsType: goodsType.trim(),
      length: parseFloat(length) || 0,
      width: parseFloat(width) || 0,
      height: parseFloat(height) || 0,
      quantity: parseInt(quantity) || 1,
      weight: parseFloat(weight) || 0,
      pricePerMeter: parseFloat(pricePerMeter) || 0,
      amountPaid: parseFloat(amountPaid) || 0,
      chinaExpenses: parseFloat(chinaExpenses) || 0,
      seaFreight: parseFloat(seaFreight) || 0,
      portDeliveryFees: parseFloat(portDeliveryFees) || 0,
      customsFees: parseFloat(customsFees) || 0,
      internalTransportFees: parseFloat(internalTransportFees) || 0,
      domesticShippingCost: parseFloat(domesticShippingCost) || 0,
      transitCost: parseFloat(transitCost) || 0,
      packageNumber: packageNumber.trim() || undefined,
      trackingNumber: trackingNumber.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    toast.success(`تم إضافة الشحنة - ${cbm.toFixed(2)} CBM`);
  };

  const handleDuplicate = () => {
    if (!containerId || !clientId || !goodsType.trim() || cbm <= 0) {
      toast.error('أكمل البيانات أولاً');
      return;
    }
    submitData();
  };

  // الحاويات المتاحة للتحميل
  const availableContainers = containers.filter(c => c.status === 'loading');

  // معالج OCR
  const handleOCRData = (data: any) => {
    if (data.clientName) {
      setClientSearch(data.clientName);
      const matchedClient = clients.find(c => 
        c.name.toLowerCase().includes(data.clientName.toLowerCase())
      );
      if (matchedClient) handleClientSelect(matchedClient);
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
    <>
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
            className="bg-card w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-card border-b border-border p-3 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-sm font-bold">شحنة جديدة</h2>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 gap-1 text-[11px]"
                  onClick={() => setShowOCRScanner(true)}
                >
                  <Camera className="h-3.5 w-3.5" />
                  مسح ذكي
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Form Content */}
            <div className="p-3 space-y-4">

              {/* ============= قسم: اختيار الحاوية ============= */}
              <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
                  <Ship className="h-3.5 w-3.5" />
                  الحاوية
                </h3>
                
                <Select value={containerId} onValueChange={setContainerId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="اختر الحاوية" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableContainers.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground text-center">
                        لا توجد حاويات متاحة للتحميل
                      </div>
                    ) : (
                      availableContainers.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.containerNumber} ({c.type}) - متبقي {getRemainingCapacity(c.id).toFixed(1)} CBM
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                
                {/* عداد السعة */}
                {containerId && (
                  <div className="space-y-1">
                    <Progress 
                      value={Math.min(capacityPercentage, 100)} 
                      className={cn("h-1.5", capacityPercentage > 100 && "[&>div]:bg-destructive")}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span className={willOverflow ? 'text-destructive font-bold' : ''}>
                        {willOverflow ? '⚠️ تجاوز السعة!' : `متبقي: ${(remainingCapacity - cbm).toFixed(2)} CBM`}
                      </span>
                      <span>{capacityPercentage.toFixed(0)}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ============= قسم: بيانات العميل ============= */}
              <div className="bg-muted/30 rounded-xl p-3 space-y-3">
                <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
                  <User className="h-3.5 w-3.5" />
                  بيانات العميل
                </h3>
                
                <div className="grid grid-cols-2 gap-2">
                  {/* البحث عن العميل */}
                  <div className="space-y-1 relative col-span-2">
                    <Label className="text-[11px] font-medium">اسم العميل *</Label>
                    <div className="relative">
                      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={clientSearch}
                        onChange={(e) => {
                          setClientSearch(e.target.value);
                          setShowClientDropdown(true);
                        }}
                        onFocus={() => setShowClientDropdown(true)}
                        placeholder="ابحث عن العميل..."
                        className="text-right h-9 text-xs pr-8"
                      />
                    </div>
                    
                    {showClientDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute z-20 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto"
                      >
                        {filteredClients.length === 0 ? (
                          <div className="p-2 text-[11px] text-muted-foreground text-center">
                            لا يوجد عملاء
                          </div>
                        ) : (
                          filteredClients.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={cn(
                                "w-full text-right px-3 py-2 text-xs hover:bg-muted transition-colors",
                                clientId === c.id && "bg-primary/10 text-primary"
                              )}
                              onClick={() => handleClientSelect(c)}
                            >
                              {c.name}
                            </button>
                          ))
                        )}
                      </motion.div>
                    )}
                  </div>

                  {/* رمز العميل */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium">رمز العميل</Label>
                    <Input
                      value={clientCode}
                      onChange={(e) => setClientCode(e.target.value)}
                      placeholder="تلقائي"
                      className="text-right h-9 text-xs bg-muted/50"
                    />
                  </div>

                  {/* اسم المستلم */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium">اسم المستلم</Label>
                    <Input
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="اختياري"
                      className="text-right h-9 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* ============= قسم: نوع البضاعة ============= */}
              <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
                  <Package className="h-3.5 w-3.5" />
                  نوع البضاعة *
                </h3>
                
                <div className="grid grid-cols-6 gap-1">
                  {GOODS_CATEGORIES_EXTENDED.map(cat => {
                    const Icon = GoodsIcons[cat.id] || Package;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={cn(
                          "flex flex-col items-center gap-0.5 p-1.5 rounded-lg border transition-all",
                          selectedGoodsCategory === cat.id 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-border hover:border-primary/50"
                        )}
                        onClick={() => setSelectedGoodsCategory(cat.id)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-[9px] leading-tight">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
                
                {selectedGoodsCategory === 'other' && (
                  <Input
                    value={customGoodsType}
                    onChange={(e) => setCustomGoodsType(e.target.value)}
                    placeholder="اكتب نوع البضاعة..."
                    className="text-right h-8 text-xs mt-1.5"
                  />
                )}
              </div>

              {/* ============= قسم: الأبعاد والحجم ============= */}
              <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
                    <Ruler className="h-3.5 w-3.5" />
                    الأبعاد والحجم
                  </h3>
                  <span className={cn(
                    "text-sm font-bold",
                    willOverflow ? 'text-destructive' : 'text-primary'
                  )}>
                    {cbm.toFixed(3)} CBM
                  </span>
                </div>
                
                <div className="grid grid-cols-5 gap-1.5">
                  <div className="space-y-0.5">
                    <Label className="text-[10px]">الطول (م)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      placeholder="0"
                      className="text-center text-xs h-8"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px]">العرض (م)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder="0"
                      className="text-center text-xs h-8"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px]">الارتفاع (م)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="0"
                      className="text-center text-xs h-8"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px]">الكمية</Label>
                    <Input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="1"
                      className="text-center text-xs h-8"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px]">الوزن (كغ)</Label>
                    <Input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="0"
                      className="text-center text-xs h-8"
                    />
                  </div>
                </div>
              </div>

              {/* ============= قسم: التسعير ============= */}
              <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
                  <Calculator className="h-3.5 w-3.5" />
                  التسعير
                </h3>
                
                {/* أزرار سريعة لسعر المتر */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">سعر المتر على العميل</Label>
                  <div className="flex gap-1 flex-wrap">
                    {COMMON_PRICES_EXTENDED.map(price => (
                      <Button
                        key={price}
                        type="button"
                        variant={pricePerMeter === price.toString() ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-[10px] px-2"
                        onClick={() => setPricePerMeter(price.toString())}
                      >
                        ${price}
                      </Button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    value={pricePerMeter}
                    onChange={(e) => setPricePerMeter(e.target.value)}
                    placeholder="سعر مخصص"
                    className="text-right h-8 text-xs"
                  />
                </div>
                
                {/* المبلغ المستلم */}
                <div className="space-y-0.5">
                  <Label className="text-[11px] font-medium">المبلغ المستلم</Label>
                  <Input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="0"
                    className="text-right h-8 text-xs bg-income/5 border-income/30"
                  />
                </div>

                {/* الملخص المالي */}
                <div className="space-y-1 pt-2 border-t border-border">
                  <div className="flex items-center justify-between text-[11px]">
                    <span>سعر المقاولة</span>
                    <span className="font-bold text-primary">${contractPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>المستلم</span>
                    <span className="font-bold text-income">${(parseFloat(amountPaid) || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>المتبقي</span>
                    <span className={cn("font-bold", remaining > 0 ? 'text-destructive' : 'text-income')}>
                      ${remaining.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* ============= قسم: المصاريف الإضافية (قابل للطي) ============= */}
              <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-xs h-8 p-0 hover:bg-transparent"
                  onClick={() => setShowExpenses(!showExpenses)}
                >
                  <span className="flex items-center gap-1.5 font-bold text-primary">
                    <DollarSign className="h-3.5 w-3.5" />
                    المصاريف الإضافية
                    {totalExpenses > 0 && (
                      <span className="text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded">
                        ${totalExpenses.toFixed(2)}
                      </span>
                    )}
                  </span>
                  {showExpenses ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>

                {showExpenses && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="space-y-2"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">المصاريف داخل الصين</Label>
                        <Input
                          type="number"
                          value={chinaExpenses}
                          onChange={(e) => setChinaExpenses(e.target.value)}
                          placeholder="0"
                          className="text-right h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">الشحن البحري</Label>
                        <Input
                          type="number"
                          value={seaFreight}
                          onChange={(e) => setSeaFreight(e.target.value)}
                          placeholder="0"
                          className="text-right h-8 text-xs"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">مصاريف الميناء للتسليم</Label>
                        <Input
                          type="number"
                          value={portDeliveryFees}
                          onChange={(e) => setPortDeliveryFees(e.target.value)}
                          placeholder="0"
                          className="text-right h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">الجمارك</Label>
                        <Input
                          type="number"
                          value={customsFees}
                          onChange={(e) => setCustomsFees(e.target.value)}
                          placeholder="0"
                          className="text-right h-8 text-xs"
                        />
                      </div>
                    </div>
                    
                     <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">أجور النقل الداخلي للمستلم</Label>
                        <Input
                          type="number"
                          value={internalTransportFees}
                          onChange={(e) => setInternalTransportFees(e.target.value)}
                          placeholder="0"
                          className="text-right h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px]">تكلفة الشحن الداخلي</Label>
                        <Input
                          type="number"
                          value={domesticShippingCost}
                          onChange={(e) => setDomesticShippingCost(e.target.value)}
                          placeholder="0"
                          className="text-right h-8 text-xs"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">تكلفة الترانزيت</Label>
                      <Input
                        type="number"
                        value={transitCost}
                        onChange={(e) => setTransitCost(e.target.value)}
                        placeholder="0"
                        className="text-right h-8 text-xs"
                      />
                    </div>
                  </motion.div>
                )}
              </div>

              {/* ============= قسم: تفاصيل إضافية ============= */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[10px]">رقم الباكج</Label>
                  <Input
                    value={packageNumber}
                    onChange={(e) => setPackageNumber(e.target.value)}
                    placeholder="تلقائي"
                    className="text-right h-8 text-xs bg-muted/50"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">رقم التتبع</Label>
                  <Input
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="TRACK-123"
                    className="text-right h-8 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">ملاحظات</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="ملاحظات..."
                    className="text-right h-8 text-xs"
                  />
                </div>
              </div>

              {/* المرفقات */}
              <DocumentAttachment
                attachments={shipmentAttachments}
                onAttachmentsChange={setShipmentAttachments}
                maxFiles={5}
              />
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-card border-t border-border p-3 flex gap-2">
              <Button variant="outline" className="h-10 text-xs" onClick={onClose}>
                إلغاء
              </Button>
              <Button 
                variant="secondary"
                className="h-10 gap-1 text-xs"
                onClick={handleDuplicate}
                disabled={!containerId || !clientId || !goodsType.trim() || cbm <= 0}
              >
                <Copy className="h-3.5 w-3.5" />
                تكرار
              </Button>
              <Button 
                className="flex-1 h-10 text-xs" 
                onClick={handleSubmit}
                disabled={!containerId || !clientId || !goodsType.trim() || cbm <= 0}
              >
                إضافة الشحنة
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* OCR Scanner */}
      {showOCRScanner && (
        <ShipmentOCRScanner
          onDataExtracted={handleOCRData}
          onClose={() => setShowOCRScanner(false)}
        />
      )}
    </>
  );
}

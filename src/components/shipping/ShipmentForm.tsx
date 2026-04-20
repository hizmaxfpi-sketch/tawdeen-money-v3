import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Calculator, User, Ruler, Copy, Shirt, Cog, Apple, Smartphone, Sofa, Search, Camera, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { LedgerAccount, Container, GoodsCategory } from '@/types/finance';
import { ContactOption, CreateContactInput } from '@/types/contacts';
import { COMMON_PRICES, GOODS_CATEGORIES } from '@/constants/shipping';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ShipmentOCRScanner } from './ShipmentOCRScanner';
import { QuickAddContact } from '@/components/contacts/QuickAddContact';

interface ShipmentFormProps {
  containers: Container[];
  clients: LedgerAccount[];
  contactClients?: ContactOption[]; // جهات الاتصال من نوع عميل
  selectedContainerId?: string;
  onSubmit: (data: {
    containerId: string;
    clientId: string;
    clientName: string;
    goodsType: string;
    length: number;
    width: number;
    height: number;
    quantity: number;
    pricePerMeter: number;
    amountPaid: number;
    trackingNumber?: string;
    notes?: string;
  }) => void;
  onClose: () => void;
  getRemainingCapacity: (containerId: string) => number;
  onDuplicate?: (data: any) => void;
  onAddContact?: (data: CreateContactInput) => void; // لإضافة جهة اتصال سريعة
}

// أيقونات البضائع
const GoodsIcons: Record<string, any> = {
  clothes: Shirt,
  machines: Cog,
  food: Apple,
  electronics: Smartphone,
  furniture: Sofa,
  other: Package,
};

export function ShipmentForm({ 
  containers, 
  clients, 
  selectedContainerId, 
  onSubmit, 
  onClose,
  getRemainingCapacity,
  onDuplicate
}: ShipmentFormProps) {
  const [containerId, setContainerId] = useState(selectedContainerId || '');
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showOCRScanner, setShowOCRScanner] = useState(false);
  const [selectedGoodsCategory, setSelectedGoodsCategory] = useState<string>('');
  const [customGoodsType, setCustomGoodsType] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [pricePerMeter, setPricePerMeter] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');

  // حساب الحجم التلقائي بالمتر المكعب: (L × W × H × Qty) / 1,000,000
  // إذا كانت الأبعاد بالسنتيمتر نقسم على 1,000,000، وإذا كانت بالمتر لا نحتاج للقسمة
  const cbm = useMemo(() => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const q = parseInt(quantity) || 1;
    // افتراض أن الأبعاد بالمتر (كما هو موضح في الواجهة)
    return l * w * h * q;
  }, [length, width, height, quantity]);

  // حساب سعر المقاولة تلقائياً: CBM × سعر المتر
  const contractPrice = useMemo(() => {
    const price = parseFloat(pricePerMeter) || 0;
    return cbm * price;
  }, [cbm, pricePerMeter]);

  // حساب المتبقي تلقائياً: سعر المقاولة - المستلم
  const remaining = useMemo(() => {
    const paid = parseFloat(amountPaid) || 0;
    return Math.max(0, contractPrice - paid);
  }, [contractPrice, amountPaid]);

  // المساحة المتبقية في الحاوية
  const container = containers.find(c => c.id === containerId);
  const remainingCapacity = containerId ? getRemainingCapacity(containerId) : 0;
  const willOverflow = cbm > remainingCapacity && containerId;
  const capacityPercentage = container ? ((container.usedCapacity + cbm) / container.capacity) * 100 : 0;

  // تحديد العملاء الأخيرين (آخر 5 تم التعامل معهم)
  const recentClientIds = useMemo(() => {
    // جمع معرفات العملاء من الشحنات الأخيرة
    const clientIds = new Set<string>();
    const sortedShipments = [...(containers.flatMap(c => c) || [])];
    // نستخدم clients مباشرة للحصول على آخر 5 عملاء
    return clients
      .filter(c => c.type === 'client')
      .slice(-5)
      .map(c => c.id);
  }, [clients]);

  // تصفية العملاء: آخر 5 عملاء أولاً ثم الباقي
  const filteredClients = useMemo(() => {
    const clientList = clients.filter(c => c.type === 'client');
    
    // ترتيب: العملاء الأخيرين أولاً
    const sortedClients = [...clientList].sort((a, b) => {
      const aIsRecent = recentClientIds.includes(a.id);
      const bIsRecent = recentClientIds.includes(b.id);
      if (aIsRecent && !bIsRecent) return -1;
      if (!aIsRecent && bIsRecent) return 1;
      return 0;
    });
    
    if (!clientSearch.trim()) return sortedClients;
    return sortedClients.filter(c => 
      c.name.toLowerCase().includes(clientSearch.toLowerCase())
    );
  }, [clients, clientSearch, recentClientIds]);

  const selectedClient = clients.find(c => c.id === clientId);

  // نوع البضاعة النهائي
  const goodsType = selectedGoodsCategory === 'other' 
    ? customGoodsType 
    : GOODS_CATEGORIES.find(g => g.id === selectedGoodsCategory)?.label || customGoodsType;

  const handleSubmit = () => {
    // التحقق من البيانات الأساسية
    if (!containerId || !clientId || !goodsType.trim() || cbm <= 0) {
      toast.error('يرجى ملء جميع البيانات المطلوبة');
      return;
    }
    
    // تنبيه ذكي عند تجاوز السعة
    if (willOverflow) {
      toast.warning(`⚠️ انتبه! المساحة المتبقية (${remainingCapacity.toFixed(2)} CBM) لا تكفي لهذا الطرد (${cbm.toFixed(2)} CBM)`, {
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
    const data = {
      containerId,
      clientId,
      clientName: selectedClient?.name || '',
      goodsType: goodsType.trim(),
      length: parseFloat(length) || 0,
      width: parseFloat(width) || 0,
      height: parseFloat(height) || 0,
      quantity: parseInt(quantity) || 1,
      pricePerMeter: parseFloat(pricePerMeter) || 0,
      amountPaid: parseFloat(amountPaid) || 0,
      trackingNumber: trackingNumber.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    
    onSubmit(data);
    toast.success(`تم إضافة الشحنة بنجاح - ${cbm.toFixed(2)} CBM`);
  };

  const handleDuplicate = () => {
    if (!containerId || !clientId || !goodsType.trim() || cbm <= 0) {
      toast.error('أكمل البيانات أولاً');
      return;
    }
    
    const data = {
      containerId,
      clientId,
      clientName: selectedClient?.name || '',
      goodsType: goodsType.trim(),
      length: parseFloat(length) || 0,
      width: parseFloat(width) || 0,
      height: parseFloat(height) || 0,
      quantity: parseInt(quantity) || 1,
      pricePerMeter: parseFloat(pricePerMeter) || 0,
      amountPaid: parseFloat(amountPaid) || 0,
      trackingNumber: trackingNumber.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    
    onSubmit(data);
    toast.success('تم إضافة الشحنة، يمكنك التعديل وإضافة أخرى');
  };

  // الحاويات المتاحة للتحميل فقط
  const availableContainers = containers.filter(c => c.status === 'loading');

  // معالج بيانات OCR
  const handleOCRData = (data: any) => {
    if (data.clientName) {
      setClientSearch(data.clientName);
      // محاولة إيجاد العميل في القائمة
      const matchedClient = clients.find(c => 
        c.name.toLowerCase().includes(data.clientName.toLowerCase()) ||
        data.clientName.toLowerCase().includes(c.name.toLowerCase())
      );
      if (matchedClient) {
        setClientId(matchedClient.id);
        setClientSearch(matchedClient.name);
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
          className="bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-card border-b border-border p-3 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-base font-bold">شحنة جديدة</h2>
            </div>
            <div className="flex items-center gap-1">
              {/* زر مسح OCR */}
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 gap-1 text-xs"
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

          {/* Form */}
          <div className="p-3 space-y-3">
            {/* اختيار الحاوية مع عداد بصري */}
            <div className="space-y-1.5">
              <Label className="text-xs">الحاوية الأم *</Label>
              <Select value={containerId} onValueChange={setContainerId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="اختر الحاوية" />
                </SelectTrigger>
                <SelectContent>
                  {availableContainers.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
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
              
              {/* عداد السعة البصري */}
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

            {/* بحث وتحديد العميل - Searchable Dropdown */}
            <div className="space-y-1.5 relative">
              <Label className="text-xs flex items-center gap-1">
                <User className="h-3 w-3" />
                العميل *
              </Label>
              <div className="relative">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setShowClientDropdown(true);
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  placeholder={selectedClient ? selectedClient.name : "ابحث عن العميل..."}
                  className="text-right h-9 text-sm pr-8"
                />
              </div>
              
              {/* Dropdown للعملاء */}
              {showClientDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute z-20 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto"
                >
                  {filteredClients.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      لا يوجد عملاء مسجلين
                    </div>
                  ) : (
                    <>
                      {/* العملاء الأخيرين */}
                      {recentClientIds.length > 0 && !clientSearch.trim() && (
                        <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/50 border-b border-border">
                          آخر العملاء
                        </div>
                      )}
                      {filteredClients.map((c, index) => {
                        const isRecent = recentClientIds.includes(c.id);
                        const showDivider = !clientSearch.trim() && index === recentClientIds.length && recentClientIds.length > 0;
                        return (
                          <>
                            {showDivider && (
                              <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/50 border-b border-border">
                                جميع العملاء
                              </div>
                            )}
                            <button
                              key={c.id}
                              type="button"
                              className={cn(
                                "w-full text-right px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between",
                                clientId === c.id && "bg-primary/10 text-primary",
                                isRecent && !clientSearch.trim() && "bg-primary/5"
                              )}
                              onClick={() => {
                                setClientId(c.id);
                                setClientSearch(c.name);
                                setShowClientDropdown(false);
                              }}
                            >
                              <span>{c.name}</span>
                              {isRecent && !clientSearch.trim() && (
                                <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">حديث</span>
                              )}
                            </button>
                          </>
                        );
                      })}
                    </>
                  )}
                </motion.div>
              )}
            </div>

            {/* نوع البضاعة - أيقونات اختيار سريع */}
            <div className="space-y-1.5">
              <Label className="text-xs">نوع البضاعة *</Label>
              <div className="grid grid-cols-6 gap-1.5">
                {GOODS_CATEGORIES.map(cat => {
                  const Icon = GoodsIcons[cat.id] || Package;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={cn(
                        "flex flex-col items-center gap-0.5 p-2 rounded-lg border transition-all",
                        selectedGoodsCategory === cat.id 
                          ? "border-primary bg-primary/10 text-primary" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setSelectedGoodsCategory(cat.id)}
                    >
                      <Icon className="h-4 w-4" />
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
                  className="text-right h-8 text-sm mt-1.5"
                />
              )}
            </div>

            {/* الأبعاد - مضغوطة */}
            <div className="bg-muted/50 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold flex items-center gap-1">
                  <Ruler className="h-3.5 w-3.5" />
                  الأبعاد (بالمتر)
                </h3>
                <span className={cn(
                  "text-sm font-bold",
                  willOverflow ? 'text-destructive' : 'text-primary'
                )}>
                  {cbm.toFixed(3)} CBM
                </span>
              </div>
              
              <div className="grid grid-cols-4 gap-1.5">
                <div className="space-y-0.5">
                  <Label className="text-[10px]">الطول (L)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    placeholder="0"
                    className="text-center text-sm h-8"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">العرض (W)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    placeholder="0"
                    className="text-center text-sm h-8"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">الارتفاع (H)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="0"
                    className="text-center text-sm h-8"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">الكمية</Label>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="1"
                    className="text-center text-sm h-8"
                  />
                </div>
              </div>
            </div>

            {/* التسعير مع أزرار سريعة */}
            <div className="bg-muted/50 rounded-lg p-2.5 space-y-2">
              <h3 className="text-xs font-semibold flex items-center gap-1">
                <Calculator className="h-3.5 w-3.5" />
                الحسابات المالية
              </h3>
              
              {/* سعر المتر - أزرار سريعة */}
              <div className="space-y-1">
                <Label className="text-[10px]">سعر المتر المكعب</Label>
                <div className="flex gap-1">
                  {COMMON_PRICES.map(price => (
                    <Button
                      key={price}
                      type="button"
                      variant={pricePerMeter === price.toString() ? "default" : "outline"}
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => setPricePerMeter(price.toString())}
                    >
                      {price}
                    </Button>
                  ))}
                </div>
                <Input
                  type="number"
                  value={pricePerMeter}
                  onChange={(e) => setPricePerMeter(e.target.value)}
                  placeholder="سعر مخصص"
                  className="text-right h-8 text-sm"
                />
              </div>
              
              {/* المبلغ المستلم */}
              <div className="space-y-0.5">
                <Label className="text-[10px]">المبلغ المستلم</Label>
                <Input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0"
                  className="text-right h-8 text-sm bg-income/5 border-income/30"
                />
              </div>

              {/* الملخص المالي */}
              <div className="space-y-1 pt-2 border-t border-border">
                <div className="flex items-center justify-between text-xs">
                  <span>سعر المقاولة</span>
                  <span className="font-bold text-primary">${contractPrice.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>المستلم</span>
                  <span className="font-bold text-income">${(parseFloat(amountPaid) || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>المتبقي</span>
                  <span className={cn("font-bold", remaining > 0 ? 'text-destructive' : 'text-income')}>
                    ${remaining.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* رقم التتبع والملاحظات */}
            <div className="grid grid-cols-2 gap-2">
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
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-card border-t border-border p-3 flex gap-2">
            <Button variant="outline" className="h-10" onClick={onClose}>
              إلغاء
            </Button>
            <Button 
              variant="secondary"
              className="h-10 gap-1"
              onClick={handleDuplicate}
              disabled={!containerId || !clientId || !goodsType.trim() || cbm <= 0}
            >
              <Copy className="h-3.5 w-3.5" />
              تكرار
            </Button>
            <Button 
              className="flex-1 h-10" 
              onClick={handleSubmit}
              disabled={!containerId || !clientId || !goodsType.trim() || cbm <= 0}
            >
              إضافة الشحنة
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>

    {/* OCR Scanner Modal */}
    {showOCRScanner && (
      <ShipmentOCRScanner
        onDataExtracted={handleOCRData}
        onClose={() => setShowOCRScanner(false)}
      />
    )}
    </>
  );
}

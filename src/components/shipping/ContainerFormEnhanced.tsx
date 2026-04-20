import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Ship, DollarSign, MapPin, Calendar, ChevronDown, ChevronUp, 
  Package, Globe, Clock, Calculator, Ruler, Users, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentAttachment } from '@/components/shared/DocumentAttachment';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { ContainerType, ContainerStatus } from '@/types/finance';
import { CONTAINER_CAPACITIES } from '@/constants/shipping';
import { SearchableCountrySelect } from '@/components/shared/SearchableCountrySelect';
import { POPULAR_ORIGIN_IDS, POPULAR_DESTINATION_IDS, getCountryLabel } from '@/data/countries';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, differenceInDays } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ContainerFormEnhancedProps {
  onSubmit: (data: {
    containerNumber: string;
    type: ContainerType;
    capacity: number;
    route: string;
    originCountry: string;
    destinationCountry: string;
    shippingCost: number;
    customsCost: number;
    portCost: number;
    otherCosts: number;
    containerPrice: number;
    glassFees: number;
    rentalDays: number;
    loadingDays: number;
    costPerMeter: number;
    status: ContainerStatus;
    departureDate?: string;
    rentalDate?: string;
    arrivalDate?: string;
    notes?: string;
    shippingAgentId?: string;
  }) => void;
  onClose: () => void;
  initialData?: any;
}

export function ContainerFormEnhanced({ onSubmit, onClose, initialData }: ContainerFormEnhancedProps) {
  const { user } = useAuth();
  
  // البيانات الأساسية
  const [containerNumber, setContainerNumber] = useState(initialData?.containerNumber || '');
  const [type, setType] = useState<ContainerType | 'custom'>(initialData?.type || '40ft');
  const [customType, setCustomType] = useState('');
  const [capacity, setCapacity] = useState(initialData?.capacity || CONTAINER_CAPACITIES['40ft']);

  // وكيل الشحن
  const [shippingAgentId, setShippingAgentId] = useState<string | null>(initialData?.shippingAgentId || null);
  const [shippingAgentSearch, setShippingAgentSearch] = useState('');
  const [agentContacts, setAgentContacts] = useState<{ id: string; name: string; type: string; balance: number }[]>([]);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);

  // بلد المنشأ والوصول
  const [originCountry, setOriginCountry] = useState(initialData?.originCountry || 'CN');
  const [destinationCountry, setDestinationCountry] = useState(initialData?.destinationCountry || 'SA');
  
  // التواريخ
  const [departureDate, setDepartureDate] = useState<Date | undefined>(
    initialData?.departureDate ? new Date(initialData.departureDate) : undefined
  );
  const [rentalDate, setRentalDate] = useState<Date | undefined>(
    initialData?.rentalDate ? new Date(initialData.rentalDate) : undefined
  );
  const [arrivalDate, setArrivalDate] = useState<Date | undefined>(
    initialData?.arrivalDate ? new Date(initialData.arrivalDate) : undefined
  );
  
  // أيام الإيجار والتحميل
  const [loadingDays, setLoadingDays] = useState(initialData?.loadingDays?.toString() || '');
  
  // التكاليف
  const [containerPrice, setContainerPrice] = useState(initialData?.containerPrice?.toString() || '');
  const [shippingCost, setShippingCost] = useState(initialData?.shippingCost?.toString() || '');
  const [customsCost, setCustomsCost] = useState(initialData?.customsCost?.toString() || '');
  const [portCost, setPortCost] = useState(initialData?.portCost?.toString() || '');
  const [glassFees, setGlassFees] = useState(initialData?.glassFees?.toString() || '');
  const [otherCosts, setOtherCosts] = useState(initialData?.otherCosts?.toString() || '');
  
  // الحالة والملاحظات
  const [status, setStatus] = useState<ContainerStatus>(initialData?.status || 'loading');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [containerAttachments, setContainerAttachments] = useState<string[]>(initialData?.attachments || []);
  
  // أقسام قابلة للطي
  const [showDates, setShowDates] = useState(true);
  const [showCosts, setShowCosts] = useState(true);

  // جلب جميع جهات الاتصال (بدون قيد على النوع)
  useEffect(() => {
    if (!user) return;
    const fetchContacts = async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, type, balance')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('name');
      if (data) setAgentContacts(data.map(c => ({ id: c.id, name: c.name, type: c.type, balance: Number(c.balance) })));
    };
    fetchContacts();
  }, [user]);

  const filteredAgentContacts = useMemo(() => {
    if (!shippingAgentSearch.trim()) return agentContacts;
    return agentContacts.filter(c => c.name.toLowerCase().includes(shippingAgentSearch.toLowerCase()));
  }, [agentContacts, shippingAgentSearch]);

  const selectedAgent = agentContacts.find(c => c.id === shippingAgentId);
  
  const usedCapacity = initialData?.usedCapacity || 0;
  const capacityPercentage = (usedCapacity / capacity) * 100;

  // حساب أيام الإيجار تلقائياً
  const rentalDays = useMemo(() => {
    if (rentalDate && departureDate) {
      return differenceInDays(departureDate, rentalDate);
    }
    return 0;
  }, [rentalDate, departureDate]);

  // حساب إجمالي التكاليف
  const totalCost = useMemo(() => {
    return (
      (parseFloat(containerPrice) || 0) +
      (parseFloat(shippingCost) || 0) +
      (parseFloat(customsCost) || 0) +
      (parseFloat(portCost) || 0) +
      (parseFloat(glassFees) || 0) +
      (parseFloat(otherCosts) || 0)
    );
  }, [containerPrice, shippingCost, customsCost, portCost, glassFees, otherCosts]);

  // حساب سعر التكلفة لكل متر
  const costPerMeter = useMemo(() => {
    if (capacity <= 0) return 0;
    return totalCost / capacity;
  }, [totalCost, capacity]);

  const handleTypeChange = (newType: ContainerType | 'custom') => {
    setType(newType);
    if (newType !== 'custom') {
      setCapacity(CONTAINER_CAPACITIES[newType]);
    }
  };

  // تحديد المسار
  const getRoute = () => {
    const origin = getCountryLabel(originCountry);
    const dest = getCountryLabel(destinationCountry);
    return `${origin} - ${dest}`;
  };

  const handleSubmit = () => {
    if (!containerNumber.trim()) return;
    
    const finalType = type === 'custom' ? '40ft' : type; // fallback type for DB
    
    onSubmit({
      containerNumber: containerNumber.trim(),
      type: finalType as ContainerType,
      capacity,
      route: getRoute(),
      originCountry: originCountry,
      destinationCountry: destinationCountry,
      containerPrice: parseFloat(containerPrice) || 0,
      shippingCost: parseFloat(shippingCost) || 0,
      customsCost: parseFloat(customsCost) || 0,
      portCost: parseFloat(portCost) || 0,
      glassFees: parseFloat(glassFees) || 0,
      otherCosts: parseFloat(otherCosts) || 0,
      rentalDays,
      loadingDays: parseInt(loadingDays) || 0,
      costPerMeter,
      status,
      departureDate: departureDate?.toISOString().split('T')[0],
      rentalDate: rentalDate?.toISOString().split('T')[0],
      arrivalDate: arrivalDate?.toISOString().split('T')[0],
      notes: notes.trim() || undefined,
      shippingAgentId: shippingAgentId || undefined,
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
          className="bg-card w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-card border-b border-border p-3 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Ship className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-sm font-bold">{initialData ? 'تعديل الحاوية' : 'حاوية جديدة'}</h2>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Form Content */}
          <div className="p-3 space-y-4">
            
            {/* ============= قسم: بيانات الحاوية الأساسية ============= */}
            <div className="bg-muted/30 rounded-xl p-3 space-y-3">
              <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
                <Package className="h-3.5 w-3.5" />
                بيانات الحاوية
              </h3>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">رقم الحاوية *</Label>
                  <Input
                    value={containerNumber}
                    onChange={(e) => setContainerNumber(e.target.value)}
                    placeholder="CONT-123456"
                    className="text-right h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">نوع الحاوية</Label>
                  <Select value={type} onValueChange={(v) => handleTypeChange(v as ContainerType | 'custom')}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20ft">20 قدم (33 CBM)</SelectItem>
                      <SelectItem value="40ft">40 قدم (67 CBM)</SelectItem>
                      <SelectItem value="40hc">40 HC (76 CBM)</SelectItem>
                      <SelectItem value="custom">مخصص</SelectItem>
                    </SelectContent>
                  </Select>
                  {type === 'custom' && (
                    <Input
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                      placeholder="نوع مخصص..."
                      className="text-right h-8 text-xs mt-1"
                    />
                  )}
                </div>
              </div>

              {/* السعة */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">سعة الحاوية (CBM)</Label>
                  <Input
                    type="number"
                    value={capacity}
                    onChange={(e) => setCapacity(parseFloat(e.target.value) || 0)}
                    className="text-right h-9 text-xs bg-muted/50"
                    readOnly={type !== 'custom'}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">الحالة</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as ContainerStatus)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="loading">🔄 قيد التحميل</SelectItem>
                      <SelectItem value="shipped">🚢 تم الشحن</SelectItem>
                      <SelectItem value="arrived">📍 وصلت</SelectItem>
                      <SelectItem value="cleared">✅ تم التخليص</SelectItem>
                      <SelectItem value="delivered">📦 تم التسليم</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* عداد السعة للتعديل */}
              {initialData && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span>السعة المستخدمة</span>
                    <span className={cn(
                      "font-bold",
                      capacityPercentage > 100 ? 'text-destructive' : 'text-primary'
                    )}>
                      {usedCapacity.toFixed(1)} / {capacity} CBM
                    </span>
                  </div>
                  <Progress 
                    value={Math.min(capacityPercentage, 100)} 
                    className={cn("h-2", capacityPercentage > 100 && "[&>div]:bg-destructive")}
                  />
                </div>
              )}
            </div>

            {/* ============= قسم: المسار (بلد المنشأ والوصول) ============= */}
            <div className="bg-muted/30 rounded-xl p-3 space-y-3">
              <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
                <Globe className="h-3.5 w-3.5" />
                المسار
              </h3>
              
              <div className="grid grid-cols-2 gap-2">
                {/* بلد المنشأ */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">بلد المنشأ *</Label>
                  <SearchableCountrySelect
                    value={originCountry}
                    onChange={setOriginCountry}
                    popularIds={POPULAR_ORIGIN_IDS}
                    placeholder="اختر بلد المنشأ"
                  />
                </div>
                
                {/* بلد الوصول */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">بلد الوصول *</Label>
                  <SearchableCountrySelect
                    value={destinationCountry}
                    onChange={setDestinationCountry}
                    popularIds={POPULAR_DESTINATION_IDS}
                    placeholder="اختر بلد الوصول"
                  />
                </div>
              </div>
            </div>

            {/* ============= قسم: وكيل الشحن ============= */}
            <div className="bg-muted/30 rounded-xl p-3 space-y-3">
              <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
                <Users className="h-3.5 w-3.5" />
                شركة / وكيل الشحن
              </h3>
              
              <div className="space-y-1 relative">
                <Label className="text-[11px] font-medium">اختر وكيل الشحن (اختياري)</Label>
                <div className="relative">
                  <Input
                    value={selectedAgent ? selectedAgent.name : shippingAgentSearch}
                    onChange={(e) => {
                      setShippingAgentSearch(e.target.value);
                      setShippingAgentId(null);
                      setShowAgentDropdown(true);
                    }}
                    onFocus={() => setShowAgentDropdown(true)}
                    placeholder="ابحث عن وكيل الشحن..."
                    className="text-right h-9 text-xs pr-8"
                  />
                  <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
                
                {showAgentDropdown && filteredAgentContacts.length > 0 && !selectedAgent && (
                  <div className="absolute z-20 w-full bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto mt-1">
                    {filteredAgentContacts.map(contact => (
                      <button
                        key={contact.id}
                        type="button"
                        className="w-full text-right px-3 py-2 text-xs hover:bg-accent flex items-center justify-between gap-2"
                        onClick={() => {
                          setShippingAgentId(contact.id);
                          setShippingAgentSearch('');
                          setShowAgentDropdown(false);
                        }}
                      >
                        <span className="font-medium">{contact.name}</span>
                        <span className={cn(
                          "text-[10px] font-bold",
                          contact.balance > 0 ? 'text-income' : contact.balance < 0 ? 'text-expense' : 'text-muted-foreground'
                        )}>
                          {contact.balance !== 0 ? `${contact.balance > 0 ? '+' : ''}${contact.balance.toLocaleString('ar-SA')}` : '0'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                
                {selectedAgent && (
                  <div className="flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2 mt-1">
                    <span className="text-xs font-medium">{selectedAgent.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-bold",
                        selectedAgent.balance > 0 ? 'text-income' : selectedAgent.balance < 0 ? 'text-expense' : 'text-muted-foreground'
                      )}>
                        {selectedAgent.balance !== 0 ? `${selectedAgent.balance > 0 ? '+' : ''}${selectedAgent.balance.toLocaleString('ar-SA')}` : '0'}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => { setShippingAgentId(null); setShippingAgentSearch(''); }}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                )}
                
                <p className="text-[10px] text-muted-foreground">
                  سيتم ترحيل تكلفة الحاوية تلقائياً لحساب الوكيل المختار
                </p>
              </div>
            </div>

            {/* ============= قسم: التواريخ والأيام ============= */}
            <div className="bg-muted/30 rounded-xl p-3 space-y-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-between text-xs h-8 p-0 hover:bg-transparent"
                onClick={() => setShowDates(!showDates)}
              >
                <span className="flex items-center gap-1.5 font-bold text-primary">
                  <Clock className="h-3.5 w-3.5" />
                  التواريخ والأيام
                </span>
                {showDates ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>

              {showDates && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {/* تاريخ الإيجار */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">تاريخ الإيجار</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-9 justify-start text-right text-xs font-normal",
                              !rentalDate && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="ml-1 h-3 w-3" />
                            {rentalDate ? format(rentalDate, "dd/MM") : "اختر"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={rentalDate}
                            onSelect={setRentalDate}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* تاريخ الانطلاق */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">تاريخ الانطلاق</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-9 justify-start text-right text-xs font-normal",
                              !departureDate && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="ml-1 h-3 w-3" />
                            {departureDate ? format(departureDate, "dd/MM") : "اختر"}
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

                    {/* تاريخ الوصول المقدر */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">الوصول المقدر</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-9 justify-start text-right text-xs font-normal",
                              !arrivalDate && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="ml-1 h-3 w-3" />
                            {arrivalDate ? format(arrivalDate, "dd/MM") : "اختر"}
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

                  {/* أيام الإيجار والتحميل */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">عدد أيام الإيجار</Label>
                      <Input
                        type="number"
                        value={rentalDays}
                        readOnly
                        className="text-right h-9 text-xs bg-muted/50"
                        placeholder="يُحسب تلقائياً"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">عدد أيام التحميل</Label>
                      <Input
                        type="number"
                        value={loadingDays}
                        onChange={(e) => setLoadingDays(e.target.value)}
                        placeholder="0"
                        className="text-right h-9 text-xs"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* ============= قسم: التكاليف ============= */}
            <div className="bg-muted/30 rounded-xl p-3 space-y-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-between text-xs h-8 p-0 hover:bg-transparent"
                onClick={() => setShowCosts(!showCosts)}
              >
                <span className="flex items-center gap-1.5 font-bold text-primary">
                  <DollarSign className="h-3.5 w-3.5" />
                  التكاليف المالية
                </span>
                {showCosts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>

              {showCosts && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">سعر الحاوية</Label>
                      <Input
                        type="number"
                        value={containerPrice}
                        onChange={(e) => setContainerPrice(e.target.value)}
                        placeholder="0"
                        className="text-right h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">تكلفة الشحن البحري</Label>
                      <Input
                        type="number"
                        value={shippingCost}
                        onChange={(e) => setShippingCost(e.target.value)}
                        placeholder="0"
                        className="text-right h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">الجمارك</Label>
                      <Input
                        type="number"
                        value={customsCost}
                        onChange={(e) => setCustomsCost(e.target.value)}
                        placeholder="0"
                        className="text-right h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">مصاريف الميناء</Label>
                      <Input
                        type="number"
                        value={portCost}
                        onChange={(e) => setPortCost(e.target.value)}
                        placeholder="0"
                        className="text-right h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">أجور الزجاج</Label>
                      <Input
                        type="number"
                        value={glassFees}
                        onChange={(e) => setGlassFees(e.target.value)}
                        placeholder="0"
                        className="text-right h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">مصاريف أخرى</Label>
                      <Input
                        type="number"
                        value={otherCosts}
                        onChange={(e) => setOtherCosts(e.target.value)}
                        placeholder="0"
                        className="text-right h-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* ملخص التكاليف */}
                  <div className="bg-destructive/10 rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">مجموع تكلفة الحاوية</span>
                      <span className="font-bold text-destructive text-sm">
                        {totalCost.toLocaleString('ar-SA')} $
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>سعر التكلفة لكل متر</span>
                      <span className="font-bold text-foreground">
                        {costPerMeter.toFixed(2)} $ / CBM
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* ============= قسم: ملاحظات ============= */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium">ملاحظات</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                className="text-right resize-none text-xs"
                rows={2}
              />
            </div>

            {/* ============= قسم: المرفقات ============= */}
            <DocumentAttachment
              attachments={containerAttachments}
              onAttachmentsChange={setContainerAttachments}
              maxFiles={5}
            />
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-card border-t border-border p-3 flex gap-2">
            <Button variant="outline" className="flex-1 h-10 text-xs" onClick={onClose}>
              إلغاء
            </Button>
            <Button 
              className="flex-1 h-10 text-xs" 
              onClick={handleSubmit}
              disabled={!containerNumber.trim()}
            >
              {initialData ? 'حفظ التعديلات' : 'إضافة الحاوية'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

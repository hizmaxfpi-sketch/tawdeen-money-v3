import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowRight, Ship, DollarSign, Calendar, ChevronDown, ChevronUp,
  Package, Globe, Clock, Users, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentAttachment } from '@/components/shared/DocumentAttachment';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { ContainerType, ContainerStatus } from '@/types/finance';
import { CONTAINER_CAPACITIES } from '@/hooks/useShippingStore';
import { ORIGIN_COUNTRIES, DESTINATION_COUNTRIES } from '@/types/shipping-extended';
import { useSupabaseShipping } from '@/hooks/useSupabaseShipping';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ContactOption {
  id: string;
  name: string;
  type: string;
  balance: number;
}

export default function AddContainer() {
  const navigate = useNavigate();
  const { addContainer } = useSupabaseShipping();
  const { user } = useAuth();
  
  // البيانات الأساسية
  const [containerNumber, setContainerNumber] = useState('');
  const [type, setType] = useState<ContainerType>('40ft');
  const [capacity, setCapacity] = useState(CONTAINER_CAPACITIES['40ft']);
  
  // وكيل الشحن
  const [shippingAgentId, setShippingAgentId] = useState<string | null>(null);
  const [shippingAgentSearch, setShippingAgentSearch] = useState('');
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  
  // بلد المنشأ والوصول
  const [originCountry, setOriginCountry] = useState('china');
  const [destinationCountry, setDestinationCountry] = useState('saudi');
  const [customOrigin, setCustomOrigin] = useState('');
  const [customDestination, setCustomDestination] = useState('');
  
  // التواريخ
  const [departureDate, setDepartureDate] = useState<Date | undefined>();
  const [rentalDate, setRentalDate] = useState<Date | undefined>();
  const [arrivalDate, setArrivalDate] = useState<Date | undefined>();
  const [loadingDays, setLoadingDays] = useState('');
  
  // التكاليف
  const [containerPrice, setContainerPrice] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [customsCost, setCustomsCost] = useState('');
  const [portCost, setPortCost] = useState('');
  const [glassFees, setGlassFees] = useState('');
  const [otherCosts, setOtherCosts] = useState('');
  
  // الحالة والملاحظات
  const [status, setStatus] = useState<ContainerStatus>('loading');
  const [notes, setNotes] = useState('');
  const [containerAttachments, setContainerAttachments] = useState<string[]>([]);
  
  // أقسام قابلة للطي
  const [showDates, setShowDates] = useState(true);
  const [showCosts, setShowCosts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // جلب جهات الاتصال (وكلاء شحن + موردين)
  useEffect(() => {
    if (!user) return;
    const fetchContacts = async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, type, balance')
        .in('type', ['shipping_agent', 'vendor', 'other'])
        .order('name');
      if (data) setContacts(data.map(c => ({ id: c.id, name: c.name, type: c.type, balance: Number(c.balance) })));
    };
    fetchContacts();
  }, [user]);

  const filteredContacts = useMemo(() => {
    if (!shippingAgentSearch.trim()) return contacts;
    return contacts.filter(c => c.name.toLowerCase().includes(shippingAgentSearch.toLowerCase()));
  }, [contacts, shippingAgentSearch]);

  const selectedAgent = contacts.find(c => c.id === shippingAgentId);

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

  const handleTypeChange = (newType: ContainerType) => {
    setType(newType);
    setCapacity(CONTAINER_CAPACITIES[newType]);
  };

  // تحديد المسار
  const getRoute = () => {
    const origin = originCountry === 'other' 
      ? customOrigin 
      : ORIGIN_COUNTRIES.find(c => c.id === originCountry)?.label || '';
    const dest = destinationCountry === 'other' 
      ? customDestination 
      : DESTINATION_COUNTRIES.find(c => c.id === destinationCountry)?.label || '';
    return `${origin} - ${dest}`;
  };

  const handleSubmit = async () => {
    if (!containerNumber.trim()) {
      toast.error('يرجى إدخال رقم الحاوية');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await addContainer({
        containerNumber: containerNumber.trim(),
        type,
        capacity,
        route: getRoute(),
        originCountry: originCountry === 'other' ? customOrigin : ORIGIN_COUNTRIES.find(c => c.id === originCountry)?.label || originCountry,
        destinationCountry: destinationCountry === 'other' ? customDestination : DESTINATION_COUNTRIES.find(c => c.id === destinationCountry)?.label || destinationCountry,
        shippingCost: parseFloat(shippingCost) || 0,
        customsCost: parseFloat(customsCost) || 0,
        portCost: parseFloat(portCost) || 0,
        otherCosts: parseFloat(otherCosts) || 0,
        containerPrice: parseFloat(containerPrice) || 0,
        glassFees: parseFloat(glassFees) || 0,
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
      
      toast.success('تم إضافة الحاوية بنجاح');
      // Save attachments after container creation
      if (containerAttachments.length > 0) {
        // Fetch the latest container to get its ID
        const { data: latestContainer } = await supabase
          .from('containers')
          .select('id')
          .eq('user_id', user!.id)
          .eq('container_number', containerNumber.trim())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (latestContainer) {
          await supabase.from('containers').update({ attachments: containerAttachments }).eq('id', latestContainer.id);
        }
      }
      navigate(-1);
    } catch (error) {
      toast.error('حدث خطأ أثناء إضافة الحاوية');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Ship className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-sm font-bold">حاوية جديدة</h1>
          </div>
        </div>
      </header>

      {/* Form */}
      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="container max-w-lg mx-auto px-4 py-6 space-y-4"
      >
        {/* قسم: بيانات الحاوية الأساسية */}
        <div className="bg-muted/30 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
            <Package className="h-3.5 w-3.5" />
            بيانات الحاوية
          </h3>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">رقم الحاوية *</Label>
              <Input
                value={containerNumber}
                onChange={(e) => setContainerNumber(e.target.value)}
                placeholder="CONT-123456"
                className="text-right h-10 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">نوع الحاوية</Label>
              <Select value={type} onValueChange={(v) => handleTypeChange(v as ContainerType)}>
                <SelectTrigger className="h-10 text-xs">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">سعة الحاوية (CBM)</Label>
              <Input
                type="number"
                value={capacity}
                readOnly
                className="text-right h-10 text-xs bg-muted/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الحالة</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ContainerStatus)}>
                <SelectTrigger className="h-10 text-xs">
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
        </div>

        {/* قسم: المسار */}
        <div className="bg-muted/30 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
            <Globe className="h-3.5 w-3.5" />
            المسار
          </h3>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">بلد المنشأ *</Label>
              <Select value={originCountry} onValueChange={setOriginCountry}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="اختر البلد" />
                </SelectTrigger>
                <SelectContent>
                  {ORIGIN_COUNTRIES.map(country => (
                    <SelectItem key={country.id} value={country.id}>
                      {country.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {originCountry === 'other' && (
                <Input
                  value={customOrigin}
                  onChange={(e) => setCustomOrigin(e.target.value)}
                  placeholder="اكتب اسم البلد..."
                  className="text-right h-9 text-xs mt-1"
                />
              )}
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs">بلد الوصول *</Label>
              <Select value={destinationCountry} onValueChange={setDestinationCountry}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="اختر البلد" />
                </SelectTrigger>
                <SelectContent>
                  {DESTINATION_COUNTRIES.map(country => (
                    <SelectItem key={country.id} value={country.id}>
                      {country.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {destinationCountry === 'other' && (
                <Input
                  value={customDestination}
                  onChange={(e) => setCustomDestination(e.target.value)}
                  placeholder="اكتب اسم البلد..."
                  className="text-right h-9 text-xs mt-1"
                />
              )}
            </div>
          </div>
        </div>

        {/* قسم: وكيل الشحن */}
        <div className="bg-muted/30 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold flex items-center gap-1.5 text-primary">
            <Users className="h-3.5 w-3.5" />
            شركة / وكيل الشحن
          </h3>
          
          <div className="space-y-1.5 relative">
            <Label className="text-xs">اختر وكيل الشحن (اختياري)</Label>
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
                className="text-right h-10 text-xs pr-8"
              />
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            </div>
            
            {showAgentDropdown && filteredContacts.length > 0 && !selectedAgent && (
              <div className="absolute z-20 w-full bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto mt-1">
                {filteredContacts.map(contact => (
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

        {/* قسم: التواريخ */}
        <div className="bg-muted/30 rounded-xl p-4 space-y-3">
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
                <div className="space-y-1">
                  <Label className="text-[11px]">تاريخ الإيجار</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full h-9 justify-start text-right text-xs", !rentalDate && "text-muted-foreground")}>
                        <Calendar className="ml-1 h-3 w-3" />
                        {rentalDate ? format(rentalDate, "dd/MM") : "اختر"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={rentalDate} onSelect={setRentalDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">تاريخ الانطلاق</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full h-9 justify-start text-right text-xs", !departureDate && "text-muted-foreground")}>
                        <Calendar className="ml-1 h-3 w-3" />
                        {departureDate ? format(departureDate, "dd/MM") : "اختر"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={departureDate} onSelect={setDepartureDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">الوصول المقدر</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full h-9 justify-start text-right text-xs", !arrivalDate && "text-muted-foreground")}>
                        <Calendar className="ml-1 h-3 w-3" />
                        {arrivalDate ? format(arrivalDate, "dd/MM") : "اختر"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={arrivalDate} onSelect={setArrivalDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">أيام الإيجار (تلقائي)</Label>
                  <Input type="number" value={rentalDays} readOnly className="text-right h-9 text-xs bg-muted/50" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">أيام التحميل</Label>
                  <Input type="number" value={loadingDays} onChange={(e) => setLoadingDays(e.target.value)} placeholder="0" className="text-right h-9 text-xs" />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* قسم: التكاليف */}
        <div className="bg-muted/30 rounded-xl p-4 space-y-3">
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
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">سعر الحاوية</Label>
                  <Input type="number" value={containerPrice} onChange={(e) => setContainerPrice(e.target.value)} placeholder="0" className="text-right h-9 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">تكلفة الشحن البحري</Label>
                  <Input type="number" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} placeholder="0" className="text-right h-9 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">الجمارك</Label>
                  <Input type="number" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} placeholder="0" className="text-right h-9 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">مصاريف الميناء</Label>
                  <Input type="number" value={portCost} onChange={(e) => setPortCost(e.target.value)} placeholder="0" className="text-right h-9 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">أجور الزجاج</Label>
                  <Input type="number" value={glassFees} onChange={(e) => setGlassFees(e.target.value)} placeholder="0" className="text-right h-9 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">مصاريف أخرى</Label>
                  <Input type="number" value={otherCosts} onChange={(e) => setOtherCosts(e.target.value)} placeholder="0" className="text-right h-9 text-xs" />
                </div>
              </div>

              {/* ملخص التكاليف */}
              <div className="bg-destructive/10 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">مجموع تكلفة الحاوية</span>
                  <span className="font-bold text-destructive text-base">{totalCost.toLocaleString('ar-SA')} $</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>سعر التكلفة لكل متر</span>
                  <span className="font-bold text-foreground">{costPerMeter.toFixed(2)} $ / CBM</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* ملاحظات */}
        <div className="space-y-1.5">
          <Label className="text-xs">ملاحظات</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." className="text-right resize-none text-xs" rows={2} />
        </div>

        {/* المرفقات */}
        <DocumentAttachment
          attachments={containerAttachments}
          onAttachmentsChange={setContainerAttachments}
          maxFiles={5}
        />

        {/* زر الحفظ */}
        <div className="pt-4 pb-8">
          <Button className="w-full h-12 text-sm font-medium" onClick={handleSubmit} disabled={!containerNumber.trim() || isSubmitting}>
            {isSubmitting ? 'جاري الإضافة...' : 'إضافة الحاوية'}
          </Button>
        </div>
      </motion.main>
    </div>
  );
}

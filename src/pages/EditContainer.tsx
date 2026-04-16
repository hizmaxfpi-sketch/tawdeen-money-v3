import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Ship, Calendar, MapPin, DollarSign, Save, Loader2, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSupabaseShipping } from '@/hooks/useSupabaseShipping';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const CONTAINER_CAPACITIES: Record<string, number> = {
  '40ft': 67,
  '20ft': 33,
  '40hc': 76,
};

interface ContainerExpense {
  id: string;
  amount: number;
  description: string;
  date: string;
  notes?: string;
}

export default function EditContainer() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const shippingStore = useSupabaseShipping();
  useScrollToTop();

  const container = shippingStore.containers.find(c => c.id === id);

  // Form state - ALL fields
  const [containerNumber, setContainerNumber] = useState('');
  const [type, setType] = useState<'40ft' | '20ft' | '40hc'>('40ft');
  const [capacity, setCapacity] = useState(67);
  const [originCountry, setOriginCountry] = useState('');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [rentalDate, setRentalDate] = useState('');
  const [status, setStatus] = useState<'loading' | 'shipped' | 'arrived' | 'cleared' | 'delivered'>('loading');
  const [containerPrice, setContainerPrice] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [customsCost, setCustomsCost] = useState('');
  const [portCost, setPortCost] = useState('');
  const [glassFees, setGlassFees] = useState('');
  const [otherCosts, setOtherCosts] = useState('');
  const [notes, setNotes] = useState('');
  const [showCosts, setShowCosts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Container expenses
  const [expenses, setExpenses] = useState<ContainerExpense[]>([]);
  const [showExpenses, setShowExpenses] = useState(true);
  const [newExpenseDesc, setNewExpenseDesc] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);

  // Load container data from DB directly to get ALL fields
  useEffect(() => {
    if (!id) return;
    const loadFullData = async () => {
      const { data } = await supabase.from('containers').select('*').eq('id', id).single();
      if (data) {
        setContainerNumber(data.container_number);
        setType(data.type as any);
        setCapacity(Number(data.capacity));
        setStatus(data.status as any);
        setContainerPrice(data.container_price?.toString() || '0');
        setShippingCost(data.shipping_cost?.toString() || '0');
        setCustomsCost(data.customs_cost?.toString() || '0');
        setPortCost(data.port_cost?.toString() || '0');
        setGlassFees(data.glass_fees?.toString() || '0');
        setOtherCosts(data.other_costs?.toString() || '0');
        setNotes(data.notes || '');
        setDepartureDate(data.departure_date || '');
        setArrivalDate(data.arrival_date || '');
        setRentalDate(data.rental_date || '');
        // Parse origin/destination from route or direct fields
        if (data.origin_country) setOriginCountry(data.origin_country);
        if (data.destination_country) setDestinationCountry(data.destination_country);
        if (!data.origin_country && !data.destination_country && data.route) {
          const parts = data.route.split(' - ');
          if (parts.length >= 2) {
            setOriginCountry(parts[0]);
            setDestinationCountry(parts[1]);
          }
        }
      }
    };
    loadFullData();
  }, [id]);

  // Load expenses
  useEffect(() => {
    if (!id) return;
    const loadExpenses = async () => {
      const { data } = await supabase
        .from('container_expenses')
        .select('id, amount, description, date, notes')
        .eq('container_id', id)
        .order('created_at', { ascending: true });
      if (data) setExpenses(data.map(e => ({ ...e, amount: Number(e.amount) })));
    };
    loadExpenses();
  }, [id]);

  const baseCost = useMemo(() => {
    return (parseFloat(containerPrice) || 0) + (parseFloat(shippingCost) || 0) +
      (parseFloat(customsCost) || 0) + (parseFloat(portCost) || 0) +
      (parseFloat(glassFees) || 0) + (parseFloat(otherCosts) || 0);
  }, [containerPrice, shippingCost, customsCost, portCost, glassFees, otherCosts]);

  const extraExpensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const totalCost = baseCost + extraExpensesTotal;

  const handleAddExpense = async () => {
    if (!user || !id || !newExpenseDesc.trim() || !(parseFloat(newExpenseAmount) > 0)) return;
    setAddingExpense(true);
    const { data, error } = await supabase.from('container_expenses').insert({
      container_id: id,
      user_id: user.id,
      amount: parseFloat(newExpenseAmount),
      description: newExpenseDesc.trim(),
    }).select().single();
    if (error) { toast.error('خطأ في إضافة المصروف'); }
    else {
      setExpenses(prev => [...prev, { id: data.id, amount: Number(data.amount), description: data.description, date: data.date, notes: data.notes }]);
      setNewExpenseDesc('');
      setNewExpenseAmount('');
      toast.success('تم إضافة المصروف');
      // Refresh containers to update totals
      shippingStore.fetchContainers(true);
    }
    setAddingExpense(false);
  };

  const handleDeleteExpense = async (expenseId: string) => {
    const { error } = await supabase.from('container_expenses').delete().eq('id', expenseId);
    if (error) { toast.error('خطأ في حذف المصروف'); return; }
    setExpenses(prev => prev.filter(e => e.id !== expenseId));
    toast.success('تم حذف المصروف');
    shippingStore.fetchContainers(true);
  };

  const handleSubmit = async () => {
    if (!containerNumber.trim()) {
      toast.error('يرجى إدخال رقم الحاوية');
      return;
    }
    setIsSubmitting(true);
    try {
      const route = `${originCountry} - ${destinationCountry}`;
      // Single consolidated update - all fields in one call
      await shippingStore.updateContainer(id!, {
        containerNumber: containerNumber.trim(),
        type: type as any,
        route,
        status,
        capacity,
        originCountry,
        destinationCountry,
        departureDate: departureDate || undefined,
        arrivalDate: arrivalDate || undefined,
        rentalDate: rentalDate || undefined,
        containerPrice: parseFloat(containerPrice) || 0,
        shippingCost: parseFloat(shippingCost) || 0,
        customsCost: parseFloat(customsCost) || 0,
        portCost: parseFloat(portCost) || 0,
        glassFees: parseFloat(glassFees) || 0,
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

  if (!container && !id) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">الحاوية غير موجودة</p>
      </div>
    );
  }

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
              <Input value={containerNumber} onChange={(e) => setContainerNumber(e.target.value)} placeholder="XXXX-123456" className="h-10 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">نوع الحاوية</Label>
              <Select value={type} onValueChange={(v) => { setType(v as any); setCapacity(CONTAINER_CAPACITIES[v] || 67); }}>
                <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
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
              <Input value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} className="h-10 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">بلد الوصول</Label>
              <Input value={destinationCountry} onChange={(e) => setDestinationCountry(e.target.value)} className="h-10 text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">الحالة</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
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
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">تاريخ الإيجار</Label>
              <Input type="date" value={rentalDate} onChange={(e) => setRentalDate(e.target.value)} className="h-10 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">تاريخ الانطلاق</Label>
              <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} className="h-10 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">تاريخ الوصول</Label>
              <Input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} className="h-10 text-xs" />
            </div>
          </div>
        </div>

        {/* التكاليف الأساسية */}
        <Collapsible open={showCosts} onOpenChange={setShowCosts}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-11 text-xs">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                <span>التكاليف الأساسية</span>
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px]">${baseCost.toLocaleString()}</span>
              </div>
              {showCosts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-card rounded-xl p-4 mt-2 space-y-3 border border-border">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">سعر الحاوية</Label>
                  <Input type="number" value={containerPrice} onChange={(e) => setContainerPrice(e.target.value)} placeholder="0" className="h-10 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">تكلفة الشحن</Label>
                  <Input type="number" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} placeholder="0" className="h-10 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">الجمارك</Label>
                  <Input type="number" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} placeholder="0" className="h-10 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">مصاريف الميناء</Label>
                  <Input type="number" value={portCost} onChange={(e) => setPortCost(e.target.value)} placeholder="0" className="h-10 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">رسوم الزجاج</Label>
                  <Input type="number" value={glassFees} onChange={(e) => setGlassFees(e.target.value)} placeholder="0" className="h-10 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">مصاريف أخرى</Label>
                  <Input type="number" value={otherCosts} onChange={(e) => setOtherCosts(e.target.value)} placeholder="0" className="h-10 text-xs" />
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* مصروفات إضافية */}
        <Collapsible open={showExpenses} onOpenChange={setShowExpenses}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-11 text-xs">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>مصروفات إضافية</span>
                {extraExpensesTotal > 0 && (
                  <span className="bg-destructive/10 text-destructive px-2 py-0.5 rounded text-[10px]">${extraExpensesTotal.toLocaleString()}</span>
                )}
              </div>
              {showExpenses ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-card rounded-xl p-4 mt-2 space-y-3 border border-border">
              {expenses.map(exp => (
                <div key={exp.id} className="flex items-center justify-between bg-muted/50 rounded-lg p-2.5">
                  <div>
                    <p className="text-xs font-medium">{exp.description}</p>
                    <p className="text-[10px] text-muted-foreground">{exp.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-destructive">${exp.amount.toLocaleString()}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteExpense(exp.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {/* Add new expense */}
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[11px] font-semibold">إضافة مصروف جديد</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={newExpenseDesc} onChange={(e) => setNewExpenseDesc(e.target.value)} placeholder="وصف المصروف" className="h-9 text-xs" />
                  <Input type="number" value={newExpenseAmount} onChange={(e) => setNewExpenseAmount(e.target.value)} placeholder="المبلغ" className="h-9 text-xs" />
                </div>
                <Button size="sm" className="w-full h-8 text-xs gap-1" onClick={handleAddExpense}
                  disabled={addingExpense || !newExpenseDesc.trim() || !(parseFloat(newExpenseAmount) > 0)}>
                  <Plus className="h-3 w-3" /> إضافة مصروف
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* إجمالي التكاليف */}
        <div className="bg-card rounded-xl p-4 border border-border space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">التكاليف الأساسية:</span>
            <span>${baseCost.toLocaleString()}</span>
          </div>
          {extraExpensesTotal > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">مصروفات إضافية:</span>
              <span className="text-destructive">${extraExpensesTotal.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-border font-bold text-sm">
            <span>إجمالي التكاليف:</span>
            <span className="text-destructive">${totalCost.toLocaleString()}</span>
          </div>
        </div>

        {/* ملاحظات */}
        <div className="space-y-2">
          <Label className="text-xs">ملاحظات</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." className="text-right resize-none text-xs" rows={3} />
        </div>

        {/* زر الحفظ */}
        <div className="pt-4 pb-8">
          <Button className="w-full h-12 text-sm font-medium gap-2" onClick={handleSubmit} disabled={!containerNumber.trim() || isSubmitting}>
            {isSubmitting ? (<><Loader2 className="h-4 w-4 animate-spin" />جاري الحفظ...</>) : (<><Save className="h-4 w-4" />حفظ التعديلات</>)}
          </Button>
        </div>
      </motion.main>
    </div>
  );
}

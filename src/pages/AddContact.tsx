import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, User, Phone, Mail, Building2, MapPin, Link2, UserCheck, Truck, Ship, Briefcase, Handshake, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContactType, CreateContactInput, CONTACT_TYPE_LABELS } from '@/types/contacts';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useScrollToTop } from '@/hooks/useScrollToTop';

// أيقونات الأنواع
const TypeIcons: Record<ContactType, any> = {
  client: UserCheck,
  vendor: Truck,
  shipping_agent: Ship,
  employee: Briefcase,
  partner: Handshake,
  other: User,
};

export default function AddContactPage() {
  const navigate = useNavigate();
  const { addContact, getContactOptions } = useSupabaseContacts();
  useScrollToTop();

  const [name, setName] = useState('');
  const [type, setType] = useState<ContactType>('client');
  const [customType, setCustomType] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [parentContactId, setParentContactId] = useState('');
  const [useWhatsappSameAsPhone, setUseWhatsappSameAsPhone] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const contactOptions = getContactOptions();

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('يرجى إدخال اسم جهة الاتصال');
      return;
    }

    setIsSubmitting(true);

    const data: CreateContactInput = {
      name: name.trim(),
      type,
      customType: type === 'other' ? customType.trim() : undefined,
      phone: phone.trim() || undefined,
      whatsapp: useWhatsappSameAsPhone ? phone.trim() : whatsapp.trim() || undefined,
      email: email.trim() || undefined,
      company: company.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
      parentContactId: parentContactId && parentContactId !== 'none' ? parentContactId : undefined,
    };

    try {
      await addContact(data);
      navigate(-1);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-primary text-primary-foreground shadow-lg">
        <div className="container flex h-12 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-sm font-bold">إضافة جهة اتصال</h1>
        </div>
      </header>

      <div className="container max-w-lg mx-auto px-3 py-4 space-y-4">
        {/* نوع جهة الاتصال */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">نوع جهة الاتصال</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(CONTACT_TYPE_LABELS) as ContactType[]).map(t => {
                const Icon = TypeIcons[t];
                return (
                  <motion.button
                    key={t}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setType(t)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                      type === t 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-medium">{CONTACT_TYPE_LABELS[t]}</span>
                  </motion.button>
                );
              })}
            </div>
            {type === 'other' && (
              <Input
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="اكتب النوع..."
                className="text-right h-8 text-xs mt-2"
              />
            )}
          </CardContent>
        </Card>

        {/* البيانات الأساسية */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              البيانات الأساسية
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px]">الاسم *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم جهة الاتصال"
                className="text-right h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                الشركة
              </Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="اسم الشركة (اختياري)"
                className="text-right h-9 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* معلومات الاتصال */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              معلومات الاتصال
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px]">رقم الهاتف</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 5XX XXX XXXX"
                className="text-right h-9 text-xs"
                dir="ltr"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-green-600">واتساب</Label>
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={useWhatsappSameAsPhone}
                    onChange={(e) => setUseWhatsappSameAsPhone(e.target.checked)}
                    className="h-3 w-3"
                  />
                  نفس رقم الهاتف
                </label>
              </div>
              {!useWhatsappSameAsPhone && (
                <Input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+966 5XX XXX XXXX"
                  className="text-right h-9 text-xs"
                  dir="ltr"
                />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1">
                <Mail className="h-3 w-3" />
                البريد الإلكتروني
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="text-right h-9 text-xs"
                dir="ltr"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                العنوان
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="العنوان (اختياري)"
                className="text-right h-9 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* الربط بجهة اتصال */}
        {contactOptions.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                الربط بجهة اتصال
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <Select value={parentContactId || 'none'} onValueChange={setParentContactId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="اختر جهة اتصال..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="none" className="text-xs">بدون</SelectItem>
                  {contactOptions.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name} - {CONTACT_TYPE_LABELS[c.type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* الملاحظات */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">ملاحظات</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات إضافية..."
              className="text-right text-xs min-h-[60px] resize-none"
            />
          </CardContent>
        </Card>

        {/* زر الحفظ */}
        <Button 
          onClick={handleSubmit} 
          disabled={!name.trim() || isSubmitting}
          className="w-full h-11 text-sm font-medium gap-2"
        >
          <Save className="h-4 w-4" />
          {isSubmitting ? 'جاري الحفظ...' : 'حفظ جهة الاتصال'}
        </Button>
      </div>
    </div>
  );
}
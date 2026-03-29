import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Phone, Mail, Building2, MapPin, Tag, Link2, UserCheck, Truck, Ship, Briefcase, Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Contact, ContactType, CreateContactInput, ContactOption } from '@/types/contacts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';

interface ContactFormProps {
  onSubmit: (data: CreateContactInput) => Promise<any>;
  onClose: () => void;
  initialData?: Contact;
  contactOptions?: ContactOption[];
  isQuickAdd?: boolean;
  defaultType?: ContactType;
  defaultName?: string;
}

const TypeIcons: Record<ContactType, any> = {
  client: UserCheck, vendor: Truck, shipping_agent: Ship, employee: Briefcase, partner: Handshake, other: User,
};

const TYPE_KEYS: Record<ContactType, string> = {
  client: 'contacts.client', vendor: 'contacts.vendor', shipping_agent: 'contacts.agent',
  employee: 'contacts.employee', partner: 'contacts.partner', other: 'contacts.other',
};

export function ContactForm({ onSubmit, onClose, initialData, contactOptions = [], isQuickAdd = false, defaultType, defaultName = '' }: ContactFormProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(initialData?.name || defaultName);
  const [type, setType] = useState<ContactType>(initialData?.type || defaultType || 'client');
  const [customType, setCustomType] = useState(initialData?.customType || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [whatsapp, setWhatsapp] = useState(initialData?.whatsapp || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [company, setCompany] = useState(initialData?.company || '');
  const [address, setAddress] = useState(initialData?.address || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [parentContactId, setParentContactId] = useState(initialData?.parentContactId || '');
  const [useWhatsappSameAsPhone, setUseWhatsappSameAsPhone] = useState(true);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('contacts.enterName'));
      return;
    }
    const data: CreateContactInput = {
      name: name.trim(), type,
      customType: type === 'other' ? customType.trim() : undefined,
      phone: phone.trim() || undefined,
      whatsapp: useWhatsappSameAsPhone ? phone.trim() : whatsapp.trim() || undefined,
      email: email.trim() || undefined, company: company.trim() || undefined,
      address: address.trim() || undefined, notes: notes.trim() || undefined,
      parentContactId: parentContactId || undefined,
    };
    await onSubmit(data);
    toast.success(initialData ? t('contacts.updated') : t('contacts.added'));
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
        <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
          className="bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 bg-card border-b border-border p-3 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-[13px] font-bold">
                {isQuickAdd ? t('contacts.quickAdd') : initialData ? t('contacts.editLedger') : t('contacts.newLedger')}
              </h2>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>

          <div className="p-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]">{t('contacts.accountType')}</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(TYPE_KEYS) as ContactType[]).map(ct => {
                  const Icon = TypeIcons[ct];
                  return (
                    <button key={ct} type="button" onClick={() => setType(ct)}
                      className={cn("flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                        type === ct ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50")}>
                      <Icon className="h-4 w-4" />
                      <span className="text-[10px]">{t(TYPE_KEYS[ct])}</span>
                    </button>
                  );
                })}
              </div>
              {type === 'other' && (
                <Input value={customType} onChange={(e) => setCustomType(e.target.value)}
                  placeholder={t('contacts.customType')} className="text-right h-8 text-[12px] mt-1.5" />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">{t('contacts.nameRequired')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t('contacts.namePlaceholder')} className="text-right h-9 text-[12px]" />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1"><Building2 className="h-3 w-3" />{t('contacts.company')}</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)}
                placeholder={t('contacts.companyPlaceholder')} className="text-right h-9 text-[12px]" />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1"><Phone className="h-3 w-3" />{t('contacts.phoneLabel')}</Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder={t('contacts.phonePlaceholder')} className="text-right h-9 text-[12px]" dir="ltr" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] flex items-center gap-1 text-green-600">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                  {t('contacts.whatsapp')}
                </Label>
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <input type="checkbox" checked={useWhatsappSameAsPhone} onChange={(e) => setUseWhatsappSameAsPhone(e.target.checked)} className="h-3 w-3" />
                  {t('contacts.sameAsPhone')}
                </label>
              </div>
              {!useWhatsappSameAsPhone && (
                <Input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder={t('contacts.phonePlaceholder')} className="text-right h-9 text-[12px]" dir="ltr" />
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1"><Mail className="h-3 w-3" />{t('contacts.emailLabel')}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com" className="text-right h-9 text-[12px]" dir="ltr" />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1"><MapPin className="h-3 w-3" />{t('contacts.address')}</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder={t('contacts.addressPlaceholder')} className="text-right h-9 text-[12px]" />
            </div>

            {!isQuickAdd && (
              <div className="space-y-1">
                <Label className="text-[11px]">{t('contacts.notes')}</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('contacts.notesPlaceholder')} className="text-right text-[12px] min-h-[60px] resize-none" />
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-card border-t border-border p-3 flex gap-2">
            <Button variant="outline" className="flex-1 h-10 text-[12px]" onClick={onClose}>{t('common.cancel')}</Button>
            <Button className="flex-1 h-10 text-[12px]" onClick={handleSubmit}>
              {initialData ? t('contacts.update') : t('common.add')}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ContactType, CreateContactInput } from '@/types/contacts';
import { toast } from 'sonner';

interface QuickAddContactProps {
  defaultName?: string;
  defaultType?: ContactType;
  onSubmit: (data: CreateContactInput) => Promise<any>;
  onClose: () => void;
}

export function QuickAddContact({ 
  defaultName = '', 
  defaultType = 'client',
  onSubmit, 
  onClose 
}: QuickAddContactProps) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('يرجى إدخال اسم جهة الاتصال');
      return;
    }

    const data: CreateContactInput = {
      name: name.trim(),
      type: defaultType,
      phone: phone.trim() || undefined,
      whatsapp: phone.trim() || undefined,
      company: company.trim() || undefined,
    };

    await onSubmit(data);
    toast.success('تم إضافة جهة الاتصال');
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-card w-full max-w-sm rounded-2xl shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-border p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <UserPlus className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-sm font-bold">إضافة عميل سريعة</h2>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Form */}
          <div className="p-3 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">الاسم *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم العميل"
                className="text-right h-9 text-sm"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Phone className="h-3 w-3" />
                رقم الهاتف
              </Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 5XX XXX XXXX"
                className="text-right h-9 text-sm"
                dir="ltr"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">الشركة (اختياري)</Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="اسم الشركة"
                className="text-right h-9 text-sm"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border p-3 flex gap-2">
            <Button variant="outline" className="flex-1 h-9" onClick={onClose}>
              إلغاء
            </Button>
            <Button className="flex-1 h-9" onClick={handleSubmit}>
              إضافة
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

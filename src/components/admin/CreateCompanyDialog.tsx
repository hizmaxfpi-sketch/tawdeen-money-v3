import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, Plus } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateCompanyDialog({ open, onOpenChange, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    ownerEmail: '',
    ownerPassword: '',
    ownerFullName: '',
    plan: 'basic',
    maxUsers: 5,
  });

  const handleSubmit = async () => {
    if (!form.companyName || !form.ownerEmail || !form.ownerPassword) {
      toast.error('جميع الحقول المطلوبة يجب تعبئتها');
      return;
    }
    if (form.ownerPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.functions.invoke('admin-create-company', {
      body: {
        companyName: form.companyName,
        ownerEmail: form.ownerEmail,
        ownerPassword: form.ownerPassword,
        ownerFullName: form.ownerFullName,
        plan: form.plan,
        maxUsers: form.maxUsers,
      },
    });

    setSaving(false);
    if (error || data?.error) {
      toast.error(data?.error || 'فشل إنشاء الشركة');
      return;
    }

    toast.success('تم إنشاء الشركة والحساب بنجاح');
    setForm({ companyName: '', ownerEmail: '', ownerPassword: '', ownerFullName: '', plan: 'basic', maxUsers: 5 });
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            إنشاء شركة جديدة
          </DialogTitle>
          <DialogDescription className="text-right">
            أنشئ شركة مع حساب مالك جديد
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">اسم الشركة *</Label>
            <Input
              value={form.companyName}
              onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))}
              placeholder="مثال: شركة النجاح"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">اسم المالك</Label>
            <Input
              value={form.ownerFullName}
              onChange={e => setForm(p => ({ ...p, ownerFullName: e.target.value }))}
              placeholder="الاسم الكامل"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">بريد المالك *</Label>
            <Input
              type="email"
              value={form.ownerEmail}
              onChange={e => setForm(p => ({ ...p, ownerEmail: e.target.value }))}
              placeholder="owner@company.com"
              className="h-9 text-sm"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">كلمة مرور مؤقتة *</Label>
            <Input
              type="text"
              value={form.ownerPassword}
              onChange={e => setForm(p => ({ ...p, ownerPassword: e.target.value }))}
              placeholder="كلمة مرور لمرة واحدة"
              className="h-9 text-sm"
              dir="ltr"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">الخطة</Label>
              <Select value={form.plan} onValueChange={v => setForm(p => ({ ...p, plan: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">أساسي</SelectItem>
                  <SelectItem value="pro">احترافي</SelectItem>
                  <SelectItem value="enterprise">مؤسسات</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الحد الأقصى للمستخدمين</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.maxUsers}
                onChange={e => setForm(p => ({ ...p, maxUsers: parseInt(e.target.value) || 5 }))}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2 mt-2">
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            إنشاء الشركة
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

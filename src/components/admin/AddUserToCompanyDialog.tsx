import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, UserPlus, Shield } from 'lucide-react';
import { ALL_MODULES, ModulePermission, ModuleKey, saveUserPermissions } from '@/hooks/useUserPermissions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  onSuccess: () => void;
}

const roleLabels: Record<string, string> = {
  admin: 'مدير',
  accountant: 'محاسب',
  shipping_staff: 'موظف عمليات',
  viewer: 'مشاهد',
};

export function AddUserToCompanyDialog({ open, onOpenChange, companyId, companyName, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'viewer',
  });

  const getDefaultPerms = (role: string): ModulePermission[] => {
    return ALL_MODULES.map(m => {
      if (role === 'admin') return { module: m.key, can_view: true, can_create: true, can_edit: true, can_delete: true };
      if (role === 'accountant') {
        const acc = ['transactions', 'funds', 'contacts', 'debts', 'ledger', 'reports'];
        const is = acc.includes(m.key);
        return { module: m.key, can_view: true, can_create: is, can_edit: is, can_delete: false };
      }
      if (role === 'shipping_staff') {
        const sh = ['shipping', 'contacts'];
        const is = sh.includes(m.key);
        return { module: m.key, can_view: true, can_create: is, can_edit: is, can_delete: false };
      }
      return { module: m.key, can_view: true, can_create: false, can_edit: false, can_delete: false };
    });
  };

  const [permissions, setPermissions] = useState<ModulePermission[]>(getDefaultPerms('viewer'));

  const handleRoleChange = (role: string) => {
    setForm(p => ({ ...p, role }));
    setPermissions(getDefaultPerms(role));
  };

  const togglePerm = (module: ModuleKey, field: keyof Omit<ModulePermission, 'module'>) => {
    setPermissions(prev => prev.map(p => {
      if (p.module !== module) return p;
      const updated = { ...p, [field]: !p[field] };
      if (field !== 'can_view' && updated[field]) updated.can_view = true;
      if (field === 'can_view' && !updated.can_view) {
        updated.can_create = false;
        updated.can_edit = false;
        updated.can_delete = false;
      }
      return updated;
    }));
  };

  const handleSubmit = async () => {
    if (!form.email || !form.password) {
      toast.error('البريد وكلمة المرور مطلوبان');
      return;
    }
    if (form.password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.functions.invoke('admin-add-user', {
      body: {
        companyId,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
      },
    });

    setSaving(false);
    if (error) {
      const message = await (error as any).context?.json?.().then((v: any) => v?.error).catch(() => null);
      toast.error(message || error.message || 'فشل إضافة المستخدم');
      return;
    }
    if (data?.error) {
      toast.error(data.error);
      return;
    }

    // Save permissions for the new user
    if (data?.user_id && form.role !== 'admin') {
      await saveUserPermissions(data.user_id, companyId, permissions);
    }

    toast.success('تم إضافة المستخدم بنجاح');
    setForm({ email: '', password: '', fullName: '', role: 'viewer' });
    setPermissions(getDefaultPerms('viewer'));
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            إضافة مستخدم
          </DialogTitle>
          <DialogDescription className="text-right">
            إضافة مستخدم جديد لشركة: {companyName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">الاسم الكامل</Label>
            <Input
              value={form.fullName}
              onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
              placeholder="اسم المستخدم"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">البريد الإلكتروني *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="user@company.com"
              className="h-9 text-sm"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">كلمة مرور مؤقتة *</Label>
            <Input
              type="text"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder="كلمة مرور لمرة واحدة"
              className="h-9 text-sm"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">الدور</Label>
            <Select value={form.role} onValueChange={handleRoleChange}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(roleLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Permissions Table */}
          {form.role !== 'admin' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" />
                الصلاحيات التفصيلية
              </Label>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-right py-1 px-2 font-medium">القسم</th>
                      <th className="text-center py-1 px-0.5 font-medium">عرض</th>
                      <th className="text-center py-1 px-0.5 font-medium">إضافة</th>
                      <th className="text-center py-1 px-0.5 font-medium">تعديل</th>
                      <th className="text-center py-1 px-0.5 font-medium">حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ALL_MODULES.map((m, i) => {
                      const perm = permissions.find(p => p.module === m.key);
                      if (!perm) return null;
                      return (
                        <tr key={m.key} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                          <td className="py-1 px-2 font-medium">{m.label}</td>
                          <td className="text-center py-1 px-0.5">
                            <Checkbox checked={perm.can_view} onCheckedChange={() => togglePerm(m.key, 'can_view')} className="mx-auto h-3.5 w-3.5" />
                          </td>
                          <td className="text-center py-1 px-0.5">
                            <Checkbox checked={perm.can_create} onCheckedChange={() => togglePerm(m.key, 'can_create')} className="mx-auto h-3.5 w-3.5" />
                          </td>
                          <td className="text-center py-1 px-0.5">
                            <Checkbox checked={perm.can_edit} onCheckedChange={() => togglePerm(m.key, 'can_edit')} className="mx-auto h-3.5 w-3.5" />
                          </td>
                          <td className="text-center py-1 px-0.5">
                            <Checkbox checked={perm.can_delete} onCheckedChange={() => togglePerm(m.key, 'can_delete')} className="mx-auto h-3.5 w-3.5" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row-reverse gap-2 mt-2">
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            إضافة المستخدم
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

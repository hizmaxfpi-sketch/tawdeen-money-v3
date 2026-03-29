import { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ALL_MODULES, ModulePermission, saveUserPermissions, ModuleKey } from '@/hooks/useUserPermissions';

interface Props {
  userId: string;
  companyId: string;
  userRole: string;
  onSaved?: () => void;
}

export function PermissionsEditor({ userId, companyId, userRole, onSaved }: Props) {
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';

  useEffect(() => {
    loadPermissions();
  }, [userId, companyId]);

  const loadPermissions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('user_permissions')
      .select('module, can_view, can_create, can_edit, can_delete')
      .eq('user_id', userId)
      .eq('company_id', companyId);

    if (data && data.length > 0) {
      const perms: ModulePermission[] = ALL_MODULES.map(m => {
        const found = data.find((d: any) => d.module === m.key);
        return found
          ? { module: m.key, can_view: found.can_view, can_create: found.can_create, can_edit: found.can_edit, can_delete: found.can_delete }
          : getDefaultPermission(m.key, userRole);
      });
      setPermissions(perms);
    } else {
      setPermissions(ALL_MODULES.map(m => getDefaultPermission(m.key, userRole)));
    }
    setLoading(false);
  };

  const getDefaultPermission = (module: ModuleKey, role: string): ModulePermission => {
    if (role === 'owner' || role === 'admin') {
      return { module, can_view: true, can_create: true, can_edit: true, can_delete: true };
    }
    if (role === 'accountant') {
      const acc = ['transactions', 'funds', 'contacts', 'debts', 'ledger', 'reports'];
      const is = acc.includes(module);
      return { module, can_view: true, can_create: is, can_edit: is, can_delete: false };
    }
    if (role === 'shipping_staff') {
      const sh = ['shipping', 'contacts'];
      const is = sh.includes(module);
      return { module, can_view: true, can_create: is, can_edit: is, can_delete: false };
    }
    return { module, can_view: true, can_create: false, can_edit: false, can_delete: false };
  };

  const togglePerm = (module: ModuleKey, field: keyof Omit<ModulePermission, 'module'>) => {
    setPermissions(prev => prev.map(p => {
      if (p.module !== module) return p;
      const updated = { ...p, [field]: !p[field] };
      // If can_create/edit/delete is true, ensure can_view is true
      if (field !== 'can_view' && updated[field]) updated.can_view = true;
      // If can_view is false, disable all others
      if (field === 'can_view' && !updated.can_view) {
        updated.can_create = false;
        updated.can_edit = false;
        updated.can_delete = false;
      }
      return updated;
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await saveUserPermissions(userId, companyId, permissions);
    setSaving(false);
    if (error) {
      toast.error('فشل حفظ الصلاحيات: ' + error);
    } else {
      toast.success('تم حفظ الصلاحيات بنجاح');
      onSaved?.();
    }
  };

  const selectAll = () => {
    setPermissions(prev => prev.map(p => ({ ...p, can_view: true, can_create: true, can_edit: true, can_delete: true })));
  };

  const clearAll = () => {
    setPermissions(prev => prev.map(p => ({ ...p, can_view: true, can_create: false, can_edit: false, can_delete: false })));
  };

  if (isOwnerOrAdmin) {
    return (
      <div className="text-center py-3 text-sm text-muted-foreground">
        <Shield className="h-5 w-5 mx-auto mb-1 text-primary" />
        هذا المستخدم لديه صلاحيات كاملة (مالك/مدير)
      </div>
    );
  }

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-primary" />
          تحديد الصلاحيات
        </Label>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={selectAll}>
            تحديد الكل
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={clearAll}>
            مشاهدة فقط
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-right py-1.5 px-2 font-medium">القسم</th>
              <th className="text-center py-1.5 px-1 font-medium">عرض</th>
              <th className="text-center py-1.5 px-1 font-medium">إضافة</th>
              <th className="text-center py-1.5 px-1 font-medium">تعديل</th>
              <th className="text-center py-1.5 px-1 font-medium">حذف</th>
            </tr>
          </thead>
          <tbody>
            {ALL_MODULES.map((m, i) => {
              const perm = permissions.find(p => p.module === m.key);
              if (!perm) return null;
              return (
                <tr key={m.key} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="py-1.5 px-2 font-medium">{m.label}</td>
                  <td className="text-center py-1.5 px-1">
                    <Checkbox
                      checked={perm.can_view}
                      onCheckedChange={() => togglePerm(m.key, 'can_view')}
                      className="mx-auto"
                    />
                  </td>
                  <td className="text-center py-1.5 px-1">
                    <Checkbox
                      checked={perm.can_create}
                      onCheckedChange={() => togglePerm(m.key, 'can_create')}
                      className="mx-auto"
                    />
                  </td>
                  <td className="text-center py-1.5 px-1">
                    <Checkbox
                      checked={perm.can_edit}
                      onCheckedChange={() => togglePerm(m.key, 'can_edit')}
                      className="mx-auto"
                    />
                  </td>
                  <td className="text-center py-1.5 px-1">
                    <Checkbox
                      checked={perm.can_delete}
                      onCheckedChange={() => togglePerm(m.key, 'can_delete')}
                      className="mx-auto"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm" className="w-full gap-1.5">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        حفظ الصلاحيات
      </Button>
    </div>
  );
}

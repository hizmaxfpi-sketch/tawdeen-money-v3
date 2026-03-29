import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from './useUserRole';

export const ALL_MODULES = [
  { key: 'transactions', label: 'القيود المالية' },
  { key: 'funds', label: 'الصناديق' },
  { key: 'contacts', label: 'جهات الاتصال' },
  { key: 'shipping', label: 'الشحن والحاويات' },
  { key: 'projects', label: 'المشاريع' },
  { key: 'debts', label: 'الديون والمديونيات' },
  { key: 'ledger', label: 'الدفاتر المحاسبية' },
  { key: 'reports', label: 'التقارير' },
  { key: 'settings', label: 'الإعدادات' },
] as const;

export type ModuleKey = typeof ALL_MODULES[number]['key'];

export interface ModulePermission {
  module: ModuleKey;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface UserPermissionsInfo {
  permissions: ModulePermission[];
  isLoading: boolean;
  canView: (module: ModuleKey) => boolean;
  canCreate: (module: ModuleKey) => boolean;
  canEdit: (module: ModuleKey) => boolean;
  canDelete: (module: ModuleKey) => boolean;
}

export function useUserPermissions(): UserPermissionsInfo {
  const { user } = useAuth();
  const { role, isLoading: roleLoading } = useUserRole();
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || roleLoading) return;

    // Owner and admin have full access - no need to check permissions table
    if (role === 'owner' || role === 'admin') {
      const fullPerms = ALL_MODULES.map(m => ({
        module: m.key,
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: true,
      }));
      setPermissions(fullPerms);
      setIsLoading(false);
      return;
    }

    const fetchPermissions = async () => {
      const { data } = await supabase
        .from('user_permissions')
        .select('module, can_view, can_create, can_edit, can_delete')
        .eq('user_id', user.id);

      if (data && data.length > 0) {
        // User has custom permissions set
        const perms: ModulePermission[] = ALL_MODULES.map(m => {
          const found = data.find((d: any) => d.module === m.key);
          if (found) {
            return {
              module: m.key,
              can_view: found.can_view,
              can_create: found.can_create,
              can_edit: found.can_edit,
              can_delete: found.can_delete,
            };
          }
          // Default: viewer = view only
          return { module: m.key, can_view: role !== 'viewer', can_create: false, can_edit: false, can_delete: false };
        });
        setPermissions(perms);
      } else {
        // No custom permissions - use role defaults
        const perms: ModulePermission[] = ALL_MODULES.map(m => {
          if (role === 'viewer') {
            return { module: m.key, can_view: true, can_create: false, can_edit: false, can_delete: false };
          }
          if (role === 'accountant') {
            const accountingModules = ['transactions', 'funds', 'contacts', 'debts', 'ledger', 'reports'];
            const isAccounting = accountingModules.includes(m.key);
            return { module: m.key, can_view: true, can_create: isAccounting, can_edit: isAccounting, can_delete: false };
          }
          if (role === 'shipping_staff') {
            const shippingModules = ['shipping', 'contacts'];
            const isShipping = shippingModules.includes(m.key);
            return { module: m.key, can_view: true, can_create: isShipping, can_edit: isShipping, can_delete: false };
          }
          return { module: m.key, can_view: true, can_create: false, can_edit: false, can_delete: false };
        });
        setPermissions(perms);
      }
      setIsLoading(false);
    };

    fetchPermissions();
  }, [user, role, roleLoading]);

  const canView = (module: ModuleKey) => {
    if (role === 'owner' || role === 'admin') return true;
    const perm = permissions.find(p => p.module === module);
    return perm?.can_view ?? false;
  };

  const canCreate = (module: ModuleKey) => {
    if (role === 'owner' || role === 'admin') return true;
    const perm = permissions.find(p => p.module === module);
    return perm?.can_create ?? false;
  };

  const canEdit = (module: ModuleKey) => {
    if (role === 'owner' || role === 'admin') return true;
    const perm = permissions.find(p => p.module === module);
    return perm?.can_edit ?? false;
  };

  const canDelete = (module: ModuleKey) => {
    if (role === 'owner' || role === 'admin') return true;
    const perm = permissions.find(p => p.module === module);
    return perm?.can_delete ?? false;
  };

  return { permissions, isLoading, canView, canCreate, canEdit, canDelete };
}

// Helper to save permissions for a user
export async function saveUserPermissions(
  userId: string,
  companyId: string,
  permissions: ModulePermission[]
): Promise<{ error: string | null }> {
  // Delete existing permissions first
  await supabase
    .from('user_permissions')
    .delete()
    .eq('user_id', userId)
    .eq('company_id', companyId);

  if (permissions.length === 0) return { error: null };

  const rows = permissions.map(p => ({
    user_id: userId,
    company_id: companyId,
    module: p.module,
    can_view: p.can_view,
    can_create: p.can_create,
    can_edit: p.can_edit,
    can_delete: p.can_delete,
  }));

  const { error } = await supabase
    .from('user_permissions')
    .insert(rows);

  return { error: error?.message || null };
}

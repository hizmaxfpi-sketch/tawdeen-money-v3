import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type AppRole = 'owner' | 'admin' | 'accountant' | 'shipping_staff' | 'viewer';

// أولوية الأدوار: الأقوى أولاً (يُستخدم لاختيار الدور الفعلي عند تعدد الشركات)
const ROLE_PRIORITY: Record<AppRole, number> = {
  owner: 5,
  admin: 4,
  accountant: 3,
  shipping_staff: 2,
  viewer: 1,
};

interface UserRoleInfo {
  role: AppRole;
  isLoading: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageUsers: boolean;
  isViewer: boolean;
}

export function useUserRole(): UserRoleInfo {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole>('viewer');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole('viewer');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const fetchRole = async () => {
      // اختر الدور النشط الأعلى صلاحية للمستخدم الحالي
      // (يحمي ضد التشويش بين الشركات لو كان عضواً في أكثر من شركة)
      const { data } = await supabase
        .from('user_roles')
        .select('role, company_id, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (cancelled) return;

      const roles = (data || []).map(r => r.role as AppRole);
      if (roles.length === 0) {
        setRole('viewer');
      } else {
        roles.sort((a, b) => ROLE_PRIORITY[b] - ROLE_PRIORITY[a]);
        setRole(roles[0]);
      }
      setIsLoading(false);
    };

    fetchRole();
    return () => { cancelled = true; };
  }, [user]);

  const isViewer = role === 'viewer';
  const canEdit = !isViewer;
  const canDelete = role === 'owner' || role === 'admin';
  const canManageUsers = role === 'owner' || role === 'admin';

  return { role, isLoading, canEdit, canDelete, canManageUsers, isViewer };
}

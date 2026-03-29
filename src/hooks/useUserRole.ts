import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type AppRole = 'owner' | 'admin' | 'accountant' | 'shipping_staff' | 'viewer';

interface UserRoleInfo {
  role: AppRole;
  isLoading: boolean;
  canEdit: boolean;      // owner, admin, accountant, shipping_staff
  canDelete: boolean;    // owner, admin
  canManageUsers: boolean; // owner, admin
  isViewer: boolean;
}

export function useUserRole(): UserRoleInfo {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole>('viewer');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const fetchRole = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      setRole((data?.role as AppRole) || 'viewer');
      setIsLoading(false);
    };

    fetchRole();
  }, [user]);

  const isViewer = role === 'viewer';
  const canEdit = !isViewer;
  const canDelete = role === 'owner' || role === 'admin';
  const canManageUsers = role === 'owner' || role === 'admin';

  return { role, isLoading, canEdit, canDelete, canManageUsers, isViewer };
}

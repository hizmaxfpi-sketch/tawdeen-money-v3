import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

interface RoleGuardProps {
  children: React.ReactNode;
  requireEdit?: boolean;
  requireDelete?: boolean;
}

export function RoleGuard({ children, requireEdit = true }: RoleGuardProps) {
  const { canEdit, canDelete, isLoading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && requireEdit && !canEdit) {
      toast.error('ليس لديك صلاحية للقيام بهذا الإجراء');
      navigate(-1);
    }
  }, [isLoading, canEdit, requireEdit, navigate]);

  if (isLoading) return null;
  if (requireEdit && !canEdit) return null;

  return <>{children}</>;
}

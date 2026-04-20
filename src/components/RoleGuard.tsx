import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';

interface RoleGuardProps {
  children: React.ReactNode;
  requireEdit?: boolean;
  requireDelete?: boolean;
}

export function RoleGuard({ children, requireEdit = true }: RoleGuardProps) {
  const { canEdit, canDelete, isLoading } = useUserRole();
  const { t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && requireEdit && !canEdit) {
      toast.error(t('common.unauthorized'));
      navigate(-1);
    }
  }, [isLoading, canEdit, requireEdit, navigate, t]);

  if (isLoading) return null;
  if (requireEdit && !canEdit) return null;

  return <>{children}</>;
}

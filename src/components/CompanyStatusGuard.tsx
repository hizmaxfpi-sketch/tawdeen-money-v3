import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Ban, Clock, XCircle } from 'lucide-react';

const statusMessages: Record<string, { icon: any; title: string; description: string }> = {
  pending: {
    icon: Clock,
    title: 'حسابك قيد المراجعة',
    description: 'تم إنشاء حسابك بنجاح وهو بانتظار التفعيل من إدارة المنصة. سيتم إشعارك عند التفعيل.',
  },
  suspended: {
    icon: Ban,
    title: 'تم تعليق حسابك',
    description: 'تم تعليق حساب شركتك. يرجى التواصل مع إدارة المنصة لمزيد من المعلومات.',
  },
  cancelled: {
    icon: XCircle,
    title: 'تم إلغاء حسابك',
    description: 'تم إلغاء اشتراك شركتك. يرجى التواصل مع إدارة المنصة لإعادة التفعيل.',
  },
};

export function CompanyStatusGuard({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    if (user) checkStatus();
  }, [user]);

  const checkStatus = async () => {
    // Check if platform admin first
    const { data: adminData } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (adminData) {
      setIsPlatformAdmin(true);
      setStatus('active');
      setLoading(false);
      return;
    }

    // Get company status
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('company_id')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .maybeSingle();

    if (roleData?.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('status')
        .eq('id', roleData.company_id)
        .maybeSingle();
      setStatus(company?.status || 'pending');
    } else {
      setStatus('pending');
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'active' || isPlatformAdmin) {
    return <>{children}</>;
  }

  const msg = statusMessages[status || 'pending'] || statusMessages.pending;
  const Icon = msg.icon;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4" dir="rtl">
      <Card className="max-w-sm w-full">
        <CardContent className="p-6 text-center space-y-4">
          <Icon className="h-16 w-16 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">{msg.title}</h2>
          <p className="text-sm text-muted-foreground">{msg.description}</p>
          <Button variant="outline" onClick={signOut} className="w-full">
            تسجيل خروج
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

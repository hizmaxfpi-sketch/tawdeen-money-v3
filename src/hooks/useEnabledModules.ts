import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ModuleKey = 'home' | 'funds' | 'accounts' | 'projects' | 'business' | 'shipping' | 'production' | 'reports';

const ALL_MODULES: ModuleKey[] = ['home', 'funds', 'accounts', 'projects', 'business', 'shipping', 'production', 'reports'];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  home: 'الرئيسية',
  funds: 'الصناديق',
  accounts: 'الحسابات الدفترية',
  projects: 'المشاريع',
  business: 'الأعمال',
  shipping: 'الشحن',
  production: 'الإنتاج',
  reports: 'التقارير',
};

const MODULES_REQUIRED: ModuleKey[] = ['home']; // الرئيسية دائماً مفعّلة

/**
 * يجلب قائمة الأقسام المفعّلة لشركة المستخدم الحالي.
 * إذا لم يكن المستخدم مرتبطاً بشركة، تُرجع كل الأقسام.
 */
export function useEnabledModules() {
  const { user } = useAuth();
  // ابدأ بقائمة فارغة (فقط الرئيسية) حتى لا تظهر الأقسام المعطّلة قبل التحميل
  const [enabled, setEnabled] = useState<ModuleKey[]>(MODULES_REQUIRED);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setEnabled(ALL_MODULES);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_enabled_modules');
      if (error) throw error;
      const list = (data as string[] | null) ?? ALL_MODULES;
      const valid = list.filter((m): m is ModuleKey =>
        (ALL_MODULES as string[]).includes(m)
      );
      // ضمان وجود الأقسام الإلزامية
      MODULES_REQUIRED.forEach(req => {
        if (!valid.includes(req)) valid.unshift(req);
      });
      setEnabled(valid.length ? valid : ALL_MODULES);
    } catch {
      setEnabled(ALL_MODULES);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // إعادة تحميل عند تغيّر إعدادات الشركة (عبر realtime على جدول companies)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('company-modules-' + user.id)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'companies' },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const isEnabled = useCallback(
    (module: ModuleKey) => enabled.includes(module),
    [enabled]
  );

  return { enabled, isEnabled, loading, allModules: ALL_MODULES, refresh: load };
}

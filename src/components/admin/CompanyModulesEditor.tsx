import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { ModuleKey, MODULE_LABELS } from '@/hooks/useEnabledModules';

const MODULES: ModuleKey[] = ['home', 'funds', 'accounts', 'projects', 'business', 'shipping', 'reports'];
const REQUIRED: ModuleKey[] = ['home'];

interface Props {
  companyId: string;
  onSaved?: () => void;
}

export function CompanyModulesEditor({ companyId, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<Set<ModuleKey>>(new Set(MODULES));

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('companies')
        .select('enabled_modules')
        .eq('id', companyId)
        .maybeSingle();
      const list = (data?.enabled_modules as ModuleKey[] | null) ?? MODULES;
      setEnabled(new Set(list));
      setLoading(false);
    })();
  }, [companyId]);

  const toggle = (m: ModuleKey) => {
    if (REQUIRED.includes(m)) return;
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const list = MODULES.filter(m => enabled.has(m) || REQUIRED.includes(m));
    const { error } = await supabase
      .from('companies')
      .update({ enabled_modules: list })
      .eq('id', companyId);
    setSaving(false);
    if (error) {
      toast.error('فشل حفظ إعدادات الأقسام');
      return;
    }
    toast.success('تم حفظ الأقسام المفعّلة');
    onSaved?.();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <LayoutGrid className="h-4 w-4 text-primary" />
            الأقسام المفعّلة
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            حفظ
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          اختر الأقسام التي ستظهر لهذه الشركة. القسم "الرئيسية" دائماً مفعّل.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {MODULES.map(m => {
            const isRequired = REQUIRED.includes(m);
            const checked = enabled.has(m);
            return (
              <label
                key={m}
                className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                  checked ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'
                } ${isRequired ? 'opacity-70 cursor-not-allowed' : 'hover:bg-accent'}`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(m)}
                  disabled={isRequired}
                  className="h-3.5 w-3.5"
                />
                <span className="font-medium">{MODULE_LABELS[m]}</span>
                {isRequired && <span className="text-[9px] text-muted-foreground mr-auto">(إلزامي)</span>}
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

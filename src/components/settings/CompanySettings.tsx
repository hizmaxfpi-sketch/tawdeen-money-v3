import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';

export function CompanySettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    tax_number: '',
  });

  useEffect(() => {
    if (!user) return;
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('company_settings')
      .select('*')
      .eq('user_id', user!.id)
      .maybeSingle();
    
    if (data) {
      setForm({
        company_name: data.company_name || '',
        company_address: data.company_address || '',
        company_phone: data.company_phone || '',
        company_email: data.company_email || '',
        tax_number: data.tax_number || '',
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    
    const { error } = await supabase
      .from('company_settings')
      .upsert({
        user_id: user.id,
        ...form,
      }, { onConflict: 'user_id' });
    
    setSaving(false);
    if (error) {
      toast.error('فشل حفظ البيانات');
    } else {
      toast.success('تم حفظ بيانات الشركة');
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="space-y-2">
        <Label>اسم الشركة</Label>
        <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="اسم الشركة أو المؤسسة" />
      </div>
      <div className="space-y-2">
        <Label>رقم الهاتف</Label>
        <Input value={form.company_phone} onChange={e => setForm(f => ({ ...f, company_phone: e.target.value }))} placeholder="+966..." dir="ltr" />
      </div>
      <div className="space-y-2">
        <Label>البريد الإلكتروني</Label>
        <Input value={form.company_email} onChange={e => setForm(f => ({ ...f, company_email: e.target.value }))} placeholder="info@company.com" dir="ltr" />
      </div>
      <div className="space-y-2">
        <Label>الرقم الضريبي</Label>
        <Input value={form.tax_number} onChange={e => setForm(f => ({ ...f, tax_number: e.target.value }))} placeholder="الرقم الضريبي" dir="ltr" />
      </div>
      <div className="space-y-2">
        <Label>العنوان</Label>
        <Textarea value={form.company_address} onChange={e => setForm(f => ({ ...f, company_address: e.target.value }))} placeholder="عنوان الشركة" rows={2} />
      </div>
      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        حفظ البيانات
      </Button>
    </div>
  );
}

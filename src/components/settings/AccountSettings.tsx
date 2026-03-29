import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { KeyRound, Mail, Loader2, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AccountSettings() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [saving, setSaving] = useState<string | null>(null);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('كلمة السر يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('كلمات السر غير متطابقة');
      return;
    }
    setSaving('password');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(null);
    if (error) {
      toast.error('فشل تغيير كلمة السر: ' + error.message);
    } else {
      toast.success('تم تغيير كلمة السر بنجاح');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      toast.error('أدخل بريد إلكتروني صحيح');
      return;
    }
    setSaving('email');
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setSaving(null);
    if (error) {
      toast.error('فشل تغيير البريد: ' + error.message);
    } else {
      toast.success('تم إرسال رابط التأكيد إلى البريد الجديد');
      setNewEmail('');
    }
  };

  const handleUpdateName = async () => {
    if (!fullName.trim()) {
      toast.error('أدخل الاسم');
      return;
    }
    setSaving('name');
    const { error: authError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (!authError) {
      await supabase.from('profiles').update({ full_name: fullName }).eq('user_id', user!.id);
    }
    setSaving(null);
    if (authError) {
      toast.error('فشل تحديث الاسم');
    } else {
      toast.success('تم تحديث الاسم بنجاح');
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Display Name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4" /> الاسم الكامل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="الاسم الكامل" />
          <Button size="sm" onClick={handleUpdateName} disabled={saving === 'name'} className="w-full gap-2">
            {saving === 'name' ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
            تحديث الاسم
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> تغيير كلمة السر
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>كلمة السر الجديدة</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="كلمة السر الجديدة" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>تأكيد كلمة السر</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="أعد كتابة كلمة السر" dir="ltr" />
          </div>
          <Button size="sm" onClick={handleChangePassword} disabled={saving === 'password'} className="w-full gap-2">
            {saving === 'password' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            تغيير كلمة السر
          </Button>
        </CardContent>
      </Card>

      {/* Change Email */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4" /> تغيير البريد الإلكتروني
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">البريد الحالي: <span dir="ltr" className="font-mono">{user?.email}</span></p>
          <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="البريد الجديد" dir="ltr" />
          <Button size="sm" onClick={handleChangeEmail} disabled={saving === 'email'} className="w-full gap-2">
            {saving === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            تغيير البريد
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

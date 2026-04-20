import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { KeyRound, Mail, Loader2, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/i18n/LanguageContext';

export function AccountSettings() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [saving, setSaving] = useState<string | null>(null);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error(t('auth.passwordMinError'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('auth.passwordMismatchError'));
      return;
    }
    setSaving('password');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(null);
    if (error) {
      toast.error(t('common.error') + ': ' + error.message);
    } else {
      toast.success(t('common.success'));
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      toast.error(t('auth.emailInvalid'));
      return;
    }
    setSaving('email');
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setSaving(null);
    if (error) {
      toast.error(t('common.error') + ': ' + error.message);
    } else {
      toast.success(t('auth.emailUpdateSuccess'));
      setNewEmail('');
    }
  };

  const handleUpdateName = async () => {
    if (!fullName.trim()) {
      toast.error(t('auth.nameRequired'));
      return;
    }
    setSaving('name');
    const { error: authError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (!authError) {
      await supabase.from('profiles').update({ full_name: fullName }).eq('user_id', user!.id);
    }
    setSaving(null);
    if (authError) {
      toast.error(t('common.error'));
    } else {
      toast.success(t('common.success'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Display Name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4" /> {t('auth.fullName')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('auth.fullName')} />
          <Button size="sm" onClick={handleUpdateName} disabled={saving === 'name'} className="w-full gap-2">
            {saving === 'name' ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
            {t('auth.updateName')}
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> {t('settings.darkMode') === 'Dark Mode' ? 'Change Password' : 'تغيير كلمة السر'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>{t('auth.newPassword')}</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('auth.newPassword')} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>{t('auth.confirmNewPassword')}</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('auth.confirmNewPassword')} dir="ltr" />
          </div>
          <Button size="sm" onClick={handleChangePassword} disabled={saving === 'password'} className="w-full gap-2">
            {saving === 'password' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {t('settings.darkMode') === 'Dark Mode' ? 'Change Password' : 'تغيير كلمة السر'}
          </Button>
        </CardContent>
      </Card>

      {/* Change Email */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4" /> {t('auth.updateEmail')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('auth.currentEmail')}: <span dir="ltr" className="font-mono">{user?.email}</span></p>
          <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={t('auth.email')} dir="ltr" />
          <Button size="sm" onClick={handleChangeEmail} disabled={saving === 'email'} className="w-full gap-2">
            {saving === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {t('auth.updateEmail')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

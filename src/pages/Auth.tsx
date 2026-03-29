import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, User, LogIn, UserPlus, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';

export default function Auth() {
  const { user, loading } = useAuth();
  const { t, dir } = useLanguage();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4" dir={dir}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <img src={logo} alt="توطين" className="h-16 w-16 mx-auto mb-3 rounded-xl" />
          <h1 className="text-2xl font-bold text-foreground">توطين</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('brand.slogan')}</p>
        </div>

        <Card className="border-border shadow-lg">
          <Tabs defaultValue="login" className="w-full">
            <div className="pb-2 pt-4 px-4">
              <TabsList className="w-full h-10">
                <TabsTrigger value="login" className="flex-1 gap-1.5 text-sm">
                  <LogIn className="h-4 w-4" />
                  {t('auth.login')}
                </TabsTrigger>
                <TabsTrigger value="register" className="flex-1 gap-1.5 text-sm">
                  <UserPlus className="h-4 w-4" />
                  {t('auth.register')}
                </TabsTrigger>
              </TabsList>
            </div>

            <CardContent>
              <TabsContent value="login">
                <LoginForm />
              </TabsContent>
              <TabsContent value="register">
                <RegisterForm />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </motion.div>
    </div>
  );
}

function LoginForm() {
  const { signIn } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error(t('auth.fillAll'));
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error.message === 'Invalid login credentials' 
        ? t('auth.invalidCredentials') 
        : error.message);
    } else {
      toast.success(t('auth.login.success'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">{t('auth.email')}</Label>
        <div className="relative">
          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:right-3 ltr:left-3" />
          <Input
            id="login-email"
            type="email"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ps-10 text-left"
            dir="ltr"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">{t('auth.password')}</Label>
        <div className="relative">
          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:right-3 ltr:left-3" />
          <Input
            id="login-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ps-10 text-left"
            dir="ltr"
          />
        </div>
      </div>
      <Button type="submit" className="w-full gap-2" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {t('auth.login.button')}
      </Button>
    </form>
  );
}

function RegisterForm() {
  const { signUp } = useAuth();
  const { t } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      toast.error(t('auth.fillAll'));
      return;
    }
    if (password.length < 6) {
      toast.error(t('auth.passwordMin'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, fullName, companyName || undefined);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('auth.register.success'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reg-name">{t('auth.fullName')}</Label>
        <div className="relative">
          <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:right-3 ltr:left-3" />
          <Input id="reg-name" type="text" placeholder={t('auth.namePlaceholder')} value={fullName} onChange={(e) => setFullName(e.target.value)} className="ps-10" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-company">{t('auth.companyNameOptional')}</Label>
        <div className="relative">
          <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:right-3 ltr:left-3" />
          <Input id="reg-company" type="text" placeholder={t('auth.companyPlaceholder')} value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="ps-10" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-email">{t('auth.email')}</Label>
        <div className="relative">
          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:right-3 ltr:left-3" />
          <Input id="reg-email" type="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} className="ps-10 text-left" dir="ltr" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-password">{t('auth.password')}</Label>
        <div className="relative">
          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:right-3 ltr:left-3" />
          <Input id="reg-password" type="password" placeholder={t('auth.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} className="ps-10 text-left" dir="ltr" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-confirm">{t('auth.confirmPassword')}</Label>
        <div className="relative">
          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:right-3 ltr:left-3" />
          <Input id="reg-confirm" type="password" placeholder={t('auth.confirmPlaceholder')} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="ps-10 text-left" dir="ltr" />
        </div>
      </div>
      <Button type="submit" className="w-full gap-2" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        {t('auth.register.button')}
      </Button>
    </form>
  );
}

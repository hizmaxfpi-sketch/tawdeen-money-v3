import { useState, useEffect } from 'react';
import { Moon, Sun, LogOut, Menu, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { LanguageSelector } from '@/components/shared/LanguageSelector';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import logo from '@/assets/logo.png';

export function Header() {
  const { isDark, toggle } = useTheme();
  const { signOut, user } = useAuth();
  const { t } = useLanguage();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      supabase.from('platform_admins').select('id').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => setIsPlatformAdmin(!!data));
    }
  }, [user]);

  return (
    <>
      <header className="sticky top-0 z-50 bg-gradient-primary text-primary-foreground shadow-lg">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="توطين" className="h-8 w-8 rounded-lg object-contain" />
            <div>
              <h1 className="text-sm font-bold leading-tight">{t('brand.name')}</h1>
              <p className="text-[9px] opacity-80 leading-tight">{t('brand.slogan')} <span className="opacity-60">v3.0</span></p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <LanguageSelector />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggle}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/10 backdrop-blur-sm transition-colors hover:bg-primary-foreground/20"
              aria-label={t('header.toggleTheme')}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.button>
            {user && (
              <>
                {isPlatformAdmin && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => navigate('/admin')}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/20 backdrop-blur-sm transition-colors hover:bg-yellow-500/30"
                    aria-label={t('header.platformAdmin')}
                  >
                    <Shield className="h-4 w-4 text-yellow-300" />
                  </motion.button>
                )}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setSettingsOpen(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/10 backdrop-blur-sm transition-colors hover:bg-primary-foreground/20"
                  aria-label={t('header.settings')}
                >
                  <Menu className="h-4 w-4" />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={signOut}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/10 backdrop-blur-sm transition-colors hover:bg-primary-foreground/20"
                  aria-label={t('auth.logout')}
                >
                  <LogOut className="h-4 w-4" />
                </motion.button>
              </>
            )}
          </div>
        </div>
      </header>
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

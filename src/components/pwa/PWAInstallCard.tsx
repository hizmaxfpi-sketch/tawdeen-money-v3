import { Download, Share2, Copy, Smartphone } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useLanguage } from '@/i18n/LanguageContext';

export function PWAInstallCard() {
  const { isInstalled, install, share, copyLink } = usePWAInstall();
  const { t } = useLanguage();

  if (isInstalled) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-gradient-to-br from-primary/10 via-accent/50 to-secondary/10 border border-primary/20 p-4"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">{t('pwa.install')}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            {t('pwa.installDesc')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="default" size="sm" onClick={install} className="h-9 text-xs gap-1.5 font-medium">
          <Download className="h-3.5 w-3.5" />
          {t('pwa.download')}
        </Button>
        <Button variant="outline" size="sm" onClick={share} className="h-9 text-xs gap-1.5 font-medium">
          <Share2 className="h-3.5 w-3.5" />
          {t('pwa.share')}
        </Button>
        <Button variant="outline" size="sm" onClick={copyLink} className="h-9 text-xs gap-1.5 font-medium">
          <Copy className="h-3.5 w-3.5" />
          {t('pwa.copyLink')}
        </Button>
      </div>
    </motion.div>
  );
}

import { Home, Wallet, FileText, Ship, BookOpen, Briefcase, Store, Factory } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { useEnabledModules, ModuleKey } from '@/hooks/useEnabledModules';

type PageType = 'home' | 'funds' | 'accounts' | 'projects' | 'shipping' | 'reports' | 'business' | 'production';

interface BottomNavProps {
  currentPage: string;
  onNavigate: (page: PageType) => void;
}

const navItemKeys: { id: PageType; icon: typeof Home; labelKey: string }[] = [
  { id: 'home', icon: Home, labelKey: 'nav.home' },
  { id: 'funds', icon: Wallet, labelKey: 'nav.funds' },
  { id: 'accounts', icon: BookOpen, labelKey: 'nav.accounts' },
  { id: 'business', icon: Store, labelKey: 'nav.business' },
  { id: 'projects', icon: Briefcase, labelKey: 'nav.projects' },
  { id: 'shipping', icon: Ship, labelKey: 'nav.shipping' },
  { id: 'production', icon: Factory, labelKey: 'nav.production' },
  { id: 'reports', icon: FileText, labelKey: 'nav.reports' },
];

export function BottomNav({ currentPage, onNavigate }: BottomNavProps) {
  const { t } = useLanguage();
  const { isEnabled } = useEnabledModules();
  const visibleItems = navItemKeys.filter(item => isEnabled(item.id as ModuleKey));
  return (
    <nav className="fixed bottom-0 left-0 right-0 w-full z-40 bg-card/95 backdrop-blur-xl border-t border-border shadow-lg">
      <div className="flex h-16 w-full items-center justify-around">
        {visibleItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;
          
          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div className="relative">
                {isActive && (
                  <motion.div
                    layoutId="navIndicator"
                    className="absolute -inset-1.5 rounded-lg bg-accent"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <Icon className={cn("relative h-5 w-5", isActive && "text-primary")} />
              </div>
              <span className={cn("text-[9px] font-medium", isActive && "font-bold")}>{t(item.labelKey)}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}

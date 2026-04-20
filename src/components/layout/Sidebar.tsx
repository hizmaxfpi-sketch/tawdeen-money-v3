import { Home, Wallet, FileText, Ship, BookOpen, Briefcase, Store, Factory } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { useEnabledModules, ModuleKey } from '@/hooks/useEnabledModules';

type PageType = 'home' | 'funds' | 'accounts' | 'projects' | 'shipping' | 'reports' | 'business' | 'production';

interface SidebarProps {
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

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { t, language } = useLanguage();
  const { isEnabled, loading } = useEnabledModules();

  const visibleItems = loading
    ? navItemKeys.filter(item => item.id === 'home')
    : navItemKeys.filter(item => isEnabled(item.id as ModuleKey));

  return (
    <aside className={cn(
      "hidden md:flex flex-col w-64 h-screen fixed top-0 bg-card z-40",
      language === 'ar' ? "right-0 border-l" : "left-0 border-r"
    )}>
      <div className="p-6">
        <h1 className="text-2xl font-bold text-primary">{t('brand.name')}</h1>
        <p className="text-xs text-muted-foreground mt-1">{t('brand.description')}</p>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4">
        {visibleItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
              <span className={cn("text-sm font-medium", isActive && "font-bold")}>
                {t(item.labelKey)}
              </span>
              {isActive && (
                <motion.div
                  layoutId="activeTabSidebar"
                  className="absolute right-0 w-1 h-6 bg-primary-foreground rounded-l-full"
                  initial={false}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="bg-muted/50 rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground">{t('misc.version')} 3.0</p>
        </div>
      </div>
    </aside>
  );
}

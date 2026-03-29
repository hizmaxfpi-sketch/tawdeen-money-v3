import { motion } from 'framer-motion';
import { Ship, Loader, Anchor, Package, CheckCircle } from 'lucide-react';
import { ContainerStatus } from '@/types/finance';
import { cn } from '@/lib/utils';

interface StatusTimelineProps {
  currentStatus: ContainerStatus;
  departureDate?: string;
  arrivalDate?: string;
  compact?: boolean;
}

const STATUSES = [
  { 
    id: 'loading', 
    label: 'قيد التحميل', 
    shortLabel: 'تحميل',
    icon: Loader,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-500'
  },
  { 
    id: 'shipped', 
    label: 'تم الإبحار', 
    shortLabel: 'إبحار',
    icon: Ship,
    color: 'text-blue-600',
    bgColor: 'bg-blue-500'
  },
  { 
    id: 'arrived', 
    label: 'وصل الميناء', 
    shortLabel: 'وصول',
    icon: Anchor,
    color: 'text-purple-600',
    bgColor: 'bg-purple-500'
  },
  { 
    id: 'delivered', 
    label: 'تم التسليم', 
    shortLabel: 'تسليم',
    icon: CheckCircle,
    color: 'text-income',
    bgColor: 'bg-income'
  },
];

export function StatusTimeline({ currentStatus, departureDate, arrivalDate, compact = false }: StatusTimelineProps) {
  const currentIndex = STATUSES.findIndex(s => s.id === currentStatus);
  
  return (
    <div className={cn("w-full", compact ? "py-2" : "py-3")} dir="rtl">
      {/* Timeline Container - RTL: يبدأ من اليمين للمحتوى العربي */}
      <div className="relative flex items-center justify-between">
        {/* خط التقدم الخلفي */}
        <div className="absolute top-1/2 inset-x-0 h-0.5 bg-muted -translate-y-1/2 z-0" />
        
        {/* خط التقدم المكتمل - RTL: يبدأ من اليمين ويتقدم لليسار */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(currentIndex / (STATUSES.length - 1)) * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={cn(
            "absolute top-1/2 h-0.5 -translate-y-1/2 z-0",
            STATUSES[currentIndex]?.bgColor || 'bg-muted'
          )}
          style={{ 
            right: 0, 
            left: 'auto',
            transformOrigin: 'right' 
          }}
        />
        
        {/* نقاط الحالات */}
        {STATUSES.map((status, index) => {
          const isCompleted = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const Icon = status.icon;
          
          return (
            <motion.div
              key={status.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.1 }}
              className="relative z-10 flex flex-col items-center"
            >
              {/* الدائرة */}
              <motion.div
                animate={isCurrent ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: isCurrent ? Infinity : 0, duration: 2 }}
                className={cn(
                  "flex items-center justify-center rounded-full border-2 transition-all",
                  compact ? "w-7 h-7" : "w-9 h-9",
                  isCompleted 
                    ? `${status.bgColor} border-transparent text-white shadow-md` 
                    : "bg-card border-muted text-muted-foreground"
                )}
              >
                <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </motion.div>
              
              {/* التسمية */}
              <span className={cn(
                "mt-1 text-center leading-tight",
                compact ? "text-[9px]" : "text-[10px]",
                isCompleted ? status.color : "text-muted-foreground"
              )}>
                {compact ? status.shortLabel : status.label}
              </span>
              
              {/* نقطة النبض للحالة الحالية */}
              {isCurrent && (
                <motion.div
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className={cn(
                    "absolute rounded-full",
                    compact ? "w-7 h-7 top-0" : "w-9 h-9 top-0",
                    status.bgColor,
                    "opacity-30"
                  )}
                />
              )}
            </motion.div>
          );
        })}
      </div>
      
      {/* التواريخ (إن وجدت) */}
      {!compact && (departureDate || arrivalDate) && (
        <div className="flex justify-between mt-3 text-[10px] text-muted-foreground">
          {departureDate ? (
            <div className="text-center">
              <span className="block text-muted-foreground/70">المغادرة</span>
              <span className="font-medium">{new Date(departureDate).toLocaleDateString('ar-SA')}</span>
            </div>
          ) : <div />}
          
          {arrivalDate ? (
            <div className="text-center">
              <span className="block text-muted-foreground/70">الوصول المتوقع</span>
              <span className="font-medium">{new Date(arrivalDate).toLocaleDateString('ar-SA')}</span>
            </div>
          ) : <div />}
        </div>
      )}
    </div>
  );
}

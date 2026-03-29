import { motion } from 'framer-motion';
import { Container } from '@/types/finance';
import { cn } from '@/lib/utils';

interface VisualContainerLoaderProps {
  container: Container;
  compact?: boolean;
}

export function VisualContainerLoader({ container, compact = false }: VisualContainerLoaderProps) {
  const usagePercent = Math.min((container.usedCapacity / container.capacity) * 100, 100);
  const isOverCapacity = container.usedCapacity > container.capacity;
  const remaining = container.capacity - container.usedCapacity;

  const filledBoxes = Math.min(Math.ceil(usagePercent / 10), 10);
  
  return (
    <div dir="rtl" className={cn("space-y-2", compact ? "" : "p-3 bg-muted/30 rounded-lg")}>
      <div className="relative">
        <div className={cn(
          "relative border-2 rounded-lg overflow-hidden transition-colors",
          isOverCapacity ? "border-destructive bg-destructive/5" : "border-primary/30 bg-primary/5"
        )}>
          {/* شريط الأبواب - منقول لليمين */}
          <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-muted to-transparent flex flex-col justify-center items-center gap-1 z-10">
            <div className="w-1.5 h-3 bg-muted-foreground/30 rounded-full" />
            <div className="w-1.5 h-3 bg-muted-foreground/30 rounded-full" />
          </div>
          
          {/* محتوى الحاوية - بادئة من اليمين pl-2 */}
          <div className={cn(
            "grid gap-0.5 p-1.5 pl-2",
            compact ? "grid-cols-10 h-8" : "grid-cols-10 h-12"
          )}>
            {[...Array(10)].map((_, index) => {
              const isFilled = index < filledBoxes;
              const isLast = index === filledBoxes - 1 && filledBoxes < 10;
              const partialFill = isLast ? (usagePercent % 10) / 10 : 1;
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ 
                    opacity: isFilled ? 1 : 0.2, 
                    scale: isFilled ? 1 : 0.9 
                  }}
                  transition={{ delay: index * 0.03 }}
                  className={cn(
                    "rounded-sm relative overflow-hidden",
                    isFilled 
                      ? isOverCapacity 
                        ? "bg-destructive" 
                        : usagePercent > 80 
                          ? "bg-yellow-500"
                          : "bg-income"
                      : "bg-muted-foreground/10"
                  )}
                >
                  {/* التعبئة الجزئية - معدلة لـ RTL */}
                  {isLast && partialFill < 1 && (
                    <div 
                      className="absolute inset-0 bg-muted-foreground/20"
                      style={{ 
                        clipPath: `inset(0 ${partialFill * 100}% 0 0)` 
                      }}
                    />
                  )}
                  {isFilled && (
                    <div className="absolute inset-0.5 border border-white/20 rounded-sm" />
                  )}
                </motion.div>
              );
            })}
          </div>
          
          {/* نوع الحاوية - منقول لليسار */}
          <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] font-bold text-muted-foreground/50 -rotate-90">
            {container.type.toUpperCase()}
          </div>
        </div>
        
        {isOverCapacity && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute -top-1 -left-1 bg-destructive text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow-lg"
          >
            ⚠️ تجاوز!
          </motion.div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-right">
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-bold",
            isOverCapacity ? "text-destructive" : usagePercent > 80 ? "text-yellow-600" : "text-income"
          )}>
            {container.usedCapacity.toFixed(1)} CBM
          </span>
          <span className="text-muted-foreground">/ {container.capacity} CBM</span>
        </div>
        
        <div className="flex items-center gap-1">
          {isOverCapacity ? (
            <span className="text-destructive font-bold">+{Math.abs(remaining).toFixed(1)} زيادة</span>
          ) : (
            <span className="text-income">متبقي {remaining.toFixed(1)}</span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-1">
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(usagePercent, 100)}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={cn(
              "h-full rounded-full",
              isOverCapacity ? "bg-destructive" : usagePercent > 80 ? "bg-yellow-500" : "bg-income"
            )}
          />
        </div>
        <span className={cn(
          "text-[10px] font-bold min-w-[35px] text-left",
          isOverCapacity ? "text-destructive" : ""
        )}>
          {usagePercent.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
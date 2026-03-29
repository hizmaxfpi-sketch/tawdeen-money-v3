import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Ship, Package, Wallet, Users, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CoachStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  target?: string;
}

const COACH_STEPS: CoachStep[] = [
  {
    id: 'welcome',
    title: 'مرحباً بك في إدارة مالية',
    description: 'نظام متكامل لإدارة الحسابات والمشاريع المالية. دعنا نأخذك في جولة سريعة للتعرف على أهم الميزات.',
    icon: <CheckCircle className="h-8 w-8" />,
  },
  {
    id: 'containers',
    title: 'إدارة الحاويات',
    description: 'أضف حاوياتك وتتبع حالتها من التحميل حتى التسليم. يمكنك إضافة حاوية جديدة من قسم الشحن.',
    icon: <Ship className="h-8 w-8" />,
    target: 'shipping',
  },
  {
    id: 'shipments',
    title: 'تسجيل الشحنات',
    description: 'سجل شحنات العملاء مع حساب تلقائي للـ CBM وقيمة المقاولة بناءً على الأبعاد.',
    icon: <Package className="h-8 w-8" />,
    target: 'shipping',
  },
  {
    id: 'finance',
    title: 'إدارة الصناديق',
    description: 'تابع أرصدة صناديقك النقدية والبنكية، وسجل جميع العمليات المالية بسهولة.',
    icon: <Wallet className="h-8 w-8" />,
    target: 'funds',
  },
  {
    id: 'clients',
    title: 'دليل جهات الاتصال',
    description: 'احفظ بيانات عملائك ومورديك للوصول السريع وتتبع المديونيات.',
    icon: <Users className="h-8 w-8" />,
    target: 'contacts',
  },
];

const STORAGE_KEY = 'trust_onboarding_completed';

export function CoachMarks() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // التحقق من عرض الجولة مسبقاً
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      // تأخير بسيط لعرض الجولة بعد تحميل الصفحة
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < COACH_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const step = COACH_STEPS[currentStep];
  const isLast = currentStep === COACH_STEPS.length - 1;
  const isFirst = currentStep === 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header with gradient */}
          <div className="bg-gradient-primary p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkip}
                className="text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="flex gap-1.5">
                {COACH_STEPS.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === currentStep
                        ? 'w-6 bg-white'
                        : idx < currentStep
                        ? 'w-1.5 bg-white/80'
                        : 'w-1.5 bg-white/30'
                    }`}
                  />
                ))}
              </div>
            </div>
            
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-white/20 mb-4">
                {step.icon}
              </div>
              <h2 className="text-xl font-bold mb-2">{step.title}</h2>
            </motion.div>
          </div>

          {/* Content */}
          <div className="p-6">
            <motion.p
              key={`desc-${step.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-muted-foreground text-center leading-relaxed mb-6"
            >
              {step.description}
            </motion.p>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                onClick={handlePrev}
                disabled={isFirst}
                className="gap-1"
              >
                <ChevronRight className="h-4 w-4" />
                السابق
              </Button>
              
              <Button
                onClick={handleNext}
                className="gap-1 min-w-[100px]"
              >
                {isLast ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    ابدأ الآن
                  </>
                ) : (
                  <>
                    التالي
                    <ChevronLeft className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            {/* Skip link */}
            {!isLast && (
              <button
                onClick={handleSkip}
                className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                تخطي الجولة
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Hook لإعادة تشغيل الجولة
export function useCoachMarks() {
  const resetTour = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  const isCompleted = () => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  };

  return { resetTour, isCompleted };
}

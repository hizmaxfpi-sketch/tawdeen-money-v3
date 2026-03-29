import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, Coffee, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PomodoroTimer() {
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [seconds, setSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const WORK_TIME = 25 * 60;
  const BREAK_TIME = 5 * 60;

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds(prev => {
          if (prev <= 1) {
            // Timer completed
            if (mode === 'work') {
              setSessions(s => s + 1);
              setMode('break');
              return BREAK_TIME;
            } else {
              setMode('work');
              return WORK_TIME;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, mode]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const progress = mode === 'work' 
    ? ((WORK_TIME - seconds) / WORK_TIME) * 100
    : ((BREAK_TIME - seconds) / BREAK_TIME) * 100;

  const handleReset = () => {
    setIsRunning(false);
    setMode('work');
    setSeconds(WORK_TIME);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl p-6 shadow-md text-primary-foreground",
        mode === 'work' ? "bg-gradient-gold" : "bg-gradient-income"
      )}
    >
      <div className="flex items-center justify-center gap-2 mb-4">
        {mode === 'work' ? (
          <>
            <Brain className="h-5 w-5" />
            <span className="font-medium">وقت العمل</span>
          </>
        ) : (
          <>
            <Coffee className="h-5 w-5" />
            <span className="font-medium">وقت الاستراحة</span>
          </>
        )}
      </div>

      {/* Circular Progress */}
      <div className="relative w-48 h-48 mx-auto mb-6">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="96"
            cy="96"
            r="88"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="8"
          />
          <motion.circle
            cx="96"
            cy="96"
            r="88"
            fill="none"
            stroke="white"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 88}
            initial={{ strokeDashoffset: 2 * Math.PI * 88 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 88 * (1 - progress / 100) }}
            transition={{ duration: 0.5 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl font-bold font-mono">{formatTime(seconds)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleReset}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/30"
        >
          <RotateCcw className="h-5 w-5" />
        </motion.button>
        
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsRunning(!isRunning)}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-foreground text-warning shadow-lg"
        >
          {isRunning ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 mr-[-2px]" />}
        </motion.button>
        
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-foreground/20">
          <span className="text-sm font-bold">{sessions}</span>
        </div>
      </div>

      <p className="text-center text-sm mt-4 opacity-90">
        جلسات مكتملة: {sessions}
      </p>
    </motion.div>
  );
}

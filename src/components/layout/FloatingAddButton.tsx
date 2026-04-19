import { Plus } from 'lucide-react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface FloatingAddButtonProps {
  onClick: () => void;
}

const STORAGE_KEY = 'tawdeen-fab-position';
const BUTTON_SIZE = 48;
const MARGIN = 8;
const BOTTOM_NAV_HEIGHT = 72; // مساحة الشريط السفلي

function getBounds() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    minX: MARGIN,
    maxX: w - BUTTON_SIZE - MARGIN,
    minY: MARGIN + 56, // أسفل الهيدر
    maxY: h - BUTTON_SIZE - BOTTOM_NAV_HEIGHT - MARGIN,
  };
}

function loadPosition() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
  } catch {}
  // الموقع الافتراضي: أسفل يسار
  return {
    x: MARGIN + 8,
    y: window.innerHeight - BUTTON_SIZE - BOTTOM_NAV_HEIGHT - MARGIN,
  };
}

export function FloatingAddButton({ onClick }: FloatingAddButtonProps) {
  const [mounted, setMounted] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const draggedRef = useRef(false);

  useEffect(() => {
    const pos = loadPosition();
    const b = getBounds();
    x.set(Math.min(Math.max(pos.x, b.minX), b.maxX));
    y.set(Math.min(Math.max(pos.y, b.minY), b.maxY));
    setMounted(true);

    const onResize = () => {
      const nb = getBounds();
      x.set(Math.min(Math.max(x.get(), nb.minX), nb.maxX));
      y.set(Math.min(Math.max(y.get(), nb.minY), nb.maxY));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [x, y]);

  const handleDragEnd = () => {
    const b = getBounds();
    const cx = x.get();
    const cy = Math.min(Math.max(y.get(), b.minY), b.maxY);
    // التصاق بأقرب حافة (يمين/يسار)
    const screenMid = window.innerWidth / 2;
    const targetX = cx + BUTTON_SIZE / 2 < screenMid ? b.minX : b.maxX;
    animate(x, targetX, { type: 'spring', stiffness: 400, damping: 30 });
    animate(y, cy, { type: 'spring', stiffness: 400, damping: 30 });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: targetX, y: cy }));
    } catch {}
    setTimeout(() => { draggedRef.current = false; }, 50);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (draggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  if (!mounted) return null;

  return (
    <motion.button
      drag
      dragMomentum={false}
      dragElastic={0.1}
      onDragStart={() => { draggedRef.current = true; }}
      onDragEnd={handleDragEnd}
      style={{ x, y, touchAction: 'none', position: 'fixed', top: 0, left: 0 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      type="button"
      className="z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-lg cursor-grab active:cursor-grabbing active:shadow-xl"
      aria-label="إضافة عملية - يمكن سحب الزر لتغيير موقعه"
    >
      <Plus className="h-6 w-6" />
    </motion.button>
  );
}

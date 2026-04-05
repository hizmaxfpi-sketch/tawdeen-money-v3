import { Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface FloatingAddButtonProps {
  onClick: () => void;
}

export function FloatingAddButton({ onClick }: FloatingAddButtonProps) {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      const hasModal = document.body.querySelector('[role="dialog"]') !== null ||
                       document.body.classList.contains('pointer-events-none');
      setIsHidden(hasModal);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    return () => observer.disconnect();
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  return (
    <AnimatePresence>
      {!isHidden && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleClick}
          type="button"
          className="fixed bottom-20 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-lg cursor-pointer select-none active:shadow-xl"
          aria-label="إضافة عملية"
          style={{ touchAction: 'manipulation' }}
        >
          <Plus className="h-6 w-6" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

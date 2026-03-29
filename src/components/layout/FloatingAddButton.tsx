import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';

interface FloatingAddButtonProps {
  onClick: () => void;
}

export function FloatingAddButton({ onClick }: FloatingAddButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={handleClick}
      type="button"
      className="fixed bottom-20 left-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-lg cursor-pointer select-none active:shadow-xl"
      aria-label="إضافة عملية"
      style={{ touchAction: 'manipulation' }}
    >
      <Plus className="h-6 w-6" />
    </motion.button>
  );
}

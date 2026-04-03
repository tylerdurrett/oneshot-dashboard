import { useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Drawer — lightweight bottom sheet built with motion. No snap points or
// complex scroll locking; designed for simple pickers with a few items.
// ---------------------------------------------------------------------------

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Drawer({ open, onOpenChange, children }: DrawerProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Dismiss on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, close]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            className="fixed inset-0 z-50 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
          />
          {/* Sheet */}
          <motion.div
            key="drawer-sheet"
            className="fixed inset-x-0 bottom-0 z-50 safe-area-pb"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              // Dismiss if dragged down fast enough or far enough
              if (info.velocity.y > 300 || info.offset.y > 100) {
                close();
              }
            }}
          >
            <DrawerContent>{children}</DrawerContent>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function DrawerContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-t-2xl bg-sidebar border-t border-sidebar-border p-4',
        className,
      )}
    >
      {/* Drag handle */}
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-sidebar-foreground/30" />
      {children}
    </div>
  );
}

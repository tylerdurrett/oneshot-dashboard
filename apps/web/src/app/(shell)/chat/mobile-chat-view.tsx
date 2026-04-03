import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';

import ChatIndexPage from './page';
import ThreadPage from './[threadId]/page';

/** Pattern shared with MobileShellLayout to detect /chat/:threadId routes. */
const CHAT_THREAD_RE = /^\/chat\/([^/]+)$/;

/** Returns the threadId from a /chat/:threadId pathname, or null. */
export function extractThreadId(pathname: string): string | null {
  return CHAT_THREAD_RE.exec(pathname)?.[1] ?? null;
}

/**
 * Mobile chat wrapper — renders ChatIndexPage as the base layer and slides in
 * ThreadPage as an overlay when a threadId is present in the URL. This gives
 * iOS-style push navigation within the SwipeView chat slot.
 */
export function MobileChatView() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const threadId = useMemo(() => extractThreadId(pathname), [pathname]);

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = window.innerWidth * 0.3;
      if (info.offset.x > threshold || info.velocity.x > 300) {
        navigate('/chat', { replace: true });
      }
    },
    [navigate],
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Base layer — always mounted so it stays warm */}
      <ChatIndexPage />

      {/* Thread detail overlay — slides in from right */}
      <AnimatePresence>
        {threadId && (
          <motion.div
            key="thread-overlay"
            className="absolute inset-0 z-10 bg-background"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.5 }}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            style={{ touchAction: 'pan-y' }}
          >
            <ThreadPage threadId={threadId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

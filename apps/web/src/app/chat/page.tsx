'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@repo/ui';
import { createThread } from './api';

/**
 * Bare /chat route — creates a new thread and redirects to /chat/[threadId].
 * Uses the API function directly (not useMutation) so the redirect callback
 * isn't lost during React Strict Mode's double-mount cycle.
 */
export default function ChatIndexPage() {
  const router = useRouter();
  const creatingRef = useRef(false);
  // Delay showing the spinner so fast redirects (e.g. after thread deletion)
  // don't cause a jarring flash of loading UI.
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;

    createThread()
      .then((thread) => {
        router.replace(`/chat/${thread.id}`);
      })
      .catch(() => {
        creatingRef.current = false;
      });
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSpinner(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-dvh items-center justify-center">
      {showSpinner && <Spinner className="size-6" />}
    </div>
  );
}

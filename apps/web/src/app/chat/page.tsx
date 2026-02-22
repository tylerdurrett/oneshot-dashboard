'use client';

import { useEffect, useRef } from 'react';
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

  return (
    <div className="flex h-dvh items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@repo/ui';
import { useCreateThread } from './use-threads';

/**
 * Bare /chat route — creates a new thread and redirects to /chat/[threadId].
 * This ensures the URL always contains a thread ID once the user lands on chat.
 */
export default function ChatIndexPage() {
  const router = useRouter();
  const createThread = useCreateThread();
  const creatingRef = useRef(false);

  useEffect(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;

    createThread.mutate(undefined, {
      onSuccess: (thread) => {
        router.replace(`/chat/${thread.id}`);
      },
      onSettled: () => {
        creatingRef.current = false;
      },
    });
  }, []);

  return (
    <div className="flex h-dvh items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}

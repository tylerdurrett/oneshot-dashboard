'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchThreads,
  fetchThreadMessages,
  createThread,
} from './api';
import type { Thread, ThreadMessage } from './api';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const threadKeys = {
  all: ['threads'] as const,
  messages: (threadId: string) => ['threads', threadId, 'messages'] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useThreads() {
  return useQuery({
    queryKey: threadKeys.all,
    queryFn: fetchThreads,
  });
}

export function useThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: threadKeys.messages(threadId!),
    queryFn: () => fetchThreadMessages(threadId!),
    enabled: !!threadId,
  });
}

export function useCreateThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title?: string) => createThread(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadKeys.all });
    },
  });
}

// Re-export types for convenience
export type { Thread, ThreadMessage };

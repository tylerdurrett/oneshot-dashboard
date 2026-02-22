'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ChatSocketProvider } from './chat-socket-context';

export function ChatProviders({ children }: { children: React.ReactNode }) {
  // Create QueryClient inside state to avoid re-creation on re-renders
  // while ensuring each SSR request gets its own client
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ChatSocketProvider>{children}</ChatSocketProvider>
    </QueryClientProvider>
  );
}

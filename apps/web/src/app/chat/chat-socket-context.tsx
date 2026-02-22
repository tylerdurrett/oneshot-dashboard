'use client';

import { createContext, useContext } from 'react';
import { useChatSocket, type UseChatSocketReturn } from './use-chat-socket';

const ChatSocketContext = createContext<UseChatSocketReturn | null>(null);

export function ChatSocketProvider({ children }: { children: React.ReactNode }) {
  const chatSocket = useChatSocket();
  return (
    <ChatSocketContext.Provider value={chatSocket}>
      {children}
    </ChatSocketContext.Provider>
  );
}

export function useChatSocketContext(): UseChatSocketReturn {
  const ctx = useContext(ChatSocketContext);
  if (!ctx) {
    throw new Error('useChatSocketContext must be used within ChatSocketProvider');
  }
  return ctx;
}

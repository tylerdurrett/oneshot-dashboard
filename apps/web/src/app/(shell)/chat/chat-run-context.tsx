import { createContext, useContext } from 'react';
import { useChatRun, type UseChatRunReturn } from './use-chat-run';

const ChatRunContext = createContext<UseChatRunReturn | null>(null);

export function ChatRunProvider({ children }: { children: React.ReactNode }) {
  const chatRun = useChatRun();

  return (
    <ChatRunContext.Provider value={chatRun}>
      {children}
    </ChatRunContext.Provider>
  );
}

export function useChatRunContext(): UseChatRunReturn {
  const ctx = useContext(ChatRunContext);
  if (!ctx) {
    throw new Error('useChatRunContext must be used within ChatRunProvider');
  }
  return ctx;
}

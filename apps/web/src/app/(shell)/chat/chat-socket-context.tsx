import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useChatSocket, type UseChatSocketReturn } from './use-chat-socket';

const ChatSocketContext = createContext<UseChatSocketReturn | null>(null);
const ChatSocketActivationContext = createContext<(() => void) | null>(null);

export function ChatSocketProvider({ children }: { children: React.ReactNode }) {
  const [hasActivated, setHasActivated] = useState(false);
  const chatSocket = useChatSocket(hasActivated);
  const activate = useCallback(() => {
    setHasActivated((prev) => prev || true);
  }, []);
  const value = useMemo(() => chatSocket, [chatSocket]);

  return (
    <ChatSocketActivationContext.Provider value={activate}>
      <ChatSocketContext.Provider value={value}>
        {children}
      </ChatSocketContext.Provider>
    </ChatSocketActivationContext.Provider>
  );
}

export function useChatSocketContext(): UseChatSocketReturn {
  const ctx = useContext(ChatSocketContext);
  if (!ctx) {
    throw new Error('useChatSocketContext must be used within ChatSocketProvider');
  }
  return ctx;
}

export function useActivateChatSocket(): () => void {
  const activate = useContext(ChatSocketActivationContext);
  if (!activate) {
    throw new Error('useActivateChatSocket must be used within ChatSocketProvider');
  }
  return activate;
}

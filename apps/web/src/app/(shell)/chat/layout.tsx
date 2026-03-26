import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { useActivateChatSocket } from './chat-socket-context';

export default function ChatLayout() {
  const activateChatSocket = useActivateChatSocket();

  useEffect(() => {
    activateChatSocket();
  }, [activateChatSocket]);

  return <Outlet />;
}

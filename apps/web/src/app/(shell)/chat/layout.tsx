import { Outlet } from 'react-router';
import { ChatProviders } from './chat-providers';

export default function ChatLayout() {
  return (
    <ChatProviders>
      <Outlet />
    </ChatProviders>
  );
}

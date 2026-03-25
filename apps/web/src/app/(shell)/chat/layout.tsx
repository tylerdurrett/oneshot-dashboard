import { ChatProviders } from './chat-providers';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProviders>{children}</ChatProviders>
  );
}

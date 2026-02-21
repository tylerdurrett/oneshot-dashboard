import { ChatProviders } from './chat-providers';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <ChatProviders>{children}</ChatProviders>
    </div>
  );
}

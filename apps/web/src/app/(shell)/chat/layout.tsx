import type { Metadata } from 'next';
import { chatMetadata } from '@/app/route-metadata';
import { ChatProviders } from './chat-providers';

export const metadata: Metadata = chatMetadata;

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProviders>{children}</ChatProviders>
  );
}

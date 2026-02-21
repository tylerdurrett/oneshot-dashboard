'use client';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
} from '@repo/ui';
import { useChatSocket } from './use-chat-socket';

export default function ChatPage() {
  const { messages } = useChatSocket();

  return (
    <div className="flex h-dvh flex-col">
      {/* Container query context — scales content width with available space */}
      <div className="@container flex w-full flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full flex-1 flex-col overflow-hidden @3xl:max-w-2xl @5xl:max-w-3xl @7xl:max-w-4xl">
          <Conversation className="flex-1">
            <ConversationContent>
              {messages.length === 0 ? (
                <ConversationEmptyState
                  title="What can I help you with?"
                  description="Send a message to start a conversation"
                />
              ) : (
                messages.map((msg) => (
                  <Message key={msg.id} from={msg.role}>
                    <MessageContent>
                      <MessageResponse>{msg.content}</MessageResponse>
                    </MessageContent>
                  </Message>
                ))
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          {/* Input area — implemented in Phase 5.3 */}
        </div>
      </div>
    </div>
  );
}

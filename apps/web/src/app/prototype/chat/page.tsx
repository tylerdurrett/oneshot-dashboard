'use client';

import { useState, useCallback } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
  PromptInputProvider,
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from '@repo/ui';
import { mockMessages, type MockMessage } from './mock-data';

export default function ChatPrototype() {
  const [messages, setMessages] = useState<MockMessage[]>(mockMessages);
  const [nextId, setNextId] = useState(mockMessages.length + 1);

  const handleSubmit = useCallback(
    (message: { text: string }) => {
      const text = message.text.trim();
      if (!text) return;

      setMessages((prev) => [
        ...prev,
        { id: `msg-${nextId}`, role: 'user', content: text },
      ]);
      setNextId((n) => n + 1);
    },
    [nextId],
  );

  return (
    <div className="flex h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.map((msg) => (
              <Message key={msg.id} from={msg.role}>
                <MessageContent>
                  <MessageResponse>{msg.content}</MessageResponse>
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border p-4">
          <PromptInputProvider>
            <PromptInput onSubmit={handleSubmit}>
              <PromptInputBody>
                <PromptInputTextarea placeholder="Type a message..." />
              </PromptInputBody>
              <PromptInputFooter>
                <div />
                <PromptInputSubmit />
              </PromptInputFooter>
            </PromptInput>
          </PromptInputProvider>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  Button,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  useStickToBottomContext,
  Message,
  MessageContent,
  MessageResponse,
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  Spinner,
} from '@repo/ui';
import { useChatSocket } from './use-chat-socket';
import { useCreateThread, useThreadMessages, useThreads, threadKeys } from './use-threads';
import { ThreadSelector } from './thread-selector';
import type { ChatMessage } from './use-chat-socket';

function ScrollOnStream({ isStreaming }: { isStreaming: boolean }) {
  const { scrollToBottom } = useStickToBottomContext();
  const prevRef = useRef(false);

  useEffect(() => {
    if (isStreaming && !prevRef.current) {
      scrollToBottom();
    }
    prevRef.current = isStreaming;
  }, [isStreaming, scrollToBottom]);

  return null;
}

export default function ChatPage() {
  const { messages, sendMessage, setMessages, isStreaming, error, connectionStatus } =
    useChatSocket();
  const createThread = useCreateThread();
  const threadsQuery = useThreads();
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Active thread state
  // ---------------------------------------------------------------------------

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const creatingRef = useRef(false);

  // Auto-create a thread on mount
  useEffect(() => {
    if (activeThreadId) return;
    if (creatingRef.current) return;
    creatingRef.current = true;

    createThread.mutate(undefined, {
      onSuccess: (thread) => {
        setActiveThreadId(thread.id);
      },
      onSettled: () => {
        creatingRef.current = false;
      },
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Thread message loading
  // ---------------------------------------------------------------------------

  const threadMessagesQuery = useThreadMessages(activeThreadId);

  // When thread messages load (e.g. thread switching), update displayed messages
  useEffect(() => {
    if (!threadMessagesQuery.data) return;
    // Only set messages if we have actual history (skip empty arrays from new threads)
    if (threadMessagesQuery.data.length === 0) return;

    const converted: ChatMessage[] = threadMessagesQuery.data.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
    setMessages(converted);
  }, [threadMessagesQuery.data, setMessages]);

  // ---------------------------------------------------------------------------
  // Invalidate thread list when streaming ends
  // ---------------------------------------------------------------------------

  const wasStreamingRef = useRef(false);

  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      queryClient.invalidateQueries({ queryKey: threadKeys.all });
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, queryClient]);

  // ---------------------------------------------------------------------------
  // Thread switching and creation
  // ---------------------------------------------------------------------------

  const handleSelectThread = useCallback(
    (threadId: string) => {
      if (threadId === activeThreadId) return;
      setActiveThreadId(threadId);
      setMessages([]);
      // Messages will load via useThreadMessages query
    },
    [activeThreadId, setMessages],
  );

  const handleNewThread = useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;

    createThread.mutate(undefined, {
      onSuccess: (thread) => {
        setActiveThreadId(thread.id);
        setMessages([]);
      },
      onSettled: () => {
        creatingRef.current = false;
      },
    });
  }, [createThread, setMessages]);

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    (message: { text: string }) => {
      const text = message.text.trim();
      if (!text) return;
      if (!activeThreadId) return;
      sendMessage(activeThreadId, text);
    },
    [sendMessage, activeThreadId],
  );

  return (
    <div className="flex h-dvh flex-col">
      {/* Container query context — scales content width with available space */}
      <div className="@container flex w-full flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full flex-1 flex-col overflow-hidden @3xl:max-w-2xl @5xl:max-w-3xl @7xl:max-w-4xl">
          {/* Title bar */}
          <div className="flex items-center border-b border-border px-3 py-2" data-testid="title-bar">
            <ThreadSelector
              threads={threadsQuery.data ?? []}
              activeThreadId={activeThreadId}
              onSelectThread={handleSelectThread}
              onNewThread={handleNewThread}
            />
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-8 shrink-0"
              onClick={handleNewThread}
              aria-label="New thread"
              data-testid="new-thread-btn"
            >
              <Plus className="size-4" />
            </Button>
          </div>

          <Conversation className="flex-1">
            <ScrollOnStream isStreaming={isStreaming} />
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
                        {msg.role === 'assistant' && isStreaming && (
                          <div className={msg.content ? 'hidden' : ''}>
                            <Spinner className="size-4" />
                          </div>
                        )}
                      </MessageContent>
                    </Message>
                  ))
              )}
              {error && (
                <div
                  role="alert"
                  className="mx-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {/sandbox|offline/i.test(error)
                    ? 'Agent is offline. Check the Docker sandbox.'
                    : error}
                </div>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          {connectionStatus !== 'connected' && (
            <div
              role="status"
              className="border-t border-border bg-muted px-4 py-2 text-center text-xs text-muted-foreground"
            >
              {connectionStatus === 'connecting'
                ? 'Connecting...'
                : 'Disconnected. Reconnecting...'}
            </div>
          )}
          <div className="border-t border-border p-4">
            <PromptInput onSubmit={handleSubmit}>
              <PromptInputBody>
                <PromptInputTextarea placeholder="Type a message..." />
              </PromptInputBody>
              <PromptInputFooter>
                <div />
                <PromptInputSubmit status={isStreaming ? 'streaming' : undefined} />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}

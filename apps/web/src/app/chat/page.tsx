'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
import { useChatSocketContext } from './chat-socket-context';
import { useDeleteThread, useThreads, threadKeys } from './use-threads';
import { createThread } from './api';
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

/**
 * Bare /chat route — renders the chat UI in "draft" mode with no thread.
 * A thread is only created in the DB when the user sends their first message.
 * This prevents empty conversations from cluttering the thread list.
 */
export default function ChatIndexPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { messages, sendMessage, isStreaming, error, connectionStatus } =
    useChatSocketContext();
  const threadsQuery = useThreads();
  const deleteThreadMutation = useDeleteThread();

  const creatingRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Thread switching — navigate via URL
  // ---------------------------------------------------------------------------

  const handleSelectThread = useCallback(
    (threadId: string) => {
      router.push(`/chat/${threadId}`);
    },
    [router],
  );

  const handleDeleteThread = useCallback(
    (deletedThreadId: string) => {
      deleteThreadMutation.mutate(deletedThreadId);
    },
    [deleteThreadMutation],
  );

  // Already on the "new thread" page — no-op
  const handleNewThread = useCallback(() => {}, []);

  // ---------------------------------------------------------------------------
  // Submit handler — lazy thread creation on first message
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (message: { text: string }) => {
      const text = message.text.trim();
      if (!text || creatingRef.current) return;

      // Don't create a thread if the WebSocket isn't connected —
      // sendMessage would silently fail, leaving an empty thread.
      if (connectionStatus !== 'connected') return;

      creatingRef.current = true;

      try {
        const thread = await createThread();
        queryClient.invalidateQueries({ queryKey: threadKeys.all });
        sendMessage(thread.id, text);
        router.replace(`/chat/${thread.id}`);
      } catch {
        creatingRef.current = false;
      }
    },
    [sendMessage, router, queryClient, connectionStatus],
  );

  // ---------------------------------------------------------------------------
  // Main chat UI
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-dvh flex-col">
      <div className="@container flex w-full flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full flex-1 flex-col overflow-hidden @3xl:max-w-2xl @5xl:max-w-3xl @7xl:max-w-4xl">
          {/* Title bar */}
          <div className="flex items-center border-b border-border px-3 py-2" data-testid="title-bar">
            <ThreadSelector
              threads={threadsQuery.data ?? []}
              activeThreadId={null}
              onSelectThread={handleSelectThread}
              onNewThread={handleNewThread}
              onDeleteThread={handleDeleteThread}
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
                        <div className={`flex items-center gap-2 text-sm text-muted-foreground${msg.content ? ' hidden' : ''}`}>
                          <Spinner className="size-4" />
                          Thinking...
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

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { useChatSocketContext } from '../chat-socket-context';
import { useDeleteThread, useThreadMessages, useThreads, threadKeys } from '../use-threads';
import { ThreadSelector } from '../thread-selector';
import type { ChatMessage } from '../use-chat-socket';

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

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const router = useRouter();
  const threadId = params.threadId;

  const { messages, sendMessage, setMessages, isStreaming, error, connectionStatus } =
    useChatSocketContext();
  const deleteThreadMutation = useDeleteThread();
  const threadsQuery = useThreads();
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Thread message loading
  // ---------------------------------------------------------------------------

  const threadMessagesQuery = useThreadMessages(threadId);

  // Thread not found: the messages query failed with a 404
  const threadNotFound =
    threadMessagesQuery.isError &&
    /404/.test(threadMessagesQuery.error?.message ?? '');

  // Track isStreaming via ref so the load effect doesn't re-trigger on streaming changes
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  // When thread messages load, update displayed messages
  useEffect(() => {
    if (!threadMessagesQuery.data) return;
    if (threadMessagesQuery.data.length === 0) return;
    // Bug fix: Don't overwrite in-flight streaming messages with stale DB data.
    // When navigating from draft mode during active streaming, the DB may only
    // contain the user message, wiping out the assistant placeholder + spinner.
    if (isStreamingRef.current) return;

    const converted: ChatMessage[] = threadMessagesQuery.data.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
    setMessages(converted);
  }, [threadMessagesQuery.data, setMessages]);

  // Clear messages when threadId changes via URL navigation
  const prevThreadIdRef = useRef(threadId);
  useEffect(() => {
    if (prevThreadIdRef.current !== threadId) {
      setMessages([]);
      prevThreadIdRef.current = threadId;
    }
  }, [threadId, setMessages]);

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
  // Thread switching and creation — navigate via URL
  // ---------------------------------------------------------------------------

  const handleSelectThread = useCallback(
    (newThreadId: string) => {
      if (newThreadId === threadId) return;
      router.push(`/chat/${newThreadId}`);
    },
    [threadId, router],
  );

  const handleDeleteThread = useCallback(
    (deletedThreadId: string) => {
      deleteThreadMutation.mutate(deletedThreadId, {
        onSuccess: () => {
          // If we deleted the active thread, redirect to /chat (draft mode)
          if (deletedThreadId === threadId) {
            router.push('/chat');
          }
        },
      });
    },
    [deleteThreadMutation, threadId, router],
  );

  // Navigate to /chat for a new draft conversation — no thread is created
  // until the user sends their first message (lazy thread creation).
  const handleNewThread = useCallback(() => {
    setMessages([]);
    router.push('/chat');
  }, [router, setMessages]);

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    (message: { text: string }) => {
      const text = message.text.trim();
      if (!text) return;
      sendMessage(threadId, text);
    },
    [sendMessage, threadId],
  );

  // ---------------------------------------------------------------------------
  // Thread not found
  // ---------------------------------------------------------------------------

  if (threadNotFound) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4">
        <h2 className="text-lg font-semibold">Thread not found</h2>
        <p className="text-sm text-muted-foreground">
          This conversation doesn&apos;t exist or may have been deleted.
        </p>
        <Button onClick={() => router.push('/chat')}>
          Start a new conversation
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main chat UI
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-dvh flex-col">
      {/* Container query context — scales content width with available space */}
      <div className="@container flex w-full flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full flex-1 flex-col overflow-hidden @3xl:max-w-2xl @5xl:max-w-3xl @7xl:max-w-4xl">
          {/* Title bar */}
          <div className="flex items-center border-b border-border px-3 py-2" data-testid="title-bar">
            <ThreadSelector
              threads={threadsQuery.data ?? []}
              activeThreadId={threadId}
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

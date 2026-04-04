import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  Button,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
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
import { useChatRunContext } from '@/app/(shell)/chat/chat-run-context';
import { ChatErrorBanner } from '@/app/(shell)/chat/chat-error-banner';
import { ScrollOnStream } from '@/app/(shell)/chat/scroll-on-stream';
import { ThreadSelector } from '@/app/(shell)/chat/thread-selector';
import {
  useDeleteThread,
  useThreadMessages,
  useThreads,
  threadKeys,
} from '@/app/(shell)/chat/use-threads';
import type { ChatMessage } from '@/app/(shell)/chat/use-chat-run';

/**
 * Self-contained chat panel for the docs page. Uses the same thread system
 * as the standalone /chat route, but manages the active thread via React
 * state instead of URL routing so it can be embedded as a side panel.
 */
export function DocsChatPanel() {
  const {
    messages,
    sendMessage,
    setMessages,
    isStreaming,
    streamState,
    error,
    setError,
    clearError,
    setVisibleThreadId,
  } = useChatRunContext();

  const threadsQuery = useThreads();
  const deleteThreadMutation = useDeleteThread();
  const queryClient = useQueryClient();

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const creatingRef = useRef(false);

  const threadMessagesQuery = useThreadMessages(activeThreadId);

  useEffect(() => {
    setVisibleThreadId(activeThreadId);
    return () => setVisibleThreadId(null);
  }, [activeThreadId, setVisibleThreadId]);

  // Ref avoids re-triggering the load effect when streaming state changes
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  useEffect(() => {
    if (!threadMessagesQuery.data) return;
    if (threadMessagesQuery.data.length === 0) return;
    // Don't overwrite in-flight streaming messages with stale DB data.
    if (isStreamingRef.current) return;

    const converted: ChatMessage[] = threadMessagesQuery.data.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
    setMessages(converted);
  }, [threadMessagesQuery.data, setMessages]);

  const prevThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    if (prevThreadIdRef.current !== activeThreadId) {
      setMessages([]);
      clearError();
      prevThreadIdRef.current = activeThreadId;
    }
  }, [activeThreadId, setMessages, clearError]);

  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      queryClient.invalidateQueries({ queryKey: threadKeys.all });
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, queryClient]);

  // Thread 404 — selected thread was deleted externally
  const threadNotFound =
    activeThreadId !== null &&
    threadMessagesQuery.isError &&
    /404/.test(threadMessagesQuery.error?.message ?? '');

  const handleSelectThread = useCallback(
    (threadId: string) => {
      if (threadId === activeThreadId) return;
      setActiveThreadId(threadId);
    },
    [activeThreadId],
  );

  const handleDeleteThread = useCallback(
    (deletedThreadId: string) => {
      deleteThreadMutation.mutate(deletedThreadId, {
        onSuccess: () => {
          if (deletedThreadId === activeThreadId) {
            setMessages([]);
            setActiveThreadId(null);
          }
        },
      });
    },
    [deleteThreadMutation, activeThreadId, setMessages],
  );

  const handleNewThread = useCallback(() => {
    setMessages([]);
    clearError();
    setActiveThreadId(null);
  }, [setMessages, clearError]);

  const handleSubmit = useCallback(
    async (message: { text: string }) => {
      const text = message.text.trim();
      if (!text || creatingRef.current) return;

      if (activeThreadId) {
        await sendMessage(activeThreadId, text);
        return;
      }

      creatingRef.current = true;
      try {
        const run = await sendMessage(null, text);
        setActiveThreadId(run.threadId);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to send message';
        console.error('Failed to send message:', err);
        setError(msg);
        throw err;
      } finally {
        creatingRef.current = false;
      }
    },
    [sendMessage, setError, activeThreadId],
  );

  if (threadNotFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h2 className="text-lg font-semibold">Thread not found</h2>
        <p className="text-sm text-muted-foreground">
          This conversation doesn&apos;t exist or may have been deleted.
        </p>
        <Button onClick={handleNewThread}>Start a new conversation</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center border-b border-border px-3 py-2"
        data-testid="docs-chat-title-bar"
      >
        <ThreadSelector
          threads={threadsQuery.data ?? []}
          activeThreadId={activeThreadId}
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
          data-testid="docs-chat-new-thread-btn"
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
                    <div
                      className={`flex items-center gap-2 text-sm text-muted-foreground${msg.content ? ' hidden' : ''}`}
                    >
                      <Spinner className="size-4" />
                      {streamState === 'finishing'
                        ? 'Finishing response...'
                        : 'Thinking...'}
                    </div>
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {error && <ChatErrorBanner error={error} onDismiss={clearError} />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t border-border p-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Type a message..." />
          </PromptInputBody>
          <PromptInputFooter>
            <div />
            <PromptInputSubmit
              status={isStreaming ? 'streaming' : undefined}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

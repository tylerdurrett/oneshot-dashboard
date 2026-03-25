import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { CHAT_TITLE } from '@/app/route-metadata';
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
import { ChatErrorBanner } from './chat-error-banner';
import { useChatSocketContext } from './chat-socket-context';
import { ScrollOnStream } from './scroll-on-stream';
import { useDeleteThread, useThreads, threadKeys } from './use-threads';
import { createThread } from './api';
import { ThreadSelector } from './thread-selector';

/**
 * Bare /chat route — renders the chat UI in "draft" mode with no thread.
 * A thread is only created in the DB when the user sends their first message.
 * This prevents empty conversations from cluttering the thread list.
 */
export default function ChatIndexPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useDocumentTitle(CHAT_TITLE);

  const { messages, sendMessage, isStreaming, error, setError, clearError, connectionStatus } =
    useChatSocketContext();
  const threadsQuery = useThreads();
  const deleteThreadMutation = useDeleteThread();

  const creatingRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Thread switching — navigate via URL
  // ---------------------------------------------------------------------------

  const handleSelectThread = useCallback(
    (threadId: string) => {
      navigate(`/chat/${threadId}`);
    },
    [navigate],
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
        navigate(`/chat/${thread.id}`, { replace: true });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to send message';
        console.error('Failed to send message:', err);
        setError(msg);
        // Re-throw so PromptInput knows the submit failed and preserves
        // the user's input instead of clearing it.
        throw err;
      } finally {
        creatingRef.current = false;
      }
    },
    [sendMessage, setError, navigate, queryClient, connectionStatus],
  );

  // ---------------------------------------------------------------------------
  // Main chat UI
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
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
                <ChatErrorBanner error={error} onDismiss={clearError} />
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

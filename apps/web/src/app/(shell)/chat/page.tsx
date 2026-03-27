import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
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
import { useChatRunContext } from './chat-run-context';
import { ScrollOnStream } from './scroll-on-stream';
import { useDeleteThread, useThreads } from './use-threads';
import { ThreadSelector } from './thread-selector';

/**
 * Bare /chat route — renders the chat UI in "draft" mode with no thread.
 * A thread is only created in the DB when the user sends their first message.
 * This prevents empty conversations from cluttering the thread list.
 */
export default function ChatIndexPage() {
  const navigate = useNavigate();
  useDocumentTitle(CHAT_TITLE);

  const {
    messages,
    sendMessage,
    isStreaming,
    streamState,
    error,
    setError,
    clearError,
    setVisibleThreadId,
  } = useChatRunContext();
  const threadsQuery = useThreads();
  const deleteThreadMutation = useDeleteThread();

  const creatingRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Thread switching — navigate via URL
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setVisibleThreadId(null);
  }, [setVisibleThreadId]);

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

      creatingRef.current = true;

      try {
        const run = await sendMessage(null, text);
        navigate(`/chat/${run.threadId}`, { replace: true });
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
    [sendMessage, setError, navigate],
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
                          {streamState === 'finishing' ? 'Finishing response...' : 'Thinking...'}
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

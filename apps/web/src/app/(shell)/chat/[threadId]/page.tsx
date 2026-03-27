import { useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
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
import { ChatErrorBanner } from '../chat-error-banner';
import { useChatRunContext } from '../chat-run-context';
import { ScrollOnStream } from '../scroll-on-stream';
import { useDeleteThread, useThreadMessages, useThreads, threadKeys } from '../use-threads';
import { ThreadSelector } from '../thread-selector';
import type { ChatMessage } from '../use-chat-run';

export default function ThreadPage() {
  // React Router's useParams returns string | undefined; threadId is always
  // present because the route definition requires it (chat/:threadId).
  const { threadId } = useParams() as { threadId: string };
  const navigate = useNavigate();
  useDocumentTitle(CHAT_TITLE);

  const {
    messages,
    sendMessage,
    setMessages,
    isStreaming,
    streamState,
    error,
    clearError,
    setVisibleThreadId,
  } = useChatRunContext();
  const deleteThreadMutation = useDeleteThread();
  const threadsQuery = useThreads();
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Thread message loading
  // ---------------------------------------------------------------------------

  const threadMessagesQuery = useThreadMessages(threadId);

  useEffect(() => {
    setVisibleThreadId(threadId);
    return () => setVisibleThreadId(null);
  }, [threadId, setVisibleThreadId]);

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

  // Clear messages and stale errors when threadId changes via URL navigation
  const prevThreadIdRef = useRef(threadId);
  useEffect(() => {
    if (prevThreadIdRef.current !== threadId) {
      setMessages([]);
      clearError();
      prevThreadIdRef.current = threadId;
    }
  }, [threadId, setMessages, clearError]);

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
      navigate(`/chat/${newThreadId}`);
    },
    [threadId, navigate],
  );

  const handleDeleteThread = useCallback(
    (deletedThreadId: string) => {
      deleteThreadMutation.mutate(deletedThreadId, {
        onSuccess: () => {
          // If we deleted the active thread, clear messages and redirect to draft mode
          if (deletedThreadId === threadId) {
            setMessages([]);
            navigate('/chat');
          }
        },
      });
    },
    [deleteThreadMutation, threadId, navigate, setMessages],
  );

  // Navigate to /chat for a new draft conversation — no thread is created
  // until the user sends their first message (lazy thread creation).
  const handleNewThread = useCallback(() => {
    setMessages([]);
    navigate('/chat');
  }, [navigate, setMessages]);

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (message: { text: string }) => {
      const text = message.text.trim();
      if (!text) return;
      await sendMessage(threadId, text);
    },
    [sendMessage, threadId],
  );

  // ---------------------------------------------------------------------------
  // Thread not found
  // ---------------------------------------------------------------------------

  if (threadNotFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h2 className="text-lg font-semibold">Thread not found</h2>
        <p className="text-sm text-muted-foreground">
          This conversation doesn&apos;t exist or may have been deleted.
        </p>
        <Button onClick={() => navigate('/chat')}>
          Start a new conversation
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main chat UI
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
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

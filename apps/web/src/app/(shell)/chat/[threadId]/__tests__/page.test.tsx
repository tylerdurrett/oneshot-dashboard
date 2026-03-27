import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseChatRunReturn } from '../../use-chat-run';

const defaultReturn: UseChatRunReturn = {
  sendMessage: vi.fn(async () => ({ threadId: 'thread-1' })),
  messages: [],
  setMessages: vi.fn(),
  isStreaming: false,
  streamState: 'idle',
  error: null,
  setError: vi.fn(),
  clearError: vi.fn(),
  setVisibleThreadId: vi.fn(),
};

let hookReturn = { ...defaultReturn };
let mockThreadId = 'thread-1';
const mockNavigate = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('../../chat-run-context', () => ({
  useChatRunContext: () => hookReturn,
}));

vi.mock('react-router', () => ({
  useParams: () => ({ threadId: mockThreadId }),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/use-document-title', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

const threadMessagesMap: Record<string, Array<{ id: string; threadId: string; role: string; content: string; createdAt: number }>> = {
  'thread-1': [
    { id: 'msg-1', threadId: 'thread-1', role: 'user', content: 'Hello', createdAt: 1 },
  ],
};

vi.mock('../../use-threads', () => ({
  useDeleteThread: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useThreadMessages: (threadId: string | null) => ({
    data: threadId ? threadMessagesMap[threadId] ?? [] : undefined,
    isError: false,
    error: null,
  }),
  useThreads: () => ({
    data: [{ id: 'thread-1', title: 'Thread 1', claudeSessionId: null, createdAt: 1, updatedAt: 2 }],
  }),
  threadKeys: {
    all: ['threads'] as const,
    messages: (id: string) => ['threads', id, 'messages'] as const,
  },
}));

vi.mock('../../thread-selector', () => ({
  ThreadSelector: ({ activeThreadId }: { activeThreadId: string | null }) => (
    <div data-testid="thread-selector" data-active-thread={activeThreadId ?? ''} />
  ),
}));

vi.mock('@repo/ui', () => ({
  useStickToBottomContext: () => ({ scrollToBottom: vi.fn() }),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Conversation: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ConversationContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ConversationEmptyState: ({ title, description }: { title?: string; description?: string }) => (
    <div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
  ConversationScrollButton: () => <button data-testid="scroll-button" />,
  Message: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MessageContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MessageResponse: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PromptInput: ({
    children,
    onSubmit,
  }: {
    children: React.ReactNode;
    onSubmit: (message: { text: string }) => Promise<void> | void;
  }) => (
    <form
      data-testid="prompt-input"
      onSubmit={(event) => {
        event.preventDefault();
        const textarea = event.currentTarget.querySelector('textarea');
        void onSubmit({ text: textarea?.value ?? '' });
      }}
    >
      {children}
    </form>
  ),
  PromptInputBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PromptInputTextarea: ({ placeholder }: { placeholder?: string }) => (
    <textarea data-testid="prompt-textarea" placeholder={placeholder} />
  ),
  PromptInputFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PromptInputSubmit: ({ status }: { status?: string }) => (
    <button data-testid="prompt-submit" data-status={status ?? 'idle'} type="submit">
      submit
    </button>
  ),
  Spinner: () => <div data-testid="spinner" />,
}));

import ThreadPage from '../page';

describe('ThreadPage', () => {
  beforeEach(() => {
    hookReturn = { ...defaultReturn, sendMessage: vi.fn(async () => ({ threadId: 'thread-1' })) };
    mockNavigate.mockReset();
    mockInvalidateQueries.mockReset();
    mockThreadId = 'thread-1';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('tracks the visible thread id in the shared run context', () => {
    render(<ThreadPage />);
    expect(hookReturn.setVisibleThreadId).toHaveBeenCalledWith('thread-1');
  });

  it('submits through the run hook for the active thread', async () => {
    render(<ThreadPage />);
    fireEvent.change(screen.getByTestId('prompt-textarea'), {
      target: { value: 'Continue this' },
    });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('prompt-input'));
    });

    expect(hookReturn.sendMessage).toHaveBeenCalledWith('thread-1', 'Continue this');
  });

  it('shows finishing copy instead of socket connection labels', () => {
    hookReturn = {
      ...defaultReturn,
      isStreaming: true,
      streamState: 'finishing',
      messages: [{ id: 'assistant-1', role: 'assistant', content: '' }],
    };

    render(<ThreadPage />);
    expect(screen.getByText('Finishing response...')).toBeDefined();
    expect(screen.queryByText('Disconnected. Reconnecting...')).toBeNull();
    expect(screen.queryByText('Connecting...')).toBeNull();
  });
});

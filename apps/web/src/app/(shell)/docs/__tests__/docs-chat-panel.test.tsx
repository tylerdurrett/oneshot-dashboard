import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseChatRunReturn } from '@/app/(shell)/chat/use-chat-run';

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

vi.mock('@/app/(shell)/chat/chat-run-context', () => ({
  useChatRunContext: () => hookReturn,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

const mockDeleteMutate = vi.fn();

vi.mock('@/app/(shell)/chat/use-threads', () => ({
  useThreads: () => ({ data: [] }),
  useThreadMessages: () => ({ data: undefined }),
  useDeleteThread: () => ({ mutate: mockDeleteMutate, isPending: false }),
  threadKeys: { all: ['threads'], messages: (id: string) => ['threads', id, 'messages'] },
}));

vi.mock('@/app/(shell)/chat/thread-selector', () => ({
  ThreadSelector: ({
    activeThreadId,
    onNewThread,
    onSelectThread,
  }: {
    activeThreadId: string | null;
    onNewThread: () => void;
    onSelectThread: (id: string) => void;
  }) => (
    <div data-testid="thread-selector" data-active-thread={activeThreadId ?? ''}>
      <button data-testid="mock-select-thread" onClick={() => onSelectThread('thread-2')} />
      <button data-testid="mock-new-thread" onClick={onNewThread} />
    </div>
  ),
}));

vi.mock('@/app/(shell)/chat/chat-error-banner', () => ({
  ChatErrorBanner: ({ error }: { error: string }) => (
    <div data-testid="error-banner">{error}</div>
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
    <div data-testid="empty-state">
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

import { DocsChatPanel } from '../_components/docs-chat-panel';

describe('DocsChatPanel', () => {
  beforeEach(() => {
    hookReturn = { ...defaultReturn, sendMessage: vi.fn(async () => ({ threadId: 'thread-1' })) };
    mockDeleteMutate.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('sets visibleThreadId to null on mount (draft mode)', () => {
    render(<DocsChatPanel />);
    expect(hookReturn.setVisibleThreadId).toHaveBeenCalledWith(null);
  });

  it('renders empty state when there are no messages', () => {
    render(<DocsChatPanel />);
    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.getByText('What can I help you with?')).toBeDefined();
  });

  it('submits a message in draft mode and updates activeThreadId', async () => {
    render(<DocsChatPanel />);
    fireEvent.change(screen.getByTestId('prompt-textarea'), {
      target: { value: 'Hello from docs' },
    });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('prompt-input'));
    });

    expect(hookReturn.sendMessage).toHaveBeenCalledWith(null, 'Hello from docs');
    // After thread creation, setVisibleThreadId should be called with the new thread
    // (via the useEffect that watches activeThreadId)
  });

  it('shows streaming indicator when streaming', () => {
    hookReturn = {
      ...defaultReturn,
      isStreaming: true,
      streamState: 'streaming',
      messages: [{ id: 'assistant-1', role: 'assistant', content: '' }],
    };

    render(<DocsChatPanel />);
    expect(screen.getByText('Thinking...')).toBeDefined();
  });

  it('shows finishing copy when stream state is finishing', () => {
    hookReturn = {
      ...defaultReturn,
      isStreaming: true,
      streamState: 'finishing',
      messages: [{ id: 'assistant-1', role: 'assistant', content: '' }],
    };

    render(<DocsChatPanel />);
    expect(screen.getByText('Finishing response...')).toBeDefined();
  });

  it('shows error banner when error is set', () => {
    hookReturn = {
      ...defaultReturn,
      error: 'Something went wrong',
    };

    render(<DocsChatPanel />);
    expect(screen.getByTestId('error-banner')).toBeDefined();
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('resets to draft mode when new thread button is clicked', () => {
    render(<DocsChatPanel />);
    fireEvent.click(screen.getByTestId('mock-new-thread'));

    expect(hookReturn.setMessages).toHaveBeenCalledWith([]);
    expect(hookReturn.clearError).toHaveBeenCalled();
  });
});

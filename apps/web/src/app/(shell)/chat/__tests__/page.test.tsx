import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseChatRunReturn } from '../use-chat-run';

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

vi.mock('../chat-run-context', () => ({
  useChatRunContext: () => hookReturn,
}));

const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/use-document-title', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../use-threads', () => ({
  useThreads: () => ({
    data: [],
  }),
  useDeleteThread: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('../thread-selector', () => ({
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

import ChatIndexPage from '../page';

describe('ChatIndexPage', () => {
  beforeEach(() => {
    hookReturn = { ...defaultReturn, sendMessage: vi.fn(async () => ({ threadId: 'thread-1' })) };
    mockNavigate.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('marks the draft page as the visible chat target', () => {
    render(<ChatIndexPage />);
    expect(hookReturn.setVisibleThreadId).toHaveBeenCalledWith(null);
  });

  it('submits through the run hook and navigates when the server returns a thread id', async () => {
    render(<ChatIndexPage />);
    fireEvent.change(screen.getByTestId('prompt-textarea'), {
      target: { value: 'Hello agent' },
    });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('prompt-input'));
    });

    expect(hookReturn.sendMessage).toHaveBeenCalledWith(null, 'Hello agent');
    expect(mockNavigate).toHaveBeenCalledWith('/chat/thread-1', { replace: true });
  });

  it('shows finishing copy instead of connection banners while a run is reconnecting', () => {
    hookReturn = {
      ...defaultReturn,
      isStreaming: true,
      streamState: 'finishing',
      messages: [{ id: 'assistant-1', role: 'assistant', content: '' }],
    };

    render(<ChatIndexPage />);
    expect(screen.getByText('Finishing response...')).toBeDefined();
    expect(screen.queryByText('Disconnected. Reconnecting...')).toBeNull();
    expect(screen.queryByText('Connecting...')).toBeNull();
  });
});

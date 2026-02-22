import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseChatSocketReturn } from '../use-chat-socket';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const defaultReturn: UseChatSocketReturn = {
  sendMessage: vi.fn(),
  messages: [],
  setMessages: vi.fn(),
  isStreaming: false,
  error: null,
  connectionStatus: 'connected',
};

let hookReturn = { ...defaultReturn };

vi.mock('../chat-socket-context', () => ({
  useChatSocketContext: () => hookReturn,
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockCreateThread = vi.fn();

vi.mock('../api', () => ({
  createThread: (...args: unknown[]) => mockCreateThread(...args),
}));

const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

const mockDeleteMutate = vi.fn();

const mockThreadsList = [
  { id: 'thread-1', title: 'Existing thread', claudeSessionId: null, createdAt: 1000, updatedAt: 2000 },
];

vi.mock('../use-threads', () => ({
  useThreads: () => ({
    data: mockThreadsList,
  }),
  useDeleteThread: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
  threadKeys: {
    all: ['threads'] as const,
    messages: (id: string) => ['threads', id, 'messages'] as const,
  },
}));

// Mock ThreadSelector
const mockOnSelectThread = vi.fn();
const mockOnNewThread = vi.fn();
const mockOnDeleteThread = vi.fn();

vi.mock('../thread-selector', () => ({
  ThreadSelector: ({
    activeThreadId,
    onSelectThread,
    onNewThread,
    onDeleteThread,
  }: {
    threads: Array<{ id: string; title: string }>;
    activeThreadId: string | null;
    onSelectThread: (id: string) => void;
    onNewThread: () => void;
    onDeleteThread: (id: string) => void;
  }) => {
    mockOnSelectThread.mockImplementation(onSelectThread);
    mockOnNewThread.mockImplementation(onNewThread);
    mockOnDeleteThread.mockImplementation(onDeleteThread);
    return (
      <div data-testid="thread-selector" data-active-thread={activeThreadId ?? ''}>
        Thread Selector
      </div>
    );
  },
}));

vi.mock('@repo/ui', () => ({
  useStickToBottomContext: () => ({ scrollToBottom: vi.fn() }),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button {...props}>{children}</button>
  ),
  Conversation: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="conversation" className={className}>{children}</div>
  ),
  ConversationContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="conversation-content">{children}</div>
  ),
  ConversationEmptyState: ({ title, description }: { title?: string; description?: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
  ConversationScrollButton: () => <button data-testid="scroll-button" />,
  Message: ({ children, from }: { children: React.ReactNode; from: string }) => (
    <div data-testid={`message-${from}`}>{children}</div>
  ),
  MessageContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MessageResponse: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="message-response">{children}</div>
  ),
  PromptInput: ({ children, onSubmit }: { children: React.ReactNode; onSubmit: (msg: { text: string }) => void }) => (
    <form data-testid="prompt-input" onSubmit={(e) => { e.preventDefault(); const textarea = e.currentTarget.querySelector('textarea'); onSubmit({ text: textarea?.value ?? '' }); }}>
      {children}
    </form>
  ),
  PromptInputBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PromptInputTextarea: ({ placeholder }: { placeholder?: string }) => (
    <textarea data-testid="prompt-textarea" placeholder={placeholder} />
  ),
  PromptInputFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="prompt-footer">{children}</div>
  ),
  PromptInputSubmit: ({ status }: { status?: string }) => (
    <button data-testid="prompt-submit" data-status={status ?? 'idle'} type="submit">
      {status === 'streaming' ? 'Stop' : 'Submit'}
    </button>
  ),
  Spinner: ({ className }: { className?: string }) => (
    <div data-testid="spinner" className={className} />
  ),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import ChatIndexPage from '../page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatIndexPage (draft mode — lazy thread creation)', () => {
  beforeEach(() => {
    hookReturn = { ...defaultReturn, sendMessage: vi.fn() };
    mockCreateThread.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockInvalidateQueries.mockReset();
    mockDeleteMutate.mockReset();
    mockOnSelectThread.mockReset();
    mockOnNewThread.mockReset();
    mockOnDeleteThread.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  it('renders fullscreen layout with h-dvh', () => {
    const { container } = render(<ChatIndexPage />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-dvh');
  });

  it('renders the chat UI (not a redirect/spinner)', () => {
    render(<ChatIndexPage />);
    expect(screen.getByTestId('conversation')).toBeDefined();
    expect(screen.getByTestId('prompt-input')).toBeDefined();
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Thread selector
  // -------------------------------------------------------------------------

  it('renders ThreadSelector with activeThreadId null', () => {
    render(<ChatIndexPage />);
    const selector = screen.getByTestId('thread-selector');
    expect(selector.getAttribute('data-active-thread')).toBe('');
  });

  it('does not create a thread on mount', () => {
    render(<ChatIndexPage />);
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('navigates to thread URL when selecting a thread from selector', () => {
    render(<ChatIndexPage />);
    mockOnSelectThread('thread-1');
    expect(mockPush).toHaveBeenCalledWith('/chat/thread-1');
  });

  // -------------------------------------------------------------------------
  // Submit — lazy thread creation
  // -------------------------------------------------------------------------

  it('creates a thread and sends message on first submit', async () => {
    const sendMessage = vi.fn();
    hookReturn = { ...defaultReturn, sendMessage };
    mockCreateThread.mockResolvedValue({ id: 'new-thread-123' });

    render(<ChatIndexPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello agent' } });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('prompt-input'));
    });

    expect(mockCreateThread).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['threads'] });
    expect(sendMessage).toHaveBeenCalledWith('new-thread-123', 'Hello agent');
    expect(mockReplace).toHaveBeenCalledWith('/chat/new-thread-123');
  });

  it('does not create thread for whitespace-only input', async () => {
    render(<ChatIndexPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '   ' } });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('prompt-input'));
    });

    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('does not create thread when WebSocket is disconnected', async () => {
    hookReturn = { ...defaultReturn, connectionStatus: 'disconnected' };

    render(<ChatIndexPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('prompt-input'));
    });

    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('prevents double submission while thread is being created', async () => {
    let resolveCreate: (value: { id: string }) => void;
    mockCreateThread.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    render(<ChatIndexPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    // First submit — starts creating
    await act(async () => {
      fireEvent.submit(screen.getByTestId('prompt-input'));
    });

    // Second submit while first is in-flight — should be ignored
    await act(async () => {
      fireEvent.submit(screen.getByTestId('prompt-input'));
    });

    expect(mockCreateThread).toHaveBeenCalledTimes(1);

    // Resolve the pending creation
    await act(async () => {
      resolveCreate!({ id: 'thread-abc' });
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('shows empty state when no messages', () => {
    render(<ChatIndexPage />);
    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.getByText('What can I help you with?')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Connection status
  // -------------------------------------------------------------------------

  it('shows disconnected status when WebSocket is disconnected', () => {
    hookReturn = { ...defaultReturn, connectionStatus: 'disconnected' };
    render(<ChatIndexPage />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Disconnected. Reconnecting...');
  });

  it('does not show connection status when connected', () => {
    hookReturn = { ...defaultReturn, connectionStatus: 'connected' };
    render(<ChatIndexPage />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseChatSocketReturn } from '../../use-chat-socket';

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

vi.mock('../../chat-socket-context', () => ({
  useChatSocketContext: () => hookReturn,
}));

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockThreadId = 'thread-1';

vi.mock('next/navigation', () => ({
  useParams: () => ({ threadId: mockThreadId }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

// Mock TanStack Query hooks
const mockInvalidateQueries = vi.fn();

// Dynamic mock data for thread switching tests
const defaultThreadsList = [
  { id: 'thread-1', title: 'Test thread', claudeSessionId: null, createdAt: 1000, updatedAt: 2000 },
];
let mockThreadsList = [...defaultThreadsList];
let threadMessagesMap: Record<string, Array<{ id: string; threadId: string; role: string; content: string; createdAt: number }>> = {};
let threadMessagesError: Record<string, Error> = {};

const mockDeleteMutate = vi.fn();

vi.mock('../../use-threads', () => ({
  useDeleteThread: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
  useThreadMessages: (threadId: string | null) => {
    if (threadId && threadMessagesError[threadId]) {
      return {
        data: undefined,
        isError: true,
        error: threadMessagesError[threadId],
      };
    }
    return {
      data: threadId ? threadMessagesMap[threadId] : undefined,
      isError: false,
      error: null,
    };
  },
  useThreads: () => ({
    data: mockThreadsList,
  }),
  threadKeys: {
    all: ['threads'] as const,
    messages: (id: string) => ['threads', id, 'messages'] as const,
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// Mock ThreadSelector to avoid DropdownMenu complexity in page tests
const mockOnSelectThread = vi.fn();
const mockOnNewThread = vi.fn();
const mockOnDeleteThread = vi.fn();

vi.mock('../../thread-selector', () => ({
  ThreadSelector: ({
    threads,
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
    // Capture handlers for testing
    mockOnSelectThread.mockImplementation(onSelectThread);
    mockOnNewThread.mockImplementation(onNewThread);
    mockOnDeleteThread.mockImplementation(onDeleteThread);
    return (
      <div data-testid="thread-selector" data-active-thread={activeThreadId}>
        <span data-testid="thread-count">{threads.length}</span>
      </div>
    );
  },
}));

// Mock @repo/ui to avoid Streamdown/StickToBottom complexity in unit tests
vi.mock('@repo/ui', () => ({
  useStickToBottomContext: () => ({ scrollToBottom: vi.fn() }),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button {...props}>{children}</button>
  ),
  Conversation: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="conversation" className={className}>
      {children}
    </div>
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

import ThreadPage from '../page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThreadPage', () => {
  beforeEach(() => {
    hookReturn = { ...defaultReturn, messages: [] };
    mockDeleteMutate.mockReset();
    mockInvalidateQueries.mockReset();
    mockOnSelectThread.mockReset();
    mockOnNewThread.mockReset();
    mockOnDeleteThread.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockThreadsList = [...defaultThreadsList];
    threadMessagesMap = {};
    threadMessagesError = {};
    mockThreadId = 'thread-1';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Layout structure
  // -------------------------------------------------------------------------

  it('renders fullscreen layout with h-dvh', () => {
    const { container } = render(<ThreadPage />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-dvh');
  });

  it('has container query wrapper', () => {
    const { container } = render(<ThreadPage />);
    const wrapper = container.querySelector('.\\@container');
    expect(wrapper).not.toBeNull();
  });

  it('has container-query-based max-width classes', () => {
    const { container } = render(<ThreadPage />);
    const inner = container.querySelector(
      '.\\@3xl\\:max-w-2xl.\\@5xl\\:max-w-3xl.\\@7xl\\:max-w-4xl',
    );
    expect(inner).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Title bar and thread selector
  // -------------------------------------------------------------------------

  it('renders the title bar', () => {
    render(<ThreadPage />);
    expect(screen.getByTestId('title-bar')).toBeDefined();
  });

  it('renders ThreadSelector in the title bar', () => {
    render(<ThreadPage />);
    expect(screen.getByTestId('thread-selector')).toBeDefined();
  });

  it('passes thread list to ThreadSelector', () => {
    render(<ThreadPage />);
    expect(screen.getByTestId('thread-count').textContent).toBe('1');
  });

  it('passes threadId from URL as activeThreadId to ThreadSelector', () => {
    render(<ThreadPage />);
    expect(screen.getByTestId('thread-selector').getAttribute('data-active-thread')).toBe('thread-1');
  });

  // -------------------------------------------------------------------------
  // URL-based thread switching
  // -------------------------------------------------------------------------

  it('navigates to new URL when switching threads via ThreadSelector', () => {
    render(<ThreadPage />);
    mockOnSelectThread('thread-2');
    expect(mockPush).toHaveBeenCalledWith('/chat/thread-2');
  });

  it('does not navigate when selecting the already-active thread', () => {
    render(<ThreadPage />);
    mockOnSelectThread('thread-1');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates to /chat (draft mode) when onNewThread is called', () => {
    render(<ThreadPage />);
    mockOnNewThread();

    // Lazy thread creation: navigates to /chat without creating a DB record.
    // The thread is only created when the user sends their first message.
    expect(mockPush).toHaveBeenCalledWith('/chat');
  });

  it('navigates to /chat (draft mode) when clicking the standalone "+" button', () => {
    render(<ThreadPage />);
    fireEvent.click(screen.getByTestId('new-thread-btn'));

    expect(mockPush).toHaveBeenCalledWith('/chat');
  });

  it('renders the standalone new thread button in the title bar', () => {
    render(<ThreadPage />);
    const btn = screen.getByTestId('new-thread-btn');
    expect(btn).toBeDefined();
    expect(btn.getAttribute('aria-label')).toBe('New thread');
    const titleBar = screen.getByTestId('title-bar');
    expect(titleBar.contains(btn)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('shows empty state when no messages', () => {
    render(<ThreadPage />);
    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.getByText('What can I help you with?')).toBeDefined();
    expect(screen.getByText('Send a message to start a conversation')).toBeDefined();
  });

  it('does not show empty state when messages exist', () => {
    hookReturn.messages = [
      { id: '1', role: 'user', content: 'Hello' },
    ];
    render(<ThreadPage />);
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Message rendering
  // -------------------------------------------------------------------------

  it('renders user messages', () => {
    hookReturn.messages = [
      { id: '1', role: 'user', content: 'Hello world' },
    ];
    render(<ThreadPage />);
    expect(screen.getByTestId('message-user')).toBeDefined();
    expect(screen.getByText('Hello world')).toBeDefined();
  });

  it('renders assistant messages', () => {
    hookReturn.messages = [
      { id: '1', role: 'assistant', content: 'Hi there!' },
    ];
    render(<ThreadPage />);
    expect(screen.getByTestId('message-assistant')).toBeDefined();
    expect(screen.getByText('Hi there!')).toBeDefined();
  });

  it('renders a multi-message conversation in order', () => {
    hookReturn.messages = [
      { id: '1', role: 'user', content: 'First' },
      { id: '2', role: 'assistant', content: 'Second' },
      { id: '3', role: 'user', content: 'Third' },
    ];
    render(<ThreadPage />);
    const responses = screen.getAllByTestId('message-response');
    expect(responses).toHaveLength(3);
    expect(responses[0]!.textContent).toBe('First');
    expect(responses[1]!.textContent).toBe('Second');
    expect(responses[2]!.textContent).toBe('Third');
  });

  it('displays partial streaming content', () => {
    hookReturn.isStreaming = true;
    hookReturn.messages = [
      { id: '1', role: 'user', content: 'Tell me a story' },
      { id: 'streaming-abc', role: 'assistant', content: 'Once upon a' },
    ];
    render(<ThreadPage />);
    expect(screen.getByText('Once upon a')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Components
  // -------------------------------------------------------------------------

  it('renders Conversation and ConversationScrollButton', () => {
    render(<ThreadPage />);
    expect(screen.getByTestId('conversation')).toBeDefined();
    expect(screen.getByTestId('scroll-button')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Input area
  // -------------------------------------------------------------------------

  it('renders the prompt input area', () => {
    render(<ThreadPage />);
    expect(screen.getByTestId('prompt-input')).toBeDefined();
    expect(screen.getByTestId('prompt-textarea')).toBeDefined();
    expect(screen.getByTestId('prompt-submit')).toBeDefined();
  });

  it('renders textarea with correct placeholder', () => {
    render(<ThreadPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('Type a message...');
  });

  it('calls sendMessage with thread ID from URL on submit', () => {
    const sendMessage = vi.fn();
    hookReturn = { ...defaultReturn, sendMessage };

    render(<ThreadPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello agent' } });
    fireEvent.submit(screen.getByTestId('prompt-input'));
    expect(sendMessage).toHaveBeenCalledWith('thread-1', 'Hello agent');
  });

  it('does not call sendMessage for whitespace-only input', () => {
    const sendMessage = vi.fn();
    hookReturn = { ...defaultReturn, sendMessage };
    render(<ThreadPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.submit(screen.getByTestId('prompt-input'));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('shows idle status on submit button when not streaming', () => {
    hookReturn = { ...defaultReturn, isStreaming: false };
    render(<ThreadPage />);
    const btn = screen.getByTestId('prompt-submit');
    expect(btn.getAttribute('data-status')).toBe('idle');
    expect(btn.textContent).toBe('Submit');
  });

  it('shows streaming status on submit button when streaming', () => {
    hookReturn = { ...defaultReturn, isStreaming: true };
    render(<ThreadPage />);
    const btn = screen.getByTestId('prompt-submit');
    expect(btn.getAttribute('data-status')).toBe('streaming');
    expect(btn.textContent).toBe('Stop');
  });

  it('has border-t wrapper for the input area', () => {
    const { container } = render(<ThreadPage />);
    const inputWrapper = container.querySelector('.border-t.p-4');
    expect(inputWrapper).not.toBeNull();
    expect(inputWrapper!.className).toContain('border-border');
  });

  // -------------------------------------------------------------------------
  // Error display
  // -------------------------------------------------------------------------

  it('shows inline error message when error is set', () => {
    hookReturn = { ...defaultReturn, error: 'Something broke' };
    render(<ThreadPage />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toBe('Something broke');
  });

  it('does not show error when error is null', () => {
    hookReturn = { ...defaultReturn, error: null };
    render(<ThreadPage />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows sandbox-specific error message for sandbox errors', () => {
    hookReturn = { ...defaultReturn, error: 'sandbox unavailable' };
    render(<ThreadPage />);
    expect(screen.getByRole('alert').textContent).toBe(
      'Agent is offline. Check the Docker sandbox.',
    );
  });

  it('shows sandbox-specific error message for offline errors', () => {
    hookReturn = { ...defaultReturn, error: 'Agent is offline' };
    render(<ThreadPage />);
    expect(screen.getByRole('alert').textContent).toBe(
      'Agent is offline. Check the Docker sandbox.',
    );
  });

  it('preserves partial response alongside error', () => {
    hookReturn = {
      ...defaultReturn,
      error: 'Stream interrupted',
      messages: [
        { id: '1', role: 'user', content: 'Tell me a story' },
        { id: '2', role: 'assistant', content: 'Once upon a time...' },
      ],
    };
    render(<ThreadPage />);
    expect(screen.getByText('Once upon a time...')).toBeDefined();
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe('Stream interrupted');
  });

  // -------------------------------------------------------------------------
  // Connection status indicator
  // -------------------------------------------------------------------------

  it('shows connection status when disconnected', () => {
    hookReturn = { ...defaultReturn, connectionStatus: 'disconnected' };
    render(<ThreadPage />);
    const status = screen.getByRole('status');
    expect(status).toBeDefined();
    expect(status.textContent).toBe('Disconnected. Reconnecting...');
  });

  it('shows connecting status when connecting', () => {
    hookReturn = { ...defaultReturn, connectionStatus: 'connecting' };
    render(<ThreadPage />);
    const status = screen.getByRole('status');
    expect(status).toBeDefined();
    expect(status.textContent).toBe('Connecting...');
  });

  it('does not show connection status when connected', () => {
    hookReturn = { ...defaultReturn, connectionStatus: 'connected' };
    render(<ThreadPage />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Thread not found
  // -------------------------------------------------------------------------

  describe('thread not found', () => {
    it('renders thread-not-found UI when messages query returns 404', () => {
      threadMessagesError['thread-1'] = new Error('Failed to fetch messages: 404');
      render(<ThreadPage />);
      expect(screen.getByText('Thread not found')).toBeDefined();
      expect(screen.getByText("This conversation doesn't exist or may have been deleted.")).toBeDefined();
    });

    it('navigates to /chat when "Start a new conversation" is clicked', () => {
      threadMessagesError['thread-1'] = new Error('Failed to fetch messages: 404');
      render(<ThreadPage />);
      fireEvent.click(screen.getByText('Start a new conversation'));
      expect(mockPush).toHaveBeenCalledWith('/chat');
    });

    it('does not render chat UI when thread not found', () => {
      threadMessagesError['thread-1'] = new Error('Failed to fetch messages: 404');
      render(<ThreadPage />);
      expect(screen.queryByTestId('conversation')).toBeNull();
      expect(screen.queryByTestId('prompt-input')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Thread message loading
  // -------------------------------------------------------------------------

  describe('thread message loading', () => {
    it('loads message history when thread has messages', () => {
      const setMessages = vi.fn();
      hookReturn = { ...defaultReturn, setMessages };

      threadMessagesMap['thread-1'] = [
        { id: 'm1', threadId: 'thread-1', role: 'user', content: 'Old question', createdAt: 100 },
        { id: 'm2', threadId: 'thread-1', role: 'assistant', content: 'Old answer', createdAt: 101 },
      ];

      render(<ThreadPage />);

      expect(setMessages).toHaveBeenCalledWith([
        { id: 'm1', role: 'user', content: 'Old question' },
        { id: 'm2', role: 'assistant', content: 'Old answer' },
      ]);
    });

    it('does not overwrite messages during active streaming (draft-to-thread navigation)', () => {
      const setMessages = vi.fn();
      hookReturn = { ...defaultReturn, setMessages, isStreaming: true };

      // Simulate the DB returning only the user message while streaming is active
      threadMessagesMap['thread-1'] = [
        { id: 'm1', threadId: 'thread-1', role: 'user', content: 'Hello', createdAt: 100 },
      ];

      render(<ThreadPage />);

      // setMessages should NOT be called with DB data — the streaming assistant
      // placeholder would be wiped out, causing the spinner to disappear.
      expect(setMessages).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'm1' })]),
      );
    });

    it('does not call setMessages for thread with empty history', () => {
      const setMessages = vi.fn();
      hookReturn = { ...defaultReturn, setMessages };

      threadMessagesMap['thread-1'] = [];

      render(<ThreadPage />);

      // Should not be called with message data (the guard skips empty arrays)
      expect(setMessages).not.toHaveBeenCalledWith(expect.arrayContaining([expect.any(Object)]));
    });
  });
});

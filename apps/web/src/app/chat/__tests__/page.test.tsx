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

vi.mock('../use-chat-socket', () => ({
  useChatSocket: () => hookReturn,
}));

// Mock TanStack Query hooks
const mockMutate = vi.fn();
const mockInvalidateQueries = vi.fn();

// Dynamic mock data for thread switching tests
const defaultThreadsList = [
  { id: 'thread-1', title: 'Test thread', claudeSessionId: null, createdAt: 1000, updatedAt: 2000 },
];
let mockThreadsList = [...defaultThreadsList];
let threadMessagesMap: Record<string, Array<{ id: string; threadId: string; role: string; content: string; createdAt: number }>> = {};

vi.mock('../use-threads', () => ({
  useCreateThread: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useThreadMessages: (threadId: string | null) => ({
    data: threadId ? threadMessagesMap[threadId] : undefined,
  }),
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

vi.mock('../thread-selector', () => ({
  ThreadSelector: ({
    threads,
    activeThreadId,
    onSelectThread,
    onNewThread,
  }: {
    threads: Array<{ id: string; title: string }>;
    activeThreadId: string | null;
    onSelectThread: (id: string) => void;
    onNewThread: () => void;
  }) => {
    // Capture handlers for testing
    mockOnSelectThread.mockImplementation(onSelectThread);
    mockOnNewThread.mockImplementation(onNewThread);
    return (
      <div data-testid="thread-selector" data-active-thread={activeThreadId}>
        <span data-testid="thread-count">{threads.length}</span>
      </div>
    );
  },
}));

// Mock @repo/ui to avoid Streamdown/StickToBottom complexity in unit tests
vi.mock('@repo/ui', () => ({
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
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import ChatPage from '../page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatPage', () => {
  beforeEach(() => {
    hookReturn = { ...defaultReturn, messages: [] };
    mockMutate.mockReset();
    mockInvalidateQueries.mockReset();
    mockOnSelectThread.mockReset();
    mockOnNewThread.mockReset();
    mockThreadsList = [...defaultThreadsList];
    threadMessagesMap = {};
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Layout structure
  // -------------------------------------------------------------------------

  it('renders fullscreen layout with h-dvh', () => {
    const { container } = render(<ChatPage />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-dvh');
  });

  it('has container query wrapper', () => {
    const { container } = render(<ChatPage />);
    const wrapper = container.querySelector('.\\@container');
    expect(wrapper).not.toBeNull();
  });

  it('has container-query-based max-width classes', () => {
    const { container } = render(<ChatPage />);
    const inner = container.querySelector(
      '.\\@3xl\\:max-w-2xl.\\@5xl\\:max-w-3xl.\\@7xl\\:max-w-4xl',
    );
    expect(inner).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Title bar and thread selector
  // -------------------------------------------------------------------------

  it('renders the title bar', () => {
    render(<ChatPage />);
    expect(screen.getByTestId('title-bar')).toBeDefined();
  });

  it('renders ThreadSelector in the title bar', () => {
    render(<ChatPage />);
    expect(screen.getByTestId('thread-selector')).toBeDefined();
  });

  it('passes thread list to ThreadSelector', () => {
    render(<ChatPage />);
    expect(screen.getByTestId('thread-count').textContent).toBe('1');
  });

  it('clears messages when switching threads via ThreadSelector', () => {
    const setMessages = vi.fn();
    hookReturn = { ...defaultReturn, setMessages };

    mockMutate.mockImplementation((_title: unknown, opts: { onSuccess: (t: { id: string }) => void }) => {
      opts.onSuccess({ id: 'thread-1' });
    });

    render(<ChatPage />);

    // Simulate thread switch via the captured handler
    mockOnSelectThread('thread-2');
    expect(setMessages).toHaveBeenCalledWith([]);
  });

  it('creates new thread and clears messages when onNewThread is called', () => {
    const setMessages = vi.fn();
    hookReturn = { ...defaultReturn, setMessages };

    // First call: auto-create on mount. Second call: from onNewThread
    let callCount = 0;
    mockMutate.mockImplementation((_title: unknown, opts: { onSuccess: (t: { id: string }) => void; onSettled: () => void }) => {
      callCount++;
      opts.onSuccess({ id: `thread-${callCount}` });
      opts.onSettled();
    });

    render(<ChatPage />);
    expect(callCount).toBe(1); // auto-create

    mockOnNewThread();
    expect(callCount).toBe(2); // new thread
    expect(setMessages).toHaveBeenCalledWith([]);
  });

  it('renders the standalone new thread button in the title bar', () => {
    render(<ChatPage />);
    const btn = screen.getByTestId('new-thread-btn');
    expect(btn).toBeDefined();
    expect(btn.getAttribute('aria-label')).toBe('New thread');
    // Verify it's inside the title bar
    const titleBar = screen.getByTestId('title-bar');
    expect(titleBar.contains(btn)).toBe(true);
  });

  it('creates a new thread when clicking the standalone "+" button', () => {
    const setMessages = vi.fn();
    hookReturn = { ...defaultReturn, setMessages };

    let callCount = 0;
    mockMutate.mockImplementation((_title: unknown, opts: { onSuccess: (t: { id: string }) => void; onSettled: () => void }) => {
      callCount++;
      opts.onSuccess({ id: `thread-${callCount}` });
      opts.onSettled();
    });

    render(<ChatPage />);
    expect(callCount).toBe(1); // auto-create on mount

    fireEvent.click(screen.getByTestId('new-thread-btn'));
    expect(callCount).toBe(2); // new thread from "+" button
    expect(setMessages).toHaveBeenCalledWith([]);
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('shows empty state when no messages', () => {
    render(<ChatPage />);
    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.getByText('What can I help you with?')).toBeDefined();
    expect(screen.getByText('Send a message to start a conversation')).toBeDefined();
  });

  it('does not show empty state when messages exist', () => {
    hookReturn.messages = [
      { id: '1', role: 'user', content: 'Hello' },
    ];
    render(<ChatPage />);
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Message rendering
  // -------------------------------------------------------------------------

  it('renders user messages', () => {
    hookReturn.messages = [
      { id: '1', role: 'user', content: 'Hello world' },
    ];
    render(<ChatPage />);
    expect(screen.getByTestId('message-user')).toBeDefined();
    expect(screen.getByText('Hello world')).toBeDefined();
  });

  it('renders assistant messages', () => {
    hookReturn.messages = [
      { id: '1', role: 'assistant', content: 'Hi there!' },
    ];
    render(<ChatPage />);
    expect(screen.getByTestId('message-assistant')).toBeDefined();
    expect(screen.getByText('Hi there!')).toBeDefined();
  });

  it('renders a multi-message conversation in order', () => {
    hookReturn.messages = [
      { id: '1', role: 'user', content: 'First' },
      { id: '2', role: 'assistant', content: 'Second' },
      { id: '3', role: 'user', content: 'Third' },
    ];
    render(<ChatPage />);
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
    render(<ChatPage />);
    expect(screen.getByText('Once upon a')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Components
  // -------------------------------------------------------------------------

  it('renders Conversation and ConversationScrollButton', () => {
    render(<ChatPage />);
    expect(screen.getByTestId('conversation')).toBeDefined();
    expect(screen.getByTestId('scroll-button')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Thread auto-creation
  // -------------------------------------------------------------------------

  it('calls createThread.mutate on mount', () => {
    render(<ChatPage />);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(undefined, expect.objectContaining({
      onSuccess: expect.any(Function),
      onSettled: expect.any(Function),
    }));
  });

  // -------------------------------------------------------------------------
  // Input area
  // -------------------------------------------------------------------------

  it('renders the prompt input area', () => {
    render(<ChatPage />);
    expect(screen.getByTestId('prompt-input')).toBeDefined();
    expect(screen.getByTestId('prompt-textarea')).toBeDefined();
    expect(screen.getByTestId('prompt-submit')).toBeDefined();
  });

  it('renders textarea with correct placeholder', () => {
    render(<ChatPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('Type a message...');
  });

  it('calls sendMessage with active thread ID on submit', () => {
    const sendMessage = vi.fn();
    hookReturn = { ...defaultReturn, sendMessage };

    // Simulate the thread being created by triggering the onSuccess callback
    mockMutate.mockImplementation((_title: unknown, opts: { onSuccess: (t: { id: string }) => void }) => {
      opts.onSuccess({ id: 'real-thread-id' });
    });

    render(<ChatPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello agent' } });
    fireEvent.submit(screen.getByTestId('prompt-input'));
    expect(sendMessage).toHaveBeenCalledWith('real-thread-id', 'Hello agent');
  });

  it('does not send message when no active thread', () => {
    const sendMessage = vi.fn();
    hookReturn = { ...defaultReturn, sendMessage };
    // Don't trigger onSuccess — activeThreadId stays null

    render(<ChatPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello agent' } });
    fireEvent.submit(screen.getByTestId('prompt-input'));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not call sendMessage for whitespace-only input', () => {
    const sendMessage = vi.fn();
    hookReturn = { ...defaultReturn, sendMessage };
    render(<ChatPage />);
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.submit(screen.getByTestId('prompt-input'));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('shows idle status on submit button when not streaming', () => {
    hookReturn = { ...defaultReturn, isStreaming: false };
    render(<ChatPage />);
    const btn = screen.getByTestId('prompt-submit');
    expect(btn.getAttribute('data-status')).toBe('idle');
    expect(btn.textContent).toBe('Submit');
  });

  it('shows streaming status on submit button when streaming', () => {
    hookReturn = { ...defaultReturn, isStreaming: true };
    render(<ChatPage />);
    const btn = screen.getByTestId('prompt-submit');
    expect(btn.getAttribute('data-status')).toBe('streaming');
    expect(btn.textContent).toBe('Stop');
  });

  it('has border-t wrapper for the input area', () => {
    const { container } = render(<ChatPage />);
    const inputWrapper = container.querySelector('.border-t.p-4');
    expect(inputWrapper).not.toBeNull();
    expect(inputWrapper!.className).toContain('border-border');
  });

  // -------------------------------------------------------------------------
  // Error display
  // -------------------------------------------------------------------------

  it('shows inline error message when error is set', () => {
    hookReturn = { ...defaultReturn, error: 'Something broke' };
    render(<ChatPage />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toBe('Something broke');
  });

  it('does not show error when error is null', () => {
    hookReturn = { ...defaultReturn, error: null };
    render(<ChatPage />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows sandbox-specific error message for sandbox errors', () => {
    hookReturn = { ...defaultReturn, error: 'sandbox unavailable' };
    render(<ChatPage />);
    expect(screen.getByRole('alert').textContent).toBe(
      'Agent is offline. Check the Docker sandbox.',
    );
  });

  it('shows sandbox-specific error message for offline errors', () => {
    hookReturn = { ...defaultReturn, error: 'Agent is offline' };
    render(<ChatPage />);
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
    render(<ChatPage />);
    // Both the partial message and the error should be visible
    expect(screen.getByText('Once upon a time...')).toBeDefined();
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe('Stream interrupted');
  });

  // -------------------------------------------------------------------------
  // Connection status indicator
  // -------------------------------------------------------------------------

  it('shows connection status when disconnected', () => {
    hookReturn = { ...defaultReturn, connectionStatus: 'disconnected' };
    render(<ChatPage />);
    const status = screen.getByRole('status');
    expect(status).toBeDefined();
    expect(status.textContent).toBe('Disconnected. Reconnecting...');
  });

  it('shows connecting status when connecting', () => {
    hookReturn = { ...defaultReturn, connectionStatus: 'connecting' };
    render(<ChatPage />);
    const status = screen.getByRole('status');
    expect(status).toBeDefined();
    expect(status.textContent).toBe('Connecting...');
  });

  it('does not show connection status when connected', () => {
    hookReturn = { ...defaultReturn, connectionStatus: 'connected' };
    render(<ChatPage />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Thread resumption flow (6.3)
  // -------------------------------------------------------------------------

  describe('thread resumption flow', () => {
    it('loads message history when switching to a thread with messages', () => {
      const setMessages = vi.fn();
      hookReturn = { ...defaultReturn, setMessages };

      // Add a second thread to the list
      mockThreadsList = [
        ...defaultThreadsList,
        { id: 'thread-2', title: 'Previous chat', claudeSessionId: 'sess-old', createdAt: 900, updatedAt: 1500 },
      ];

      // Set up stored messages for thread-2
      threadMessagesMap['thread-2'] = [
        { id: 'm1', threadId: 'thread-2', role: 'user', content: 'Old question', createdAt: 100 },
        { id: 'm2', threadId: 'thread-2', role: 'assistant', content: 'Old answer', createdAt: 101 },
      ];

      // Auto-create sets activeThreadId to 'thread-1'
      mockMutate.mockImplementation((_title: unknown, opts: { onSuccess: (t: { id: string }) => void }) => {
        opts.onSuccess({ id: 'thread-1' });
      });

      render(<ChatPage />);

      // Switch to thread-2 via the captured handler (wrap in act to flush state)
      act(() => { mockOnSelectThread('thread-2'); });

      // Should have cleared messages first, then loaded history
      expect(setMessages).toHaveBeenCalledWith([]);
      expect(setMessages).toHaveBeenCalledWith([
        { id: 'm1', role: 'user', content: 'Old question' },
        { id: 'm2', role: 'assistant', content: 'Old answer' },
      ]);
    });

    it('does not call setMessages for thread with empty history', () => {
      const setMessages = vi.fn();
      hookReturn = { ...defaultReturn, setMessages };

      // Thread-2 has no messages (empty array)
      threadMessagesMap['thread-2'] = [];

      mockMutate.mockImplementation((_title: unknown, opts: { onSuccess: (t: { id: string }) => void }) => {
        opts.onSuccess({ id: 'thread-1' });
      });

      render(<ChatPage />);
      setMessages.mockClear(); // Clear calls from mount

      // Switch to empty thread (wrap in act to flush state)
      act(() => { mockOnSelectThread('thread-2'); });

      // Should only have the clear call, not a second setMessages with empty array
      // (the useEffect guard skips empty arrays to preserve the new thread empty state)
      expect(setMessages).toHaveBeenCalledTimes(1);
      expect(setMessages).toHaveBeenCalledWith([]);
    });

    it('sends message with switched thread ID after thread switch', () => {
      const sendMessage = vi.fn();
      hookReturn = { ...defaultReturn, sendMessage };

      // Auto-create sets activeThreadId to 'thread-1'
      mockMutate.mockImplementation((_title: unknown, opts: { onSuccess: (t: { id: string }) => void }) => {
        opts.onSuccess({ id: 'thread-1' });
      });

      render(<ChatPage />);

      // Switch to thread-2 (wrap in act to flush state update)
      act(() => { mockOnSelectThread('thread-2'); });

      // Now submit a message — should use thread-2
      const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'Hello in thread 2' } });
      fireEvent.submit(screen.getByTestId('prompt-input'));
      expect(sendMessage).toHaveBeenCalledWith('thread-2', 'Hello in thread 2');
    });

    it('does not clear messages when selecting the already-active thread', () => {
      const setMessages = vi.fn();
      hookReturn = { ...defaultReturn, setMessages };

      // Auto-create sets activeThreadId to 'thread-1'
      mockMutate.mockImplementation((_title: unknown, opts: { onSuccess: (t: { id: string }) => void }) => {
        opts.onSuccess({ id: 'thread-1' });
      });

      render(<ChatPage />);
      setMessages.mockClear(); // Clear mount-related calls

      // Select the same thread that's already active (wrap in act for consistency)
      act(() => { mockOnSelectThread('thread-1'); });

      // handleSelectThread has an early return for same thread
      expect(setMessages).not.toHaveBeenCalled();
    });

    it('updates ThreadSelector active thread after switching', () => {
      mockMutate.mockImplementation((_title: unknown, opts: { onSuccess: (t: { id: string }) => void }) => {
        opts.onSuccess({ id: 'thread-1' });
      });

      render(<ChatPage />);

      // Verify initial active thread
      expect(screen.getByTestId('thread-selector').getAttribute('data-active-thread')).toBe('thread-1');

      // Switch to thread-2 (wrap in act to flush state update)
      act(() => { mockOnSelectThread('thread-2'); });

      // ThreadSelector should show thread-2 as active
      expect(screen.getByTestId('thread-selector').getAttribute('data-active-thread')).toBe('thread-2');
    });
  });
});

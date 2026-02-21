import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

vi.mock('../use-threads', () => ({
  useCreateThread: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useThreadMessages: () => ({
    data: undefined,
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

// Mock @repo/ui to avoid Streamdown/StickToBottom complexity in unit tests
vi.mock('@repo/ui', () => ({
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
    const inputWrapper = container.querySelector('.border-t');
    expect(inputWrapper).not.toBeNull();
    expect(inputWrapper!.className).toContain('border-border');
    expect(inputWrapper!.className).toContain('p-4');
  });
});

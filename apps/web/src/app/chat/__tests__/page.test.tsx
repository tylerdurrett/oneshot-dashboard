import { render, screen, cleanup } from '@testing-library/react';
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
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import ChatPage from '../page';
import { PLACEHOLDER_THREAD_ID } from '../constants';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatPage', () => {
  beforeEach(() => {
    hookReturn = { ...defaultReturn, messages: [] };
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
    // The inner content div should have responsive container query classes
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
  // Placeholder thread ID
  // -------------------------------------------------------------------------

  it('exports PLACEHOLDER_THREAD_ID', () => {
    expect(PLACEHOLDER_THREAD_ID).toBe('placeholder-thread');
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseChatRunReturn } from '../use-chat-run';

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

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
let mockPathname = '/chat';
const mockNavigate = vi.fn();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../chat-run-context', () => ({
  useChatRunContext: () => hookReturn,
}));

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: mockPathname }),
  useNavigate: () => mockNavigate,
  useParams: () => {
    const match = /^\/chat\/([^/]+)$/.exec(mockPathname);
    return match ? { threadId: match[1] } : {};
  },
}));

vi.mock('@/hooks/use-document-title', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('../use-threads', () => ({
  useThreads: () => ({
    data: [{ id: 'thread-1', title: 'Thread 1', claudeSessionId: null, createdAt: 1, updatedAt: 2 }],
  }),
  useDeleteThread: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useThreadMessages: (threadId: string | null) => ({
    data: threadId
      ? [{ id: 'msg-1', threadId, role: 'user', content: 'Hello', createdAt: 1 }]
      : undefined,
    isError: false,
    error: null,
  }),
  threadKeys: {
    all: ['threads'] as const,
    messages: (id: string) => ['threads', id, 'messages'] as const,
  },
}));

vi.mock('../thread-selector', () => ({
  ThreadSelector: ({ activeThreadId }: { activeThreadId: string | null }) => (
    <div data-testid="thread-selector" data-active-thread={activeThreadId ?? ''} />
  ),
}));

// Stub motion components to simple divs so AnimatePresence works in tests
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => {
      // Filter out motion-specific props before passing to DOM
      const {
        initial, animate, exit, transition, drag, dragConstraints,
        dragElastic, dragMomentum, onDragEnd, ...domProps
      } = props as Record<string, unknown>;
      return <div {...(domProps as React.HTMLAttributes<HTMLDivElement>)} data-testid="thread-overlay" data-initial={String(initial)}>{children}</div>;
    },
  },
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
  PromptInput: ({ children }: { children: React.ReactNode }) => <div data-testid="prompt-input">{children}</div>,
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

import { MobileChatView } from '../mobile-chat-view';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MobileChatView', () => {
  beforeEach(() => {
    hookReturn = { ...defaultReturn, sendMessage: vi.fn(async () => ({ threadId: 'thread-1' })) };
    mockPathname = '/chat';
    mockNavigate.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders ChatIndexPage when pathname is /chat', () => {
    mockPathname = '/chat';
    render(<MobileChatView />);
    // ChatIndexPage sets visibleThreadId to null
    expect(hookReturn.setVisibleThreadId).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId('thread-overlay')).toBeNull();
  });

  it('renders thread overlay when pathname includes a threadId', () => {
    mockPathname = '/chat/thread-1';
    render(<MobileChatView />);
    expect(screen.getByTestId('thread-overlay')).toBeDefined();
    // ThreadPage sets visibleThreadId to the thread id
    expect(hookReturn.setVisibleThreadId).toHaveBeenCalledWith('thread-1');
  });

  it('skips entrance animation on thread overlay (initial={false})', () => {
    mockPathname = '/chat/thread-1';
    render(<MobileChatView />);
    // initial={false} means no slide-in animation — SwipeView handles page transitions,
    // and in-tab thread selection should appear instantly.
    expect(screen.getByTestId('thread-overlay').getAttribute('data-initial')).toBe('false');
  });

  it('passes threadId prop to ThreadPage inside overlay', () => {
    mockPathname = '/chat/thread-1';
    render(<MobileChatView />);
    // The thread selector inside ThreadPage should show the active thread
    const selectors = screen.getAllByTestId('thread-selector');
    const threadPageSelector = selectors.find(
      (el) => el.getAttribute('data-active-thread') === 'thread-1',
    );
    expect(threadPageSelector).toBeDefined();
  });
});

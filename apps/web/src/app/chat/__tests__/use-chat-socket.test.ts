import { renderHook, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatSocket } from '../use-chat-socket';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type WSListener = (event: { data: string }) => void;

/** Whether new MockWebSocket instances should auto-fire onopen. */
let autoOpen = true;

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: WSListener | null = null;
  sent: string[] = [];
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    if (autoOpen) {
      queueMicrotask(() => this.onopen?.());
    }
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateOpen() {
    this.onopen?.();
  }

  simulateMessage(data: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateError() {
    this.onerror?.();
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockWebSocket.instances = [];
  autoOpen = true;
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

function getLastWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useChatSocket', () => {
  it('connects to the WebSocket server on mount', async () => {
    renderHook(() => useChatSocket());

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(getLastWs().url).toBe('ws://localhost:3002/chat');
  });

  it('sets connectionStatus to connected on open', async () => {
    const { result } = renderHook(() => useChatSocket());

    // Initially connecting (before onopen fires)
    // After microtask, onopen fires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.connectionStatus).toBe('connected');
  });

  it('sets connectionStatus to disconnected on close', async () => {
    const { result } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.connectionStatus).toBe('connected');

    act(() => {
      getLastWs().simulateClose();
    });

    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('sends correctly formatted message via sendMessage', async () => {
    const { result } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.sendMessage('thread-1', 'Hello Claude');
    });

    const ws = getLastWs();
    expect(ws.sent).toHaveLength(1);
    const parsed = JSON.parse(ws.sent[0]!);
    expect(parsed).toEqual({
      type: 'message',
      threadId: 'thread-1',
      content: 'Hello Claude',
    });
  });

  it('optimistically adds user message and streaming placeholder', async () => {
    const { result } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.sendMessage('thread-1', 'Hello');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]!.role).toBe('user');
    expect(result.current.messages[0]!.content).toBe('Hello');
    expect(result.current.messages[1]!.role).toBe('assistant');
    expect(result.current.messages[1]!.content).toBe('');
    expect(result.current.isStreaming).toBe(true);
  });

  it('accumulates token events into the streaming message', async () => {
    const { result } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.sendMessage('thread-1', 'Hi');
    });

    act(() => {
      getLastWs().simulateMessage({ type: 'token', text: 'Hello' });
    });

    act(() => {
      getLastWs().simulateMessage({ type: 'token', text: ' world' });
    });

    const assistant = result.current.messages.find(
      (m) => m.role === 'assistant',
    );
    expect(assistant?.content).toBe('Hello world');
    expect(result.current.isStreaming).toBe(true);
  });

  it('finalizes streaming message on done event', async () => {
    const { result } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.sendMessage('thread-1', 'Hi');
    });

    act(() => {
      getLastWs().simulateMessage({ type: 'token', text: 'Reply' });
    });

    act(() => {
      getLastWs().simulateMessage({
        type: 'done',
        messageId: 'server-msg-123',
      });
    });

    const assistant = result.current.messages.find(
      (m) => m.role === 'assistant',
    );
    expect(assistant?.id).toBe('server-msg-123');
    expect(assistant?.content).toBe('Reply');
    expect(result.current.isStreaming).toBe(false);
  });

  it('sets error state on error event', async () => {
    const { result } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.sendMessage('thread-1', 'Hi');
    });

    act(() => {
      getLastWs().simulateMessage({
        type: 'error',
        message: 'Thread not found',
      });
    });

    expect(result.current.error).toBe('Thread not found');
    expect(result.current.isStreaming).toBe(false);
  });

  it('clears error on next sendMessage', async () => {
    const { result } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Trigger an error
    act(() => {
      result.current.sendMessage('thread-1', 'Hi');
    });
    act(() => {
      getLastWs().simulateMessage({ type: 'error', message: 'Oops' });
    });
    expect(result.current.error).toBe('Oops');

    // Send again — error should clear
    act(() => {
      result.current.sendMessage('thread-1', 'Try again');
    });
    expect(result.current.error).toBeNull();
  });

  it('does not send while streaming', async () => {
    const { result } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.sendMessage('thread-1', 'First');
    });
    expect(result.current.isStreaming).toBe(true);

    // Try to send a second message while still streaming
    act(() => {
      result.current.sendMessage('thread-1', 'Second');
    });

    // Only one send should have occurred
    expect(getLastWs().sent).toHaveLength(1);
    // Only 2 messages (user + assistant placeholder from first send)
    expect(result.current.messages).toHaveLength(2);
  });

  it('cleans up WebSocket on unmount', async () => {
    const { unmount } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const ws = getLastWs();
    unmount();

    expect(ws.closed).toBe(true);
  });

  it('reconnects with exponential backoff on close', async () => {
    // Initial connection opens normally
    renderHook(() => useChatSocket());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(MockWebSocket.instances).toHaveLength(1);

    // Disable auto-open so reconnected sockets don't reset backoff
    autoOpen = false;

    // First disconnect — should reconnect after 1s
    act(() => {
      getLastWs().simulateClose();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(MockWebSocket.instances).toHaveLength(1); // Not yet

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second disconnect (without onopen resetting backoff) — should wait 2s
    act(() => {
      getLastWs().simulateClose();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(MockWebSocket.instances).toHaveLength(2); // Not yet

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(MockWebSocket.instances).toHaveLength(3);

    // Third disconnect — should wait 4s
    act(() => {
      getLastWs().simulateClose();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3999);
    });
    expect(MockWebSocket.instances).toHaveLength(3); // Not yet

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it('resets backoff delay after successful connection', async () => {
    renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Close → reconnect after 1s
    act(() => {
      getLastWs().simulateClose();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    // Successfully connected → backoff resets
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Close again — should reconnect after 1s (reset), not 2s
    act(() => {
      getLastWs().simulateClose();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('handles ws.send() failure gracefully', async () => {
    const { result } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Make send throw
    getLastWs().send = () => {
      throw new Error('InvalidStateError');
    };

    act(() => {
      result.current.sendMessage('thread-1', 'Hi');
    });

    expect(result.current.error).toBe('Failed to send message');
    expect(result.current.isStreaming).toBe(false);
  });

  it('allows setting messages externally for thread switching', async () => {
    const { result } = renderHook(() => useChatSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.setMessages([
        { id: 'msg-1', role: 'user', content: 'Old message' },
        { id: 'msg-2', role: 'assistant', content: 'Old reply' },
      ]);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]!.content).toBe('Old message');
  });
});

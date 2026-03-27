import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatRun } from '../use-chat-run';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function createStreamResponse(events: Array<Record<string, unknown>>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

function createPartialStreamResponse(events: Array<Record<string, unknown>>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

describe('useChatRun', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
  });

  it('streams a chat run and resolves with the accepted thread id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      createStreamResponse([
        { type: 'ready', runId: 'run-1', threadId: 'thread-1', createdThread: true, userMessageId: 'user-1' },
        { type: 'token', text: 'Hello' },
        { type: 'done', assistantMessageId: 'assistant-1', sessionId: 'sess-1' },
      ]),
    );

    const { result } = renderHook(() => useChatRun(), {
      wrapper: createWrapper(),
    });

    let acceptedThreadId = '';
    await act(async () => {
      const accepted = await result.current.sendMessage(null, 'Hello');
      acceptedThreadId = accepted.threadId;
    });

    expect(acceptedThreadId).toBe('thread-1');
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]?.content).toBe('Hello');
    expect(result.current.messages[1]?.id).toBe('assistant-1');
    expect(result.current.messages[1]?.content).toBe('Hello');
    expect(result.current.streamState).toBe('idle');
  });

  it('rolls back optimistic messages when the run fails before acceptance', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      createStreamResponse([
        { type: 'error', code: 'sandbox_unavailable', message: 'Sandbox offline' },
      ]),
    );

    const { result } = renderHook(() => useChatRun(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.sendMessage(null, 'Hello')).rejects.toThrow('Sandbox offline');
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBe('Sandbox offline');
    expect(result.current.streamState).toBe('idle');
  });

  it('attaches to an existing run on 409 without keeping duplicate optimistic messages', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'thread_busy',
            runId: 'run-busy',
            threadId: 'thread-1',
            status: 'running',
            accepted: true,
            completed: false,
            createdThread: false,
            userMessageId: 'user-1',
            assistantPreview: 'Working...',
            assistantMessageId: null,
            error: null,
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: 'run-busy',
            threadId: 'thread-1',
            status: 'completed',
            accepted: true,
            completed: true,
            createdThread: false,
            userMessageId: 'user-1',
            assistantPreview: 'Working...',
            assistantMessageId: 'assistant-1',
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const { result } = renderHook(() => useChatRun(), {
      wrapper: createWrapper(),
    });

    let acceptedThreadId = '';
    await act(async () => {
      const accepted = await result.current.sendMessage('thread-1', 'Hello');
      acceptedThreadId = accepted.threadId;
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(acceptedThreadId).toBe('thread-1');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.content).toBe('Working...');
    expect(result.current.streamState).toBe('idle');
  });

  it('switches to finishing state and reconciles from run polling after the stream drops', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        createPartialStreamResponse([
          { type: 'ready', runId: 'run-2', threadId: 'thread-1', createdThread: false, userMessageId: 'user-1' },
          { type: 'token', text: 'Partial' },
        ]),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: 'run-2',
            threadId: 'thread-1',
            status: 'completed',
            accepted: true,
            completed: true,
            createdThread: false,
            userMessageId: 'user-1',
            assistantPreview: 'Partial and done',
            assistantMessageId: 'assistant-final',
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const { result } = renderHook(() => useChatRun(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.sendMessage('thread-1', 'Hello');
    });

    expect(result.current.streamState).toBe('finishing');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.messages[1]?.content).toBe('Partial and done');
    expect(result.current.messages[1]?.id).toBe('assistant-final');
    expect(result.current.streamState).toBe('idle');
  });
});

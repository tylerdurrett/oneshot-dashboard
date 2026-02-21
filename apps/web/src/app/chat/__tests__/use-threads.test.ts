import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { useThreads, useThreadMessages, useCreateThread, threadKeys } from '../use-threads';

// ---------------------------------------------------------------------------
// Mock api module
// ---------------------------------------------------------------------------

vi.mock('../api', () => ({
  fetchThreads: vi.fn(),
  fetchThreadMessages: vi.fn(),
  createThread: vi.fn(),
}));

import { fetchThreads, fetchThreadMessages, createThread } from '../api';

const mockFetchThreads = vi.mocked(fetchThreads);
const mockFetchThreadMessages = vi.mocked(fetchThreadMessages);
const mockCreateThread = vi.mocked(createThread);

// ---------------------------------------------------------------------------
// Test wrapper
// ---------------------------------------------------------------------------

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

// ---------------------------------------------------------------------------
// Setup/teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  queryClient?.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useThreads', () => {
  it('fetches and returns thread list', async () => {
    const threads = [
      { id: 't1', title: 'Thread 1', claudeSessionId: null, createdAt: 1, updatedAt: 1 },
    ];
    mockFetchThreads.mockResolvedValue(threads);

    const { result } = renderHook(() => useThreads(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(threads);
    expect(mockFetchThreads).toHaveBeenCalledOnce();
  });

  it('handles fetch error', async () => {
    mockFetchThreads.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useThreads(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Network error');
  });
});

describe('useThreadMessages', () => {
  it('fetches messages for a given thread ID', async () => {
    const messages = [
      { id: 'm1', threadId: 't1', role: 'user', content: 'Hello', createdAt: 1 },
    ];
    mockFetchThreadMessages.mockResolvedValue(messages);

    const { result } = renderHook(() => useThreadMessages('t1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(messages);
    expect(mockFetchThreadMessages).toHaveBeenCalledWith('t1');
  });

  it('does not fetch when threadId is null', () => {
    const { result } = renderHook(() => useThreadMessages(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetchThreadMessages).not.toHaveBeenCalled();
  });

  it('handles fetch error', async () => {
    mockFetchThreadMessages.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useThreadMessages('bad-id'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Not found');
  });
});

describe('useCreateThread', () => {
  it('creates a thread and returns it', async () => {
    const thread = { id: 't1', title: 'New conversation', claudeSessionId: null, createdAt: 1, updatedAt: 1 };
    mockCreateThread.mockResolvedValue(thread);

    const { result } = renderHook(() => useCreateThread(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(undefined);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(thread);
    expect(mockCreateThread).toHaveBeenCalledWith(undefined);
  });

  it('creates a thread with a custom title', async () => {
    const thread = { id: 't2', title: 'My topic', claudeSessionId: null, createdAt: 1, updatedAt: 1 };
    mockCreateThread.mockResolvedValue(thread);

    const { result } = renderHook(() => useCreateThread(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('My topic');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreateThread).toHaveBeenCalledWith('My topic');
  });

  it('invalidates thread list cache on success', async () => {
    const thread = { id: 't1', title: 'New', claudeSessionId: null, createdAt: 1, updatedAt: 1 };
    mockCreateThread.mockResolvedValue(thread);
    mockFetchThreads.mockResolvedValue([]);

    const wrapper = createWrapper();

    // First, populate the thread list cache
    const { result: threadsResult } = renderHook(() => useThreads(), { wrapper });
    await waitFor(() => expect(threadsResult.current.isSuccess).toBe(true));

    // Now create a thread
    const { result: mutationResult } = renderHook(() => useCreateThread(), { wrapper });
    mutationResult.current.mutate(undefined);

    await waitFor(() => expect(mutationResult.current.isSuccess).toBe(true));

    // The thread list query should have been refetched (called twice: initial + invalidation)
    await waitFor(() => expect(mockFetchThreads).toHaveBeenCalledTimes(2));
  });

  it('handles creation error', async () => {
    mockCreateThread.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useCreateThread(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(undefined);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Server error');
  });
});

describe('threadKeys', () => {
  it('has correct key structure', () => {
    expect(threadKeys.all).toEqual(['threads']);
    expect(threadKeys.messages('t1')).toEqual(['threads', 't1', 'messages']);
  });
});

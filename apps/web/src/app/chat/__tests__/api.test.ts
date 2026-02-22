import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchThreads, fetchThreadMessages, createThread, deleteThread } from '../api';

// ---------------------------------------------------------------------------
// Stub fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubEnv('NEXT_PUBLIC_SERVER_PORT', '3202');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchThreads', () => {
  it('fetches threads from the server', async () => {
    const threads = [
      { id: 't1', title: 'Thread 1', claudeSessionId: null, createdAt: 1, updatedAt: 1 },
    ];
    mockFetch.mockReturnValue(jsonResponse({ threads }));

    const result = await fetchThreads();

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3202/threads');
    expect(result).toEqual(threads);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValue(jsonResponse({}, 500));

    await expect(fetchThreads()).rejects.toThrow('Failed to fetch threads: 500');
  });
});

describe('fetchThreadMessages', () => {
  it('fetches messages for a thread', async () => {
    const messages = [
      { id: 'm1', threadId: 't1', role: 'user', content: 'Hello', createdAt: 1 },
    ];
    mockFetch.mockReturnValue(jsonResponse({ messages }));

    const result = await fetchThreadMessages('t1');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3202/threads/t1/messages',
    );
    expect(result).toEqual(messages);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValue(jsonResponse({}, 404));

    await expect(fetchThreadMessages('bad-id')).rejects.toThrow(
      'Failed to fetch messages: 404',
    );
  });
});

describe('createThread', () => {
  it('creates a thread with default title', async () => {
    const thread = { id: 't1', title: 'New conversation', claudeSessionId: null, createdAt: 1, updatedAt: 1 };
    mockFetch.mockReturnValue(jsonResponse({ thread }, 201));

    const result = await createThread();

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3202/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: undefined }),
    });
    expect(result).toEqual(thread);
  });

  it('creates a thread with custom title', async () => {
    const thread = { id: 't2', title: 'My topic', claudeSessionId: null, createdAt: 1, updatedAt: 1 };
    mockFetch.mockReturnValue(jsonResponse({ thread }, 201));

    const result = await createThread('My topic');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3202/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'My topic' }),
    });
    expect(result).toEqual(thread);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValue(jsonResponse({}, 500));

    await expect(createThread()).rejects.toThrow('Failed to create thread: 500');
  });

  it('uses default port when env is not set', async () => {
    vi.unstubAllEnvs();
    // Ensure the env var is not set
    delete process.env.NEXT_PUBLIC_SERVER_PORT;
    const thread = { id: 't1', title: 'Test', claudeSessionId: null, createdAt: 1, updatedAt: 1 };
    mockFetch.mockReturnValue(jsonResponse({ thread }, 201));

    await createThread();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:3002/threads'),
      expect.any(Object),
    );
  });
});

describe('deleteThread', () => {
  it('sends DELETE request to correct URL', async () => {
    mockFetch.mockReturnValue(jsonResponse({ success: true }));

    await deleteThread('t1');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3202/threads/t1', {
      method: 'DELETE',
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValue(jsonResponse({}, 404));

    await expect(deleteThread('bad-id')).rejects.toThrow(
      'Failed to delete thread: 404',
    );
  });
});

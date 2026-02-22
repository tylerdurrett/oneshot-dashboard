// ---------------------------------------------------------------------------
// Types (matching server response shapes from apps/server/src/routes/threads.ts)
// ---------------------------------------------------------------------------

export interface Thread {
  id: string;
  title: string;
  claudeSessionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  const port = process.env.NEXT_PUBLIC_SERVER_PORT ?? '3002';
  return `http://localhost:${port}`;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchThreads(): Promise<Thread[]> {
  const res = await fetch(`${getBaseUrl()}/threads`);
  if (!res.ok) throw new Error(`Failed to fetch threads: ${res.status}`);
  const data: { threads: Thread[] } = await res.json();
  return data.threads;
}

export async function fetchThreadMessages(
  threadId: string,
): Promise<ThreadMessage[]> {
  const res = await fetch(`${getBaseUrl()}/threads/${threadId}/messages`);
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
  const data: { messages: ThreadMessage[] } = await res.json();
  return data.messages;
}

export async function createThread(title?: string): Promise<Thread> {
  const res = await fetch(`${getBaseUrl()}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
  const data: { thread: Thread } = await res.json();
  return data.thread;
}

export async function deleteThread(threadId: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/threads/${threadId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete thread: ${res.status}`);
}

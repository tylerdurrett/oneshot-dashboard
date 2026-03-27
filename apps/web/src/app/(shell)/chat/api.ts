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

export interface ChatRunError {
  code: string;
  message: string;
}

export interface ChatRunSnapshot {
  runId: string;
  threadId: string | null;
  status: 'preparing' | 'running' | 'completed' | 'failed';
  accepted: boolean;
  completed: boolean;
  createdThread: boolean;
  userMessageId: string | null;
  assistantPreview: string;
  assistantMessageId: string | null;
  error: ChatRunError | null;
}

export type ChatRunEvent =
  | {
      type: 'ready';
      runId: string;
      threadId: string;
      createdThread: boolean;
      userMessageId: string;
    }
  | { type: 'token'; text: string }
  | { type: 'done'; assistantMessageId: string; sessionId: string }
  | { type: 'error'; code: string; message: string };

export interface StartChatRunParams {
  threadId?: string;
  content: string;
  clientRequestId: string;
  signal?: AbortSignal;
}

export interface ChatRunConflict extends ChatRunSnapshot {
  code: string;
}

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

import { getServerHttpUrl } from '@/lib/server-url';

const getBaseUrl = getServerHttpUrl;

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

export async function startChatRun({
  threadId,
  content,
  clientRequestId,
  signal,
}: StartChatRunParams): Promise<Response> {
  return fetch(`${getBaseUrl()}/chat/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, content, clientRequestId }),
    signal,
  });
}

export async function fetchChatRun(runId: string): Promise<ChatRunSnapshot> {
  const res = await fetch(`${getBaseUrl()}/chat/runs/${runId}`);
  if (!res.ok) throw new Error(`Failed to fetch chat run: ${res.status}`);
  return res.json();
}

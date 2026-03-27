export type ChatRunStatus = 'preparing' | 'running' | 'completed' | 'failed';

export interface ChatRunError {
  code: string;
  message: string;
}

export interface ChatRunRecord {
  runId: string;
  clientRequestId: string;
  threadId: string | null;
  status: ChatRunStatus;
  accepted: boolean;
  completed: boolean;
  createdThread: boolean;
  userMessageId: string | null;
  assistantMessageId: string | null;
  assistantPreview: string;
  error: ChatRunError | null;
  sessionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatRunSnapshot extends ChatRunRecord {}

export class ChatRunRegistry {
  private readonly runs = new Map<string, ChatRunRecord>();
  private readonly requestToRunId = new Map<string, string>();
  private readonly activeThreadRuns = new Map<string, string>();

  createPending(clientRequestId: string, threadId: string | null): ChatRunRecord {
    const now = Date.now();
    const run: ChatRunRecord = {
      runId: crypto.randomUUID(),
      clientRequestId,
      threadId,
      status: 'preparing',
      accepted: false,
      completed: false,
      createdThread: false,
      userMessageId: null,
      assistantMessageId: null,
      assistantPreview: '',
      error: null,
      sessionId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(run.runId, run);
    this.requestToRunId.set(clientRequestId, run.runId);
    return run;
  }

  getByRunId(runId: string): ChatRunRecord | undefined {
    return this.runs.get(runId);
  }

  getByClientRequestId(clientRequestId: string): ChatRunRecord | undefined {
    const runId = this.requestToRunId.get(clientRequestId);
    return runId ? this.runs.get(runId) : undefined;
  }

  getActiveRunIdForThread(threadId: string): string | undefined {
    return this.activeThreadRuns.get(threadId);
  }

  claimThread(threadId: string, runId: string): boolean {
    const activeRunId = this.activeThreadRuns.get(threadId);
    if (activeRunId && activeRunId !== runId) {
      return false;
    }

    this.activeThreadRuns.set(threadId, runId);
    return true;
  }

  releaseThread(threadId: string, runId: string): void {
    if (this.activeThreadRuns.get(threadId) === runId) {
      this.activeThreadRuns.delete(threadId);
    }
  }

  updateThread(runId: string, threadId: string, createdThread: boolean): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.threadId = threadId;
    run.createdThread = createdThread;
    run.updatedAt = Date.now();
  }

  markAccepted(runId: string, userMessageId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.accepted = true;
    run.status = 'running';
    run.userMessageId = userMessageId;
    run.updatedAt = Date.now();
  }

  appendPreview(runId: string, text: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.assistantPreview += text;
    run.updatedAt = Date.now();
  }

  complete(runId: string, assistantMessageId: string, sessionId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = 'completed';
    run.completed = true;
    run.assistantMessageId = assistantMessageId;
    run.sessionId = sessionId;
    run.updatedAt = Date.now();
    if (run.threadId) {
      this.releaseThread(run.threadId, runId);
    }
  }

  fail(runId: string, error: ChatRunError): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = 'failed';
    run.completed = true;
    run.error = error;
    run.updatedAt = Date.now();
    if (run.threadId) {
      this.releaseThread(run.threadId, runId);
    }
  }

  remove(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    if (run.threadId) {
      this.releaseThread(run.threadId, runId);
    }
    this.requestToRunId.delete(run.clientRequestId);
    this.runs.delete(runId);
  }

  snapshot(runId: string): ChatRunSnapshot | null {
    const run = this.runs.get(runId);
    if (!run) return null;
    return { ...run };
  }
}

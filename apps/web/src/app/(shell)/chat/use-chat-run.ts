import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { generateId } from '@/lib/generate-id';
import {
  fetchChatRun,
  startChatRun,
  type ChatRunConflict,
  type ChatRunEvent,
} from './api';
import { threadKeys } from './use-threads';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export type StreamState = 'idle' | 'streaming' | 'finishing';

export interface UseChatRunReturn {
  sendMessage: (threadId: string | null, content: string) => Promise<{ threadId: string }>;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isStreaming: boolean;
  streamState: StreamState;
  error: string | null;
  setError: (msg: string) => void;
  clearError: () => void;
  setVisibleThreadId: (threadId: string | null) => void;
}

interface ActiveRunState {
  runId: string;
  threadId: string | null;
  assistantMessageId: string;
  accepted: boolean;
}

function appendMessages(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  userId: string,
  content: string,
  assistantId: string,
): void {
  setMessages((prev) => [
    ...prev,
    { id: userId, role: 'user', content },
    { id: assistantId, role: 'assistant', content: '' },
  ]);
}

function rollbackMessages(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  userId: string,
  assistantId: string,
): void {
  setMessages((prev) =>
    prev.filter((message) => message.id !== userId && message.id !== assistantId),
  );
}

export function useChatRun(): UseChatRunReturn {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setErrorState] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState>('idle');

  const mountedRef = useRef(true);
  const visibleThreadIdRef = useRef<string | null>(null);
  const activeRunRef = useRef<ActiveRunState | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setError = useCallback((message: string) => {
    setErrorState(message);
  }, []);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const setVisibleThreadId = useCallback((threadId: string | null) => {
    visibleThreadIdRef.current = threadId;
  }, []);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const syncAssistantPreview = useCallback(
    (assistantMessageId: string, content: string, threadId: string | null) => {
      if (!mountedRef.current) return;
      if (threadId && visibleThreadIdRef.current && visibleThreadIdRef.current !== threadId) {
        return;
      }

      setMessages((prev) => {
        const existing = prev.find((message) => message.id === assistantMessageId);
        if (!existing) {
          return [...prev, { id: assistantMessageId, role: 'assistant', content }];
        }

        return prev.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content }
            : message,
        );
      });
    },
    [],
  );

  const finishRun = useCallback(
    (threadId: string | null) => {
      activeRunRef.current = null;
      setStreamState('idle');
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: threadKeys.messages(threadId) });
      }
      queryClient.invalidateQueries({ queryKey: threadKeys.all });
    },
    [queryClient],
  );

  const beginPolling = useCallback(
    (
      runId: string,
      assistantMessageId: string,
      onAccepted?: (threadId: string) => void,
    ) => {
      clearPollTimer();

      const poll = async () => {
        try {
          const run = await fetchChatRun(runId);
          if (run.threadId) {
            activeRunRef.current = {
              runId,
              threadId: run.threadId,
              assistantMessageId,
              accepted: run.accepted,
            };
            onAccepted?.(run.threadId);
          }

          if (run.assistantPreview) {
            syncAssistantPreview(
              assistantMessageId,
              run.assistantPreview,
              run.threadId,
            );
          }

          if (run.status === 'completed') {
            if (run.assistantMessageId) {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? { ...message, id: run.assistantMessageId! }
                    : message,
                ),
              );
            }
            finishRun(run.threadId);
            return;
          }

          if (run.status === 'failed') {
            if (run.error?.message) {
              setError(run.error.message);
            }
            finishRun(run.threadId);
            return;
          }

          pollTimerRef.current = setTimeout(poll, 1000);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to reconnect to the chat run';
          setError(message);
          setStreamState('idle');
        }
      };

      setStreamState('finishing');
      pollTimerRef.current = setTimeout(poll, 1000);
    },
    [clearPollTimer, finishRun, setError, syncAssistantPreview],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearPollTimer();
    };
  }, [clearPollTimer]);

  const sendMessage = useCallback(
    (threadId: string | null, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        return Promise.reject(new Error('Message is required'));
      }

      if (activeRunRef.current) {
        return Promise.reject(new Error('A response is already in progress'));
      }

      clearError();

      const userMessageId = `local-${generateId()}`;
      const assistantMessageId = `streaming-${generateId()}`;
      appendMessages(setMessages, userMessageId, trimmed, assistantMessageId);
      setStreamState('streaming');

      const clientRequestId = generateId();
      const acceptedPromise = new Promise<{ threadId: string }>((resolve, reject) => {
        const failBeforeAcceptance = (message: string) => {
          rollbackMessages(setMessages, userMessageId, assistantMessageId);
          activeRunRef.current = null;
          setStreamState('idle');
          setError(message);
          reject(new Error(message));
        };

        const attachToExistingRun = (conflict: ChatRunConflict) => {
          rollbackMessages(setMessages, userMessageId, assistantMessageId);
          activeRunRef.current = {
            runId: conflict.runId,
            threadId: conflict.threadId,
            assistantMessageId: `run-${conflict.runId}`,
            accepted: conflict.accepted,
          };

          if (conflict.assistantPreview) {
            syncAssistantPreview(
              `run-${conflict.runId}`,
              conflict.assistantPreview,
              conflict.threadId,
            );
          }

          if (conflict.threadId) {
            resolve({ threadId: conflict.threadId });
          }

          beginPolling(
            conflict.runId,
            `run-${conflict.runId}`,
            conflict.threadId
              ? undefined
              : (acceptedThreadId) => resolve({ threadId: acceptedThreadId }),
          );
        };

        void (async () => {
          let accepted = false;
          let acceptedThreadId: string | null = null;
          let activeAssistantId = assistantMessageId;
          let runId: string | null = null;
          let finalized = false;

          try {
            const response = await startChatRun({
              threadId: threadId ?? undefined,
              content: trimmed,
              clientRequestId,
            });

            if (response.status === 409) {
              const conflict = (await response.json()) as ChatRunConflict;
              attachToExistingRun(conflict);
              return;
            }

            if (!response.ok) {
              failBeforeAcceptance(`Failed to start chat run: ${response.status}`);
              return;
            }

            if (!response.body) {
              failBeforeAcceptance('Chat streaming is unavailable in this browser');
              return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            const processEvent = (event: ChatRunEvent) => {
              if (event.type === 'ready') {
                accepted = true;
                acceptedThreadId = event.threadId;
                runId = event.runId;
                activeRunRef.current = {
                  runId: event.runId,
                  threadId: event.threadId,
                  assistantMessageId: activeAssistantId,
                  accepted: true,
                };
                queryClient.invalidateQueries({ queryKey: threadKeys.all });
                resolve({ threadId: event.threadId });
                return;
              }

              if (event.type === 'token') {
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === activeAssistantId
                      ? { ...message, content: message.content + event.text }
                      : message,
                  ),
                );
                return;
              }

              if (event.type === 'done') {
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === activeAssistantId
                      ? { ...message, id: event.assistantMessageId }
                      : message,
                    ),
                );
                finalized = true;
                finishRun(acceptedThreadId);
                return;
              }

              if (event.type === 'error') {
                if (!accepted) {
                  finalized = true;
                  failBeforeAcceptance(event.message);
                  return;
                }
                finalized = true;
                setError(event.message);
                finishRun(acceptedThreadId);
              }
            };

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;
                processEvent(JSON.parse(trimmedLine) as ChatRunEvent);
              }
            }

            if (buffer.trim()) {
              processEvent(JSON.parse(buffer.trim()) as ChatRunEvent);
            }

            if (accepted && runId && !finalized) {
              beginPolling(runId, activeAssistantId);
            } else if (!accepted && !finalized) {
              failBeforeAcceptance('The chat run ended before it was accepted');
            }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : 'Failed to start chat run';
            if (!accepted) {
              failBeforeAcceptance(message);
              return;
            }

            if (runId) {
              beginPolling(runId, activeAssistantId);
              return;
            }

            setError(message);
            finishRun(acceptedThreadId);
          }
        })();
      });

      return acceptedPromise;
    },
    [
      beginPolling,
      clearError,
      finishRun,
      queryClient,
      setError,
      syncAssistantPreview,
    ],
  );

  return {
    sendMessage,
    messages,
    setMessages,
    isStreaming: streamState !== 'idle',
    streamState,
    error,
    setError,
    clearError,
    setVisibleThreadId,
  };
}

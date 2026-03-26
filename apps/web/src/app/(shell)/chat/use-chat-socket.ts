import { useState, useEffect, useRef, useCallback } from 'react';
import { generateId } from '@/lib/generate-id';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseChatSocketReturn {
  sendMessage: (threadId: string, content: string) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isStreaming: boolean;
  error: string | null;
  setError: (msg: string) => void;
  clearError: () => void;
  connectionStatus: ConnectionStatus;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 10_000;
const BACKOFF_MULTIPLIER = 2;
const CONNECT_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

import { getServerWsUrl } from '@/lib/server-url';

const getServerUrl = () => getServerWsUrl('/chat');

export function useChatSocket(enabled = true): UseChatSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>(enabled ? 'connecting' : 'disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  const isStreamingRef = useRef(false);
  // Tracks the in-progress streaming assistant message id
  const streamingIdRef = useRef<string | null>(null);

  // Keep ref in sync with state for stable sendMessage identity
  enabledRef.current = enabled;
  isStreamingRef.current = isStreaming;

  // -----------------------------------------------------------------------
  // Connection management
  // -----------------------------------------------------------------------

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const clearHeartbeatInterval = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const clearHeartbeatTimeout = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const clearSocketTimers = useCallback(() => {
    clearConnectTimeout();
    clearHeartbeatInterval();
    clearHeartbeatTimeout();
  }, [clearConnectTimeout, clearHeartbeatInterval, clearHeartbeatTimeout]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (!enabledRef.current) return;

    clearReconnectTimer();

    const delay = reconnectDelayRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (mountedRef.current) connect();
    }, delay);

    reconnectDelayRef.current = Math.min(
      delay * BACKOFF_MULTIPLIER,
      MAX_RECONNECT_DELAY,
    );
  }, [clearReconnectTimer]);

  const failSocket = useCallback(
    (ws: WebSocket) => {
      if (!mountedRef.current || wsRef.current !== ws) return;

      wsRef.current = null;
      clearSocketTimers();
      setConnectionStatus('disconnected');

      if (streamingIdRef.current) {
        streamingIdRef.current = null;
        setIsStreaming(false);
        setError('Connection lost during response. Please try again.');
      }

      // Bug fix: browsers can keep a dead WebSocket looking "alive" after
      // the server or network disappears. We recycle it so the retry loop
      // can recover instead of waiting forever.
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;

      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch {
        // Ignore close failures — reconnect scheduling is already in motion.
      }

      scheduleReconnect();
    },
    [clearSocketTimers, scheduleReconnect],
  );

  const connect = useCallback(() => {
    // Guard against connecting when unmounted
    if (!mountedRef.current) return;
    if (!enabledRef.current) return;
    if (wsRef.current) return;

    const url = getServerUrl();
    setConnectionStatus('connecting');
    clearReconnectTimer();

    const ws = new WebSocket(url);
    wsRef.current = ws;
    clearSocketTimers();

    connectTimeoutRef.current = setTimeout(() => {
      if (wsRef.current !== ws || ws.readyState === WebSocket.OPEN) return;
      failSocket(ws);
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (!mountedRef.current || wsRef.current !== ws) return;
      clearConnectTimeout();
      setConnectionStatus('connected');
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

      heartbeatIntervalRef.current = setInterval(() => {
        if (wsRef.current !== ws || ws.readyState !== WebSocket.OPEN) return;

        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          failSocket(ws);
          return;
        }

        clearHeartbeatTimeout();
        heartbeatTimeoutRef.current = setTimeout(() => {
          failSocket(ws);
        }, HEARTBEAT_TIMEOUT_MS);
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onclose = () => {
      if (!mountedRef.current || wsRef.current !== ws) return;
      wsRef.current = null;
      clearSocketTimers();
      setConnectionStatus('disconnected');

      // If we were streaming, mark it as interrupted with an error
      if (streamingIdRef.current) {
        streamingIdRef.current = null;
        setIsStreaming(false);
        setError('Connection lost during response. Please try again.');
      }

      scheduleReconnect();
    };

    ws.onerror = () => {
      // The close event fires after error — reconnection is handled there.
      // Nothing extra needed here.
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;

      let data: { type?: string; text?: string; messageId?: string; message?: string };
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }

      switch (data.type) {
        case 'token': {
          const text = data.text ?? '';
          const sid = streamingIdRef.current;
          if (sid) {
            // Append to the existing streaming message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === sid ? { ...m, content: m.content + text } : m,
              ),
            );
          }
          break;
        }

        case 'done': {
          const sid = streamingIdRef.current;
          if (sid && data.messageId) {
            // Replace the temporary streaming id with the real server id
            setMessages((prev) =>
              prev.map((m) => (m.id === sid ? { ...m, id: data.messageId! } : m)),
            );
          }
          streamingIdRef.current = null;
          setIsStreaming(false);
          break;
        }

        case 'pong': {
          clearHeartbeatTimeout();
          break;
        }

        case 'error': {
          setError(data.message ?? 'Unknown error');
          streamingIdRef.current = null;
          setIsStreaming(false);
          break;
        }
      }
    };
  }, [
    clearConnectTimeout,
    clearHeartbeatTimeout,
    clearReconnectTimer,
    clearSocketTimers,
    failSocket,
    scheduleReconnect,
  ]);

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      clearSocketTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clearReconnectTimer, clearSocketTimers, connect]);

  useEffect(() => {
    enabledRef.current = enabled;

    if (!enabled) {
      clearReconnectTimer();
      clearSocketTimers();
      setConnectionStatus('disconnected');

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    connect();
  }, [enabled, clearReconnectTimer, clearSocketTimers, connect]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      clearReconnectTimer();

      if (!enabledRef.current) return;

      if (!wsRef.current) {
        connect();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [clearReconnectTimer, connect]);

  // When the tab becomes visible again after being backgrounded, the OS or
  // browser may have silently dropped the TCP connection. The regular
  // heartbeat interval is throttled/paused while the tab is hidden, so it
  // can take 15 s + 10 s pong-timeout + up to 30 s backoff before the
  // client notices. This handler short-circuits that wait.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden || !mountedRef.current) return;

      // Reset backoff so the next attempt is fast.
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

      const ws = wsRef.current;
      if (!ws) {
        // No socket — cancel any pending backoff timer and connect now.
        clearReconnectTimer();
        connect();
      } else if (ws.readyState === WebSocket.OPEN) {
        // Socket *looks* alive — send an immediate ping to verify.
        clearHeartbeatTimeout();
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          failSocket(ws);
          return;
        }
        heartbeatTimeoutRef.current = setTimeout(() => {
          if (wsRef.current === ws) failSocket(ws);
        }, HEARTBEAT_TIMEOUT_MS);
      }
      // If CONNECTING, the existing connect timeout will handle it.
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [clearHeartbeatTimeout, clearReconnectTimer, connect, failSocket]);

  // -----------------------------------------------------------------------
  // Send
  // -----------------------------------------------------------------------

  const clearError = useCallback(() => setError(null), []);

  const sendMessage = useCallback(
    (threadId: string, content: string) => {
      if (!enabledRef.current) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (isStreamingRef.current) return;

      setError(null);

      // Optimistically append the user message
      const userMsgId = `local-${generateId()}`;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', content },
      ]);

      // Prepare a placeholder for the assistant response
      const assistantMsgId = `streaming-${generateId()}`;
      streamingIdRef.current = assistantMsgId;
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', content: '' },
      ]);
      setIsStreaming(true);

      try {
        wsRef.current.send(
          JSON.stringify({ type: 'message', threadId, content }),
        );
      } catch {
        setError('Failed to send message');
        streamingIdRef.current = null;
        setIsStreaming(false);
      }
    },
    [], // stable identity — uses refs for mutable state
  );

  return {
    sendMessage,
    messages,
    setMessages,
    isStreaming,
    error,
    setError,
    clearError,
    connectionStatus,
  };
}

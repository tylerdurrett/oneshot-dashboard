'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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
  connectionStatus: ConnectionStatus;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30_000;
const BACKOFF_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function getServerUrl(): string {
  const port = process.env.NEXT_PUBLIC_SERVER_PORT ?? '3002';
  return `ws://localhost:${port}/chat`;
}

export function useChatSocket(): UseChatSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const isStreamingRef = useRef(false);
  // Tracks the in-progress streaming assistant message id
  const streamingIdRef = useRef<string | null>(null);

  // Keep ref in sync with state for stable sendMessage identity
  isStreamingRef.current = isStreaming;

  // -----------------------------------------------------------------------
  // Connection management
  // -----------------------------------------------------------------------

  const connect = useCallback(() => {
    // Guard against connecting when unmounted
    if (!mountedRef.current) return;

    const url = getServerUrl();
    setConnectionStatus('connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionStatus('connected');
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      wsRef.current = null;
      setConnectionStatus('disconnected');

      // If we were streaming, mark it as interrupted with an error
      if (streamingIdRef.current) {
        streamingIdRef.current = null;
        setIsStreaming(false);
        setError('Connection lost during response. Please try again.');
      }

      // Schedule reconnect with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
      reconnectDelayRef.current = Math.min(
        delay * BACKOFF_MULTIPLIER,
        MAX_RECONNECT_DELAY,
      );
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

        case 'error': {
          setError(data.message ?? 'Unknown error');
          streamingIdRef.current = null;
          setIsStreaming(false);
          break;
        }
      }
    };
  }, []); // stable — no external deps needed

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // -----------------------------------------------------------------------
  // Send
  // -----------------------------------------------------------------------

  const sendMessage = useCallback(
    (threadId: string, content: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (isStreamingRef.current) return;

      setError(null);

      // Optimistically append the user message
      const userMsgId = `local-${crypto.randomUUID()}`;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', content },
      ]);

      // Prepare a placeholder for the assistant response
      const assistantMsgId = `streaming-${crypto.randomUUID()}`;
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
    connectionStatus,
  };
}

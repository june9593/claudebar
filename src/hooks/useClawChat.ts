import { useState, useEffect, useRef, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface UseClawChat {
  messages: ChatMessage[];
  isConnected: boolean;
  isTyping: boolean;
  sendMessage: (text: string) => void;
  clearMessages: () => void;
  error: string | null;
}

let rpcIdCounter = 1;
function nextId() { return rpcIdCounter++; }

export function useClawChat(gatewayUrl: string, authToken: string): UseClawChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const maxRetries = 3;
  const pendingAssistantRef = useRef<string>('');
  const authenticatedRef = useRef(false);
  const historyIdRef = useRef<number>(0);
  const openTimeRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (!gatewayUrl) return;

    // Derive ws URL from http URL
    const wsUrl = gatewayUrl
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')
      .replace(/\/+$/, '');

    authenticatedRef.current = false;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        openTimeRef.current = Date.now();
        setError(null);
        retriesRef.current = 0;

        // Wait for server welcome message before authenticating.
        // OpenClaw Gateway may send a welcome/handshake first.
        // If no message arrives within 2s, send auth proactively.
        const authTimeout = setTimeout(() => {
          if (!authenticatedRef.current && ws.readyState === WebSocket.OPEN) {
            sendAuth(ws);
          }
        }, 2000);
        (ws as unknown as Record<string, unknown>).__authTimeout = authTimeout;
      };

      const sendAuth = (sock: WebSocket) => {
        if (authenticatedRef.current) return;
        authenticatedRef.current = true;

        // JSON-RPC 2.0 auth handshake
        sock.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'connect',
          id: nextId(),
          params: { auth: { token: authToken } },
        }));

        // Request chat history
        historyIdRef.current = nextId();
        sock.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'chat.history',
          id: historyIdRef.current,
          params: {},
        }));

        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // If we get any server message before auth, treat it as welcome and send auth
          if (!authenticatedRef.current && ws.readyState === WebSocket.OPEN) {
            const timer = (ws as unknown as Record<string, unknown>).__authTimeout;
            if (timer) clearTimeout(timer as ReturnType<typeof setTimeout>);
            sendAuth(ws);
          }

          // History response
          if (data.id === historyIdRef.current && data.result?.messages) {
            const history: ChatMessage[] = data.result.messages
              .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
              .map((m: { role: string; content: string; timestamp?: string }, i: number) => ({
                id: `hist-${i}`,
                role: m.role as 'user' | 'assistant',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                timestamp: m.timestamp || new Date().toISOString(),
              }));
            setMessages(history);
          }

          // Streaming chat event
          if (data.type === 'chat') {
            const payload = data.data || data.params || data;
            if (payload.event === 'start' || payload.streaming === true) {
              setIsTyping(true);
              pendingAssistantRef.current = '';
            } else if (payload.event === 'delta' || payload.delta) {
              pendingAssistantRef.current += payload.delta || payload.text || '';
            } else if (payload.event === 'end' || payload.done === true) {
              const content = pendingAssistantRef.current || payload.text || payload.content || '';
              if (content) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    content,
                    timestamp: new Date().toISOString(),
                  },
                ]);
              }
              pendingAssistantRef.current = '';
              setIsTyping(false);
            }
          }

          // JSON-RPC error response
          if (data.error) {
            setError(`Gateway: ${data.error.message || JSON.stringify(data.error)}`);
          }

          // Non-streaming response (result with assistant content)
          if (data.result?.role === 'assistant' && data.result?.content) {
            setMessages((prev) => [
              ...prev,
              {
                id: data.id || `msg-${Date.now()}`,
                role: 'assistant',
                content: data.result.content,
                timestamp: new Date().toISOString(),
              },
            ]);
            setIsTyping(false);
          }
        } catch {
          // Skip unparseable messages
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        wsRef.current = null;

        const timer = (ws as unknown as Record<string, unknown>).__authTimeout;
        if (timer) clearTimeout(timer as ReturnType<typeof setTimeout>);

        // Detect immediate close (within 1s of open) — likely auth or protocol issue
        const livedMs = Date.now() - (openTimeRef.current || 0);
        if (livedMs < 1000 && retriesRef.current === 0) {
          setError(`连接被立即关闭 (code ${event.code})，请检查 Gateway 地址和认证`);
          retriesRef.current = maxRetries; // don't retry on immediate close
          return;
        }

        if (retriesRef.current < maxRetries) {
          retriesRef.current++;
          setTimeout(connect, 3000);
        } else {
          setError('连接已断开，请检查 Gateway');
        }
      };

      ws.onerror = () => {
        setError('WebSocket 连接错误');
      };
    } catch {
      setError('无法建立 WebSocket 连接');
    }
  }, [gatewayUrl, authToken]);

  useEffect(() => {
    connect();
    return () => {
      retriesRef.current = maxRetries; // prevent reconnect on unmount
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    wsRef.current.send(JSON.stringify({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'chat.send',
      params: { text, sessionKey: 'main' },
    }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setIsTyping(false);
    pendingAssistantRef.current = '';
  }, []);

  return { messages, isConnected, isTyping, sendMessage, clearMessages, error };
}

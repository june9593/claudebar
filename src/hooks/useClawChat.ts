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
  error: string | null;
}

export function useClawChat(gatewayUrl: string, authToken: string): UseClawChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const maxRetries = 3;
  const pendingAssistantRef = useRef<string>('');

  const connect = useCallback(() => {
    if (!gatewayUrl) return;

    // Derive ws URL from http URL
    const wsUrl = gatewayUrl
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')
      .replace(/\/+$/, '');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        retriesRef.current = 0;

        // Authenticate
        ws.send(JSON.stringify({
          method: 'connect',
          params: { auth: { token: authToken } },
        }));

        // Request history
        ws.send(JSON.stringify({
          id: 'hist-1',
          method: 'chat.history',
          params: { sessionKey: 'main' },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // History response
          if (data.id === 'hist-1' && data.result?.messages) {
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

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

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
      id: `msg-${Date.now()}`,
      method: 'chat.send',
      params: { text, sessionKey: 'main' },
    }));
  }, []);

  return { messages, isConnected, isTyping, sendMessage, error };
}

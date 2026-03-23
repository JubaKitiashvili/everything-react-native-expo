import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { AgentMap, HistoryMap } from '../types';

interface WsMessage {
  type: string;
  agents?: AgentMap;
  history?: HistoryMap;
  data?: unknown;
  state?: unknown;
}

type MessageHandler = (msg: WsMessage) => void;

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<AgentMap>({});
  const [history, setHistory] = useState<HistoryMap>({});
  const [events, setEvents] = useState<Array<{ time: string; icon: string; text: string }>>([]);
  const [workerState, setWorkerState] = useState<unknown>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<MessageHandler[]>([]);
  const retryRef = useRef(0);

  const addHandler = useCallback((handler: MessageHandler) => {
    handlersRef.current.push(handler);
    return () => {
      handlersRef.current = handlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  useEffect(() => {
    let destroyed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (destroyed) return;
      // In dev mode (Vite), connect directly to backend; in production, use same host
      const isDev = import.meta.env.DEV;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = isDev ? window.location.host || 'localhost:3333' : window.location.host;
      const url = `${protocol}//${host}`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          if (msg.type === 'init') {
            if (msg.agents) setAgents(msg.agents);
            if (msg.history) setHistory(msg.history);
          } else if (msg.type === 'state' && msg.agents) {
            setAgents(msg.agents);
          } else if (msg.type === 'session_event' && msg.data) {
            const ev = msg.data as { time: string; icon: string; text: string };
            setEvents((prev) => [ev, ...prev].slice(0, 50));
          } else if (msg.type === 'worker_update' && msg.state) {
            const tasks = (msg as Record<string, unknown>).tasks;
            setWorkerState({ ...(msg.state as object), tasks } as unknown);
          }
          for (const handler of handlersRef.current) {
            handler(msg);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!destroyed) {
          const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
          retryRef.current++;
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const activeAgentCount = useMemo(
    () => Object.values(agents).filter((a) => a.status !== 'idle').length,
    [agents],
  );

  return { connected, agents, history, events, workerState, activeAgentCount, addHandler };
}

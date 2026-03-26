import type { RealtimeEvent } from "../types";

type RealtimeOptions = {
  baseUrl: string;
  apiKey?: string;
  sessionId?: string;
  onMessage: (event: RealtimeEvent) => void;
  onClose?: () => void;
  onOpen?: () => void;
};

function toRealtimeUrl(baseUrl: string, apiKey?: string, sessionId?: string) {
  // 如果 baseUrl 为空（相对路径），使用当前页面的 origin
  const normalized = baseUrl ? baseUrl.replace(/\/+$/, "") : window.location.origin;
  const url = new URL(`${normalized}/api/realtime/ws`);
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }
  if (sessionId) {
    url.searchParams.set("session_id", sessionId);
  }

  if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol === "http:") {
    url.protocol = "ws:";
  }
  return url.toString();
}

export function connectRealtime(options: RealtimeOptions) {
  const socket = new WebSocket(
    toRealtimeUrl(options.baseUrl, options.apiKey, options.sessionId),
  );

  socket.onopen = () => {
    options.onOpen?.();
  };

  socket.onmessage = (event) => {
    try {
      options.onMessage(JSON.parse(String(event.data)) as RealtimeEvent);
    } catch {
      // ignore invalid payload
    }
  };

  socket.onclose = () => {
    options.onClose?.();
  };
  socket.onerror = () => {
    options.onClose?.();
  };

  return socket;
}

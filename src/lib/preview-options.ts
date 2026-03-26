export type PreviewApiOptions = {
  baseUrl?: string;
  apiKey?: string;
  messagesLimit?: number;
};

export type PreviewCardConfig = {
  entity: string;
  base_url?: string;
  api_key?: string;
  messages_limit?: number;
  llm_enabled?: boolean;
  llm_base_url?: string;
  llm_model?: string;
};

type PlaygroundEnv = {
  VITE_BASE_URL?: string;
  VITE_API_KEY?: string;
};

function getPlaygroundEnv(): PlaygroundEnv {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env as PlaygroundEnv;
  }
  return {};
}

function readStringParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value || undefined;
}

export function inferPreviewBaseUrl(url: URL) {
  const match = url.pathname.match(/^\/([0-9]{5})(?:\/|$)/);
  if (!match) {
    return undefined;
  }

  return `/${match[1]}`;
}

const env = getPlaygroundEnv();
const DEFAULT_BASE_URL = env.VITE_BASE_URL || "";
const DEFAULT_API_KEY = env.VITE_API_KEY || "";

export function readPreviewApiOptions(url = new URL(window.location.href)): PreviewApiOptions {
  const inferredBaseUrl = inferPreviewBaseUrl(url);
  const baseUrl = readStringParam(url.searchParams, "base_url") || inferredBaseUrl || DEFAULT_BASE_URL;
  const apiKey = readStringParam(url.searchParams, "api_key") || DEFAULT_API_KEY;
  const rawLimit = readStringParam(url.searchParams, "messages_limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;

  return {
    baseUrl,
    apiKey,
    messagesLimit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
  };
}

export function buildPreviewCardConfig(entity: string, options: PreviewApiOptions): PreviewCardConfig {
  return {
    entity,
    ...(options.baseUrl !== undefined ? { base_url: options.baseUrl } : {}),
    ...(options.apiKey ? { api_key: options.apiKey } : {}),
    ...(options.messagesLimit ? { messages_limit: options.messagesLimit } : {}),
    llm_enabled: true,
    llm_base_url: "/llm-api",
  };
}

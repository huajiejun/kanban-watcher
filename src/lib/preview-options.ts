import type { QuickButtonRules } from "../types";
import { DEFAULT_QUICK_BUTTON_RULES } from "./quick-buttons";

export type PreviewApiOptions = {
  baseUrl?: string;
  apiKey?: string;
  messagesLimit?: number;
  quickButtonRules?: QuickButtonRules;
};

export type PreviewCardConfig = {
  entity: string;
  base_url?: string;
  api_key?: string;
  messages_limit?: number;
  llm_enabled?: boolean;
  llm_base_url?: string;
  llm_model?: string;
  quick_button_rules?: {
    forbidden_actions?: string[];
  };
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

const env = getPlaygroundEnv();
const DEFAULT_BASE_URL = env.VITE_BASE_URL || (env.VITE_BACKEND_PORT ? `http://127.0.0.1:${env.VITE_BACKEND_PORT}` : "http://127.0.0.1:7778");
const DEFAULT_API_KEY = env.VITE_API_KEY || "";

function readCommaSeparatedParam(params: URLSearchParams, key: string) {
  const value = readStringParam(params, key);
  if (!value) {
    return undefined;
  }
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
}

export function readPreviewApiOptions(url = new URL(window.location.href)): PreviewApiOptions {
  const baseUrl = readStringParam(url.searchParams, "base_url") || DEFAULT_BASE_URL;
  const apiKey = readStringParam(url.searchParams, "api_key") || DEFAULT_API_KEY;
  const rawLimit = readStringParam(url.searchParams, "messages_limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;
  const forbiddenActions = readCommaSeparatedParam(url.searchParams, "quick_button_forbidden_actions");

  return {
    baseUrl,
    apiKey,
    messagesLimit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
    quickButtonRules: {
      forbiddenActions: forbiddenActions ?? DEFAULT_QUICK_BUTTON_RULES.forbiddenActions,
    },
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
    quick_button_rules: {
      forbidden_actions: options.quickButtonRules?.forbiddenActions ?? DEFAULT_QUICK_BUTTON_RULES.forbiddenActions,
    },
  };
}

import "./index";
import { createPreviewHass, previewEntityId } from "./dev/preview-fixture";

type PreviewHass = ReturnType<typeof createPreviewHass>;

type PlaygroundCardConfig = {
  entity: string;
  base_url?: string;
  api_key?: string;
  messages_limit?: number;
  llm_enabled?: boolean;
  llm_base_url?: string;
  llm_model?: string;
};

type PlaygroundCard = HTMLElement & {
  hass?: PreviewHass;
  setConfig(config: PlaygroundCardConfig): void;
};

type PreviewApiOptions = {
  baseUrl?: string;
  apiKey?: string;
  messagesLimit?: number;
};

type PreviewModeInfo = {
  title: string;
  detail: string;
};

type PreviewRequestInfo = {
  tone: "muted" | "success" | "error";
  title: string;
  detail: string;
};

type PreviewStatusDetail = {
  message?: string;
};

function isErrorStatusMessage(message?: string) {
  const value = message?.trim();
  if (!value) {
    return false;
  }
  return (
    value.includes("失败") ||
    value.includes("异常") ||
    value.includes("Unauthorized") ||
    value.includes("数据库未初始化")
  );
}

function readStringParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value || undefined;
}

// 默认配置（本地开发预览）
const DEFAULT_BASE_URL = "http://127.0.0.1:7778";
const DEFAULT_API_KEY = "wolale1990";

export function readPreviewApiOptions(url = new URL(window.location.href)): PreviewApiOptions {
  const baseUrl = readStringParam(url.searchParams, "base_url") || DEFAULT_BASE_URL;
  const apiKey = readStringParam(url.searchParams, "api_key") || DEFAULT_API_KEY;
  const rawLimit = readStringParam(url.searchParams, "messages_limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;

  return {
    baseUrl,
    apiKey,
    messagesLimit:
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
  };
}

export function buildPreviewCardConfig(
  options: PreviewApiOptions,
): PlaygroundCardConfig {
  return {
    entity: previewEntityId,
    ...(options.baseUrl ? { base_url: options.baseUrl } : {}),
    ...(options.apiKey ? { api_key: options.apiKey } : {}),
    ...(options.messagesLimit ? { messages_limit: options.messagesLimit } : {}),
    // 启用 LLM 推荐按钮
    llm_enabled: true,
    llm_base_url: "http://localhost:1234",
  };
}

export function describePreviewMode(options: PreviewApiOptions): PreviewModeInfo {
  if (!options.baseUrl) {
    return {
      title: "当前模式：Mock 数据",
      detail: "使用本地预设 hass 数据，适合看 UI 和交互。",
    };
  }

  const limitText = options.messagesLimit
    ? `，弹窗首次加载 ${options.messagesLimit} 条消息。`
    : "。";

  return {
    title: "当前模式：真实 API",
    detail: `正在直连 ${options.baseUrl}${limitText}`,
  };
}

export function describePreviewRequestState(
  isApiMode: boolean,
  statusMessage?: string,
): PreviewRequestInfo {
  if (!isApiMode) {
    return {
      tone: "muted",
      title: "请求状态：未启用",
      detail: "当前使用本地 mock 数据，不会请求 kanban-watcher API。",
    };
  }

  if (isErrorStatusMessage(statusMessage)) {
    return {
      tone: "error",
      title: "请求状态：异常",
      detail: statusMessage!.trim(),
    };
  }

  if (statusMessage?.trim()) {
    return {
      tone: "success",
      title: "请求状态：正常",
      detail: statusMessage.trim(),
    };
  }

  return {
    tone: "success",
    title: "请求状态：正常",
    detail: "已经启用真实 API 模式，错误信息会显示在这里。",
  };
}

function renderPreviewMode(
  mountPoint: Element | null,
  options: PreviewApiOptions,
) {
  if (!mountPoint) {
    return;
  }

  const mode = describePreviewMode(options);
  mountPoint.innerHTML = `
    <div class="tip preview-mode-tip">
      <strong>${mode.title}</strong>
      <span>${mode.detail}</span>
    </div>
  `;
}

function renderPreviewRequestState(
  mountPoint: Element | null,
  options: PreviewApiOptions,
  statusMessage?: string,
) {
  if (!mountPoint) {
    return;
  }

  const request = describePreviewRequestState(Boolean(options.baseUrl), statusMessage);
  mountPoint.innerHTML = `
    <div class="tip preview-request-tip tone-${request.tone}">
      <strong>${request.title}</strong>
      <span>${request.detail}</span>
    </div>
  `;
}

function bindPreviewStatus(
  card: PlaygroundCard,
  mountPoint: Element | null,
  options: PreviewApiOptions,
) {
  renderPreviewRequestState(mountPoint, options);

  card.addEventListener("kanban-watcher-preview-status", (event: Event) => {
    const customEvent = event as CustomEvent<PreviewStatusDetail>;
    renderPreviewRequestState(mountPoint, options, customEvent.detail?.message);
  });
}

const mountPoint = document.querySelector("[data-preview-root]");
const modeMountPoint = document.querySelector("[data-preview-mode]");
const requestMountPoint = document.querySelector("[data-preview-request]");
const previewOptions = readPreviewApiOptions();

if (mountPoint) {
  renderPreviewMode(modeMountPoint, previewOptions);
  const card = document.createElement("kanban-watcher-card") as PlaygroundCard;
  card.setConfig(buildPreviewCardConfig(previewOptions));

  if (!previewOptions.baseUrl) {
    card.hass = createPreviewHass();
  }

  bindPreviewStatus(card, requestMountPoint, previewOptions);
  mountPoint.append(card);
}

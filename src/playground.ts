import "./index";
import { createPreviewHass, previewEntityId } from "./dev/preview-fixture";
import {
  buildPreviewCardConfig as buildPreviewCardConfigFromOptions,
  readPreviewApiOptions,
  type PreviewApiOptions,
} from "./lib/preview-options";

type PreviewHass = ReturnType<typeof createPreviewHass>;

type PlaygroundCardConfig = {
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

type PlaygroundCard = HTMLElement & {
  hass?: PreviewHass;
  setConfig(config: PlaygroundCardConfig): void;
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

export function buildPreviewCardConfig(
  options: PreviewApiOptions,
): PlaygroundCardConfig {
  return buildPreviewCardConfigFromOptions(previewEntityId, options);
}

export { readPreviewApiOptions };

export function describePreviewMode(options: PreviewApiOptions): PreviewModeInfo {
  // baseUrl 为 undefined 时表示 Mock 模式，空字符串表示使用相对路径（Vite 代理模式）
  if (options.baseUrl === undefined) {
    return {
      title: "当前预览：Mock 数据",
      detail: "使用本地预设 hass 数据，适合查看预览页 UI 和交互。",
    };
  }

  const limitText = options.messagesLimit
    ? `，弹窗首次加载 ${options.messagesLimit} 条消息。`
    : "。";

  // 空字符串表示使用相对路径（Vite 代理）
  const connectionText = options.baseUrl || "（通过 Vite 代理）";

  return {
    title: "当前预览：真实 API",
    detail: `预览页正在直连 ${connectionText}${limitText}`,
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

  // baseUrl 不为 undefined 时表示 API 模式（包括空字符串相对路径模式）
  const isApiMode = options.baseUrl !== undefined;
  const request = describePreviewRequestState(isApiMode, statusMessage);
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

  // baseUrl 为 undefined 时使用 mock 数据，空字符串表示使用相对路径（Vite 代理）
  if (previewOptions.baseUrl === undefined) {
    card.hass = createPreviewHass();
  }

  bindPreviewStatus(card, requestMountPoint, previewOptions);
  mountPoint.append(card);
}

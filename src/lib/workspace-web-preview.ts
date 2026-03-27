import type { KanbanWorkspace } from "../types";

const WORKSPACE_WEB_PREVIEW_DOMAIN = "huajiejun.cn";

export function getWorkspaceEmbeddedPreviewUrl(
  workspace: KanbanWorkspace,
  previewProxyPort?: number,
) {
  const browserUrl = workspace.browser_url?.trim() || workspace.browserUrl?.trim() || "";
  if (!browserUrl) {
    return "";
  }

  try {
    const parsed = new URL(browserUrl);
    const host = parsed.hostname.toLowerCase();
    const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
    if (!isLocalhost || !previewProxyPort) {
      return parsed.toString();
    }

    const devServerPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    const path = `${parsed.pathname}${parsed.search}`;
    return `http://${devServerPort}.localhost:${previewProxyPort}${path}`;
  } catch {
    return browserUrl;
  }
}

export function buildWorkspacePreviewUrlFromFrontendPort(frontendPort: number) {
  return `https://${frontendPort}.${WORKSPACE_WEB_PREVIEW_DOMAIN}`;
}

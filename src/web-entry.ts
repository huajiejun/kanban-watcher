import { mountWorkspaceHome } from "./web/workspace-home";

export type PageMode = "workspace" | "preview";

function normalizePagePath(pathname: string) {
  return pathname.replace(/^\/\d{4,5}(?=\/|$)/, "") || "/";
}

export function getPageMode(url = new URL(window.location.href)): PageMode {
  const normalizedPath = normalizePagePath(url.pathname);
  return normalizedPath === "/preview" || normalizedPath === "/preview/"
    ? "preview"
    : "workspace";
}

const mountPoint = document.querySelector("[data-app-root]");

if (mountPoint) {
  if (getPageMode() === "preview") {
    void import("./playground");
  } else {
    mountWorkspaceHome(mountPoint);
  }
}

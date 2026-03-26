import { mountWorkspaceHome } from "./web/workspace-home";

export type PageMode = "workspace" | "preview";

export function getPageMode(url = new URL(window.location.href)): PageMode {
  const normalizedPath = url.pathname.replace(/^\/[0-9]{5}(?=\/|$)/, "");
  return normalizedPath === "/preview" || normalizedPath === "/preview/"
    ? "preview"
    : "workspace";
}

const mountPoint = typeof document !== "undefined"
  ? document.querySelector("[data-app-root]")
  : null;

if (mountPoint) {
  if (getPageMode() === "preview") {
    void import("./playground");
  } else {
    mountWorkspaceHome(mountPoint);
  }
}

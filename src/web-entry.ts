import { mountWorkspaceHome } from "./web/workspace-home";

export type PageMode = "workspace" | "preview";

export function getPageMode(url = new URL(window.location.href)): PageMode {
  return url.pathname === "/preview" || url.pathname === "/preview/"
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

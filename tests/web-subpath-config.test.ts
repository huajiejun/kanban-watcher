// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createSharedViteConfig } from "../vite.shared";
import { readPreviewApiOptions } from "../src/lib/preview-options";
import { getPageMode } from "../src/web-entry";

describe("web subpath config", () => {
  it("builds vite config with subpath base and hmr settings", () => {
    const config = createSharedViteConfig({
      VITE_BACKEND_PORT: "18473",
      VITE_DEV_BASE_PATH: "/16473/",
      VITE_DEV_ALLOWED_HOSTS: "ai.huajiejun.cn,dev.huajiejun.cn",
      VITE_DEV_HMR_HOST: "dev.huajiejun.cn",
      VITE_DEV_HMR_PROTOCOL: "wss",
      VITE_DEV_HMR_CLIENT_PORT: "443",
      VITE_DEV_HMR_PATH: "/16473/__vite_ws",
    });

    expect(config.base).toBe("/16473/");
    expect(config.server.allowedHosts).toContain("dev.huajiejun.cn");
    expect(config.server.proxy["/api"].target).toBe("http://localhost:18473");
    expect(config.server.hmr).toMatchObject({
      host: "dev.huajiejun.cn",
      protocol: "wss",
      clientPort: 443,
      path: "/16473/__vite_ws",
    });
  });

  it("infers relative api base from a port-prefixed url", () => {
    const options = readPreviewApiOptions(
      new URL("https://dev.huajiejun.cn/16473/?api_key=test-key"),
    );

    expect(options).toEqual({
      baseUrl: "/16473",
      apiKey: "test-key",
      messagesLimit: undefined,
    });
  });

  it("treats a port-prefixed preview path as preview mode", () => {
    expect(getPageMode(new URL("https://dev.huajiejun.cn/16473/preview"))).toBe("preview");
    expect(getPageMode(new URL("https://dev.huajiejun.cn/16473/"))).toBe("workspace");
  });
});

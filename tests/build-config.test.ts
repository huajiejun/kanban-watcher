// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import haConfig from "../vite.config.ha";
import webConfig from "../vite.config.web";

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as {
  scripts?: Record<string, string>;
};
const previewHtml = readFileSync(resolve(process.cwd(), "preview/index.html"), "utf8");

describe("build config", () => {
  it("exposes independent build commands for Home Assistant and web", () => {
    expect(packageJson.scripts).toMatchObject({
      build: "npm run build:ha && npm run build:web",
      "build:ha": "vite build --config vite.config.ha.ts",
      "build:web": "vite build --config vite.config.web.ts",
    });
  });

  it("builds the Home Assistant card as a library bundle", () => {
    expect(haConfig.build?.outDir).toBe("dist/ha");
    expect(haConfig.build?.lib).toMatchObject({
      entry: "src/index.ts",
      name: "KanbanWatcherCard",
      formats: ["es"],
    });
    expect(haConfig.build?.lib?.fileName?.("es")).toBe("kanban-watcher-card.js");
  });

  it("builds the web app as a multi-page site", () => {
    expect(webConfig.base).toBe("./");
    expect(webConfig.build?.outDir).toBe("dist/web");
    expect(webConfig.build?.lib).toBeUndefined();
    expect(webConfig.build?.rollupOptions?.input).toMatchObject({
      main: resolve(process.cwd(), "index.html"),
      preview: resolve(process.cwd(), "preview/index.html"),
    });
  });

  it("uses a preview entry path that resolves from the preview directory during build", () => {
    expect(previewHtml).toContain('<script type="module" src="../src/playground.ts"></script>');
  });
});

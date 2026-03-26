import { defineConfig } from "vite";
import { sharedViteConfig } from "./vite.shared";

export default defineConfig({
  ...sharedViteConfig,
  build: {
    outDir: "dist/ha",
    lib: {
      entry: "src/index.ts",
      name: "KanbanWatcherCard",
      formats: ["es"],
      fileName: () => "kanban-watcher-card.js",
    },
  },
});

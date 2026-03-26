import { resolve } from "node:path";
import { defineConfig } from "vite";
import { sharedViteConfig } from "./vite.shared";

export default defineConfig({
  ...sharedViteConfig,
  build: {
    outDir: "dist/web",
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        preview: resolve(process.cwd(), "preview/index.html"),
      },
    },
  },
});

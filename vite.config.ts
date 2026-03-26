import { defineConfig } from "vite";
import { sharedViteConfig } from "./vite.shared";

export default defineConfig({
  ...sharedViteConfig,
  base: "/5177/",
});

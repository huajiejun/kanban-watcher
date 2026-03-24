import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    lib: {
      entry: 'src/index.ts',
      name: 'KanbanWatcherCard',
      formats: ['es'],
      fileName: () => 'kanban-watcher-card.js',
    },
  },
  test: {
    environment: "jsdom",
  },
  server: {
    proxy: {
      // 代理 LLM API 请求到 LM Studio，解决 CORS 问题
      '/llm-api': {
        target: 'http://localhost:1234',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm-api/, ''),
      },
    },
  },
});

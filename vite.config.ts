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
});

export const sharedViteConfig = {
  test: {
    environment: "jsdom",
  },
  server: {
    allowedHosts: ["ai.huajiejun.cn"],
    proxy: {
      // 代理 API 请求到后端服务，支持移动端通过 frp 访问
      "/api": {
        target: "http://localhost:7778",
        changeOrigin: true,
        ws: true,
      },
      // 代理 LLM API 请求到 LM Studio，解决 CORS 问题
      "/llm-api": {
        target: "http://localhost:1234",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/llm-api/, ""),
      },
    },
  },
} as const;

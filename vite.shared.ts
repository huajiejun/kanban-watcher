// 从环境变量获取后端端口，默认 7778
const backendPort = process.env.VITE_BACKEND_PORT || "7778";
const devPreviewHosts = Array.from({ length: 11 }, (_, index) => `${6020 + index}.huajiejun.cn:999`);

export const sharedViteConfig = {
  test: {
    environment: "jsdom",
  },
  server: {
    allowedHosts: ["ai.huajiejun.cn", ...devPreviewHosts],
    proxy: {
      // 代理 API 请求到后端服务，支持移动端通过 frp 访问
      "/api": {
        target: `http://localhost:${backendPort}`,
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

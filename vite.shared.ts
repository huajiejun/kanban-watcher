type SharedViteEnv = {
  VITE_BACKEND_PORT?: string;
  VITE_DEV_BASE_PATH?: string;
  VITE_DEV_ALLOWED_HOSTS?: string;
  VITE_DEV_HMR_HOST?: string;
  VITE_DEV_HMR_PROTOCOL?: "ws" | "wss";
  VITE_DEV_HMR_CLIENT_PORT?: string;
  VITE_DEV_HMR_PATH?: string;
};

function normalizeBasePath(basePath?: string) {
  if (!basePath || basePath === "/") {
    return "/";
  }

  return `/${basePath.replace(/^\/+|\/+$/g, "")}/`;
}

function readAllowedHosts(rawHosts?: string) {
  const hosts = (rawHosts || "ai.huajiejun.cn,dev.huajiejun.cn")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return hosts.length > 0 ? hosts : ["ai.huajiejun.cn", "dev.huajiejun.cn"];
}

export function createSharedViteConfig(env: SharedViteEnv = process.env) {
  const backendPort = env.VITE_BACKEND_PORT || "7778";
  const basePath = normalizeBasePath(env.VITE_DEV_BASE_PATH);
  const hmrClientPort = Number.parseInt(env.VITE_DEV_HMR_CLIENT_PORT || "", 10);

  return {
    base: basePath,
    test: {
      environment: "jsdom",
    },
    server: {
      allowedHosts: readAllowedHosts(env.VITE_DEV_ALLOWED_HOSTS),
      hmr: env.VITE_DEV_HMR_HOST
        ? {
            host: env.VITE_DEV_HMR_HOST,
            protocol: env.VITE_DEV_HMR_PROTOCOL || "wss",
            clientPort: Number.isFinite(hmrClientPort) ? hmrClientPort : undefined,
            path: env.VITE_DEV_HMR_PATH,
          }
        : undefined,
      proxy: {
        "/api": {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          ws: true,
        },
        "/llm-api": {
          target: "http://localhost:1234",
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/llm-api/, ""),
        },
      },
    },
  } as const;
}

export const sharedViteConfig = createSharedViteConfig();

import { describe, expect, it } from "vitest";
import {
  buildPreviewCardConfig,
  describePreviewMode,
  describePreviewRequestState,
  readPreviewApiOptions,
} from "../src/playground";
import { previewEntityId } from "../src/dev/preview-fixture";

describe("preview page config", () => {
  it("reads base_url, api_key and messages_limit from URL params", () => {
    const options = readPreviewApiOptions(
      new URL("http://localhost:5173/preview?base_url=https://watcher.huajiejun.cn&api_key=test-key&messages_limit=30&quick_button_forbidden_actions=%E9%83%A8%E7%BD%B2,%E5%90%88%E5%B9%B6%E4%BB%A3%E7%A0%81"),
    );

    expect(options).toEqual({
      baseUrl: "https://watcher.huajiejun.cn",
      apiKey: "test-key",
      messagesLimit: 30,
      quickButtonRules: {
        forbiddenActions: ["部署", "合并代码"],
      },
    });
  });

  it("uses env vars when URL params are empty", () => {
    const options = readPreviewApiOptions(
      new URL("http://localhost:5173/preview?base_url=&api_key=&messages_limit=0"),
    );

    // 当 URL 参数为空时，默认走相对路径代理，避免浏览器直连后端端口
    expect(options.baseUrl).toBe("");
    expect(options.apiKey).toBe(import.meta.env.VITE_API_KEY || "");
    expect(options.messagesLimit).toBeUndefined();
  });

  it("describes relative proxy mode when base_url is empty", () => {
    expect(
      describePreviewMode({
        baseUrl: "",
        messagesLimit: 30,
      }),
    ).toEqual({
      title: "当前预览：真实 API",
      detail: "预览页正在直连 （通过 Vite 代理），弹窗首次加载 30 条消息。",
    });
  });

  it("builds API card config when base_url is provided", () => {
    expect(
      buildPreviewCardConfig({
        baseUrl: "https://watcher.huajiejun.cn",
        apiKey: "test-key",
        messagesLimit: 30,
        quickButtonRules: {
          forbiddenActions: ["部署", "合并代码"],
        },
      }),
    ).toEqual({
      entity: previewEntityId,
      base_url: "https://watcher.huajiejun.cn",
      api_key: "test-key",
      messages_limit: 30,
      llm_enabled: true,
      llm_base_url: "/llm-api",
      quick_button_rules: {
        forbidden_actions: ["部署", "合并代码"],
      },
    });
  });

  it("builds fallback config with LLM enabled when base_url is missing", () => {
    expect(buildPreviewCardConfig({})).toEqual({
      entity: previewEntityId,
      llm_enabled: true,
      llm_base_url: "/llm-api",
      quick_button_rules: {
        forbidden_actions: expect.any(Array),
      },
    });
  });

  it("describes mock preview page mode when base_url is missing", () => {
    expect(describePreviewMode({})).toEqual({
      title: "当前预览：Mock 数据",
      detail: "使用本地预设 hass 数据，适合查看预览页 UI 和交互。",
    });
  });

  it("describes real API preview page mode when base_url is provided", () => {
    expect(
      describePreviewMode({
        baseUrl: "https://watcher.huajiejun.cn",
        messagesLimit: 30,
      }),
    ).toEqual({
      title: "当前预览：真实 API",
      detail: "预览页正在直连 https://watcher.huajiejun.cn，弹窗首次加载 30 条消息。",
    });
  });

  it("describes idle request state for mock mode", () => {
    expect(describePreviewRequestState(false)).toEqual({
      tone: "muted",
      title: "请求状态：未启用",
      detail: "当前使用本地 mock 数据，不会请求 kanban-watcher API。",
    });
  });

  it("describes success and error request states for API mode", () => {
    expect(describePreviewRequestState(true)).toEqual({
      tone: "success",
      title: "请求状态：正常",
      detail: "已经启用真实 API 模式，错误信息会显示在这里。",
    });

    expect(describePreviewRequestState(true, "首页实时已更新：20:41:16")).toEqual({
      tone: "success",
      title: "请求状态：正常",
      detail: "首页实时已更新：20:41:16",
    });

    expect(describePreviewRequestState(true, "加载工作区失败：401 Unauthorized")).toEqual({
      tone: "error",
      title: "请求状态：异常",
      detail: "加载工作区失败：401 Unauthorized",
    });
  });
});

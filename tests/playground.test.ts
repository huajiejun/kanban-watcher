import { describe, expect, it } from "vitest";
import {
  buildPreviewCardConfig,
  describePreviewMode,
  describePreviewRequestState,
  readPreviewApiOptions,
} from "../src/playground";
import { previewEntityId } from "../src/dev/preview-fixture";

describe("playground preview config", () => {
  it("reads base_url, api_key and messages_limit from URL params", () => {
    const options = readPreviewApiOptions(
      new URL("http://localhost:5173/?base_url=https://watcher.huajiejun.cn&api_key=test-key&messages_limit=30"),
    );

    expect(options).toEqual({
      baseUrl: "https://watcher.huajiejun.cn",
      apiKey: "test-key",
      messagesLimit: 30,
    });
  });

  it("ignores invalid or empty URL params", () => {
    const options = readPreviewApiOptions(
      new URL("http://localhost:5173/?base_url=&api_key=&messages_limit=0"),
    );

    expect(options).toEqual({
      baseUrl: "http://127.0.0.1:7778",
      apiKey: "",
      messagesLimit: undefined,
    });
  });

  it("builds API card config when base_url is provided", () => {
    expect(
      buildPreviewCardConfig({
        baseUrl: "https://watcher.huajiejun.cn",
        apiKey: "test-key",
        messagesLimit: 30,
      }),
    ).toEqual({
      entity: previewEntityId,
      base_url: "https://watcher.huajiejun.cn",
      api_key: "test-key",
      messages_limit: 30,
      llm_enabled: true,
      llm_base_url: "/llm-api",
    });
  });

  it("builds fallback config with LLM enabled when base_url is missing", () => {
    expect(buildPreviewCardConfig({})).toEqual({
      entity: previewEntityId,
      llm_enabled: true,
      llm_base_url: "/llm-api",
    });
  });

  it("describes mock preview mode when base_url is missing", () => {
    expect(describePreviewMode({})).toEqual({
      title: "当前模式：Mock 数据",
      detail: "使用本地预设 hass 数据，适合看 UI 和交互。",
    });
  });

  it("describes real API preview mode when base_url is provided", () => {
    expect(
      describePreviewMode({
        baseUrl: "https://watcher.huajiejun.cn",
        messagesLimit: 30,
      }),
    ).toEqual({
      title: "当前模式：真实 API",
      detail: "正在直连 https://watcher.huajiejun.cn，弹窗首次加载 30 条消息。",
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeButtonsWithLLM,
  getQuickButtonsWithLLM,
  type LLMButtonsResponse,
  type QuickButtonsResult,
} from "../src/lib/quick-buttons";

// Mock fetch for LLM API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("quick-buttons-llm", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("analyzeButtonsWithLLM", () => {
    it("returns empty result when LLM API is not available", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await analyzeButtonsWithLLM("请选择方案1或方案2");
      expect(result).toEqual<LLMButtonsResponse>({ extracted: [], suggested: [] });
    });

    it("calls LM Studio API with correct format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"extracted": ["方案1", "方案2"], "suggested": []}',
              },
            },
          ],
        }),
      });

      const result = await analyzeButtonsWithLLM(
        "请选择方案1或方案2",
        "http://localhost:1234"
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:1234/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );

      expect(result.extracted).toEqual(["方案1", "方案2"]);
    });

    it("returns empty result when LLM returns invalid JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "invalid json",
              },
            },
          ],
        }),
      });

      const result = await analyzeButtonsWithLLM("普通消息");
      expect(result).toEqual<LLMButtonsResponse>({ extracted: [], suggested: [] });
    });

    it("returns empty result when LLM returns empty object", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "{}",
              },
            },
          ],
        }),
      });

      const result = await analyzeButtonsWithLLM("这是注意事项，无需操作");
      expect(result).toEqual<LLMButtonsResponse>({ extracted: [], suggested: [] });
    });

    it("extracts options and suggestions from choice messages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"extracted": ["方案1", "方案2"], "suggested": ["选择方案1", "选择方案2"]}',
              },
            },
          ],
        }),
      });

      const result = await analyzeButtonsWithLLM(
        "发现两种实现方案，请选择：方案1是快速实现，方案2是完整实现"
      );
      expect(result.extracted).toContain("方案1");
      expect(result.extracted).toContain("方案2");
      expect(result.suggested).toContain("选择方案1");
      expect(result.suggested).toContain("选择方案2");
    });

    it("returns suggested actions for completion messages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"extracted": [], "suggested": ["运行测试", "提交代码"]}',
              },
            },
          ],
        }),
      });

      const result = await analyzeButtonsWithLLM("代码修改已完成，测试通过");
      expect(result.extracted).toEqual([]);
      expect(result.suggested).toContain("运行测试");
      expect(result.suggested).toContain("提交代码");
    });
  });

  describe("getQuickButtonsWithLLM", () => {
    it("returns only static buttons when workspace is running", async () => {
      const result = await getQuickButtonsWithLLM({
        message: "请选择方案1或方案2",
        workspaceStatus: "running",
        llmEnabled: true,
        llmConfig: {
          baseUrl: "http://localhost:1234",
        },
      });

      // 运行中应该只返回静态按钮（但运行时会隐藏所有按钮）
      expect(result.staticButtons).toEqual(["继续", "同意"]);
      expect(result.extractedButtons).toEqual([]);
      expect(result.suggestedButtons).toEqual([]);
    });

    it("returns static and dynamic buttons when workspace is in attention status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"extracted": ["方案1", "方案2"], "suggested": ["选择方案1"]}',
              },
            },
          ],
        }),
      });

      const result = await getQuickButtonsWithLLM({
        message: "请选择方案1或方案2",
        workspaceStatus: "attention",
        llmEnabled: true,
        llmConfig: {
          baseUrl: "http://localhost:1234",
        },
      });

      expect(result.staticButtons).toEqual(["继续", "同意"]);
      expect(result.extractedButtons).toEqual(["方案1", "方案2"]);
      expect(result.suggestedButtons).toEqual(["选择方案1"]);
    });

    it("falls back to regex when LLM is disabled", async () => {
      const result = await getQuickButtonsWithLLM({
        message: "请选择方案1或方案2",
        workspaceStatus: "attention",
        llmEnabled: false,
        llmConfig: undefined,
      });

      // 应该使用正则匹配
      expect(result.extractedButtons).toContain("方案1");
      expect(result.extractedButtons).toContain("方案2");
      expect(result.suggestedButtons).toEqual([]);
    });

    it("falls back to regex when LLM returns empty extracted", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"extracted": [], "suggested": []}',
              },
            },
          ],
        }),
      });

      const result = await getQuickButtonsWithLLM({
        message: "请选择方案1或方案2",
        workspaceStatus: "attention",
        llmEnabled: true,
        llmConfig: {
          baseUrl: "http://localhost:1234",
        },
      });

      // LLM 返回空提取时，应该回退到正则
      expect(result.extractedButtons).toContain("方案1");
      expect(result.extractedButtons).toContain("方案2");
    });

    it("returns suggested buttons even when extracted is empty", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"extracted": [], "suggested": ["运行测试", "提交代码"]}',
              },
            },
          ],
        }),
      });

      const result = await getQuickButtonsWithLLM({
        message: "代码修改已完成",
        workspaceStatus: "attention",
        llmEnabled: true,
        llmConfig: {
          baseUrl: "http://localhost:1234",
        },
      });

      expect(result.extractedButtons).toEqual([]);
      expect(result.suggestedButtons).toEqual(["运行测试", "提交代码"]);
      expect(result.dynamicButtons).toContain("运行测试");
      expect(result.dynamicButtons).toContain("提交代码");
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeButtonsWithLLM,
  getQuickButtonsWithLLM,
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
    it("returns empty array when LLM API is not available", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await analyzeButtonsWithLLM("请选择方案1或方案2");
      expect(result).toEqual([]);
    });

    it("calls LM Studio API with correct format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '["方案1", "方案2"]',
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

      expect(result).toEqual(["方案1", "方案2"]);
    });

    it("returns empty array when LLM returns invalid JSON", async () => {
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
      expect(result).toEqual([]);
    });

    it("returns empty array when LLM returns empty array", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "[]",
              },
            },
          ],
        }),
      });

      const result = await analyzeButtonsWithLLM("这是注意事项，无需操作");
      expect(result).toEqual([]);
    });

    it("limits buttons to 5 items", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '["A", "B", "C", "D", "E", "F", "G"]',
              },
            },
          ],
        }),
      });

      const result = await analyzeButtonsWithLLM("选择 A-G");
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it("returns empty array for notice messages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "[]",
              },
            },
          ],
        }),
      });

      const result = await analyzeButtonsWithLLM(
        "注意事项：请确保数据库已备份"
      );
      expect(result).toEqual([]);
    });

    it("extracts action buttons from choice messages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '["使用方案1", "使用方案2", "取消操作"]',
              },
            },
          ],
        }),
      });

      const result = await analyzeButtonsWithLLM(
        "发现两种实现方案，请选择：方案1是快速实现，方案2是完整实现"
      );
      expect(result).toContain("使用方案1");
      expect(result).toContain("使用方案2");
      expect(result).toContain("取消操作");
    });
  });

  describe("getQuickButtonsWithLLM", () => {
    it("returns only static buttons when workspace is running", async () => {
      const result = await getQuickButtonsWithLLM({
        message: "请选择方案1或方案2",
        workspaceStatus: "running",
        llmEnabled: true,
        llmBaseUrl: "http://localhost:1234",
      });

      // 运行中应该只返回静态按钮（但运行时会隐藏所有按钮）
      expect(result.staticButtons).toEqual(["继续", "同意"]);
      expect(result.dynamicButtons).toEqual([]);
    });

    it("returns static and dynamic buttons when workspace is in attention status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '["方案1", "方案2"]',
              },
            },
          ],
        }),
      });

      const result = await getQuickButtonsWithLLM({
        message: "请选择方案1或方案2",
        workspaceStatus: "attention",
        llmEnabled: true,
        llmBaseUrl: "http://localhost:1234",
      });

      expect(result.staticButtons).toEqual(["继续", "同意"]);
      expect(result.dynamicButtons).toEqual(["方案1", "方案2"]);
    });

    it("falls back to regex when LLM is disabled", async () => {
      const result = await getQuickButtonsWithLLM({
        message: "请选择方案1或方案2",
        workspaceStatus: "attention",
        llmEnabled: false,
        llmBaseUrl: undefined,
      });

      // 应该使用正则匹配
      expect(result.dynamicButtons).toContain("方案1");
      expect(result.dynamicButtons).toContain("方案2");
    });

    it("falls back to regex when LLM returns empty", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "[]",
              },
            },
          ],
        }),
      });

      const result = await getQuickButtonsWithLLM({
        message: "请选择方案1或方案2",
        workspaceStatus: "attention",
        llmEnabled: true,
        llmBaseUrl: "http://localhost:1234",
      });

      // LLM 返回空时，应该回退到正则
      expect(result.dynamicButtons).toContain("方案1");
      expect(result.dynamicButtons).toContain("方案2");
    });

    it("returns empty dynamic buttons for notice messages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "[]",
              },
            },
          ],
        }),
      });

      const result = await getQuickButtonsWithLLM({
        message: "注意事项：请确保数据库已备份",
        workspaceStatus: "attention",
        llmEnabled: true,
        llmBaseUrl: "http://localhost:1234",
      });

      // 注意事项不应该有动态按钮
      expect(result.dynamicButtons).toEqual([]);
    });
  });
});

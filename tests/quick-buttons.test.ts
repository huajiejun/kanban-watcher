import { describe, expect, it } from "vitest";
import {
  extractDynamicButtons,
  isValidButtonText,
  STATIC_BUTTONS,
  detectMessageType,
} from "../src/lib/quick-buttons";

describe("quick-buttons", () => {
  describe("STATIC_BUTTONS", () => {
    it("contains default static buttons", () => {
      expect(STATIC_BUTTONS).toContain("继续");
      expect(STATIC_BUTTONS).toContain("同意");
    });
  });

  describe("extractDynamicButtons", () => {
    it("returns empty array for empty or invalid input", () => {
      expect(extractDynamicButtons("")).toEqual([]);
      expect(extractDynamicButtons("   ")).toEqual([]);
      // @ts-expect-error Testing invalid input
      expect(extractDynamicButtons(null)).toEqual([]);
      // @ts-expect-error Testing invalid input
      expect(extractDynamicButtons(undefined)).toEqual([]);
    });

    it("returns empty array when no options are found", () => {
      expect(extractDynamicButtons("这是一条普通消息，没有任何选项")).toEqual([]);
      expect(extractDynamicButtons("Hello world, no options here")).toEqual([]);
    });

    it("extracts Chinese number schemes (方案一, 方案二)", () => {
      const result = extractDynamicButtons("请选择方案一或方案二");
      expect(result).toContain("方案1");
      expect(result).toContain("方案2");
    });

    it("extracts Arabic number schemes (方案1, 方案2)", () => {
      const result = extractDynamicButtons("请选择方案1或方案2");
      expect(result).toContain("方案1");
      expect(result).toContain("方案2");
    });

    it("extracts Chinese number options (选项一, 选项二)", () => {
      const result = extractDynamicButtons("选项一是X，选项二是Y");
      expect(result).toContain("选项1");
      expect(result).toContain("选项2");
    });

    it("extracts letter options (选项A, 选项B)", () => {
      const result = extractDynamicButtons("选项A是X，选项B是Y");
      expect(result).toContain("选项A");
      expect(result).toContain("选项B");
    });

    it("extracts English options (Option A, Option B)", () => {
      const result = extractDynamicButtons("Choose Option A or Option B");
      expect(result).toContain("Option A");
      expect(result).toContain("Option B");
    });

    it("extracts numbered list items (1., 2., 3.)", () => {
      const result = extractDynamicButtons("1. 方案A\n2. 方案B\n3. 方案C");
      expect(result).toContain("方案A");
      expect(result).toContain("方案B");
      expect(result).toContain("方案C");
    });

    it("extracts parenthesized letters ((A), (B))", () => {
      const result = extractDynamicButtons("你可以选择(A)或(B)");
      expect(result).toContain("(A)");
      expect(result).toContain("(B)");
    });

    it("extracts bullet list actions as buttons", () => {
      const result = extractDynamicButtons("- 补充测试\n- 检查边界条件\n- 整理说明");
      expect(result).toContain("补充测试");
      expect(result).toContain("检查边界条件");
      expect(result).toContain("整理说明");
    });

    it("normalizes lowercase letters to uppercase", () => {
      const result = extractDynamicButtons("选项a和选项b");
      expect(result).toContain("选项A");
      expect(result).toContain("选项B");
    });

    it("removes duplicate options", () => {
      const result = extractDynamicButtons("方案1，方案1，方案2");
      expect(result.filter((b) => b === "方案1")).toHaveLength(1);
      expect(result.filter((b) => b === "方案2")).toHaveLength(1);
    });

    it("limits to maximum 5 dynamic buttons", () => {
      const result = extractDynamicButtons(
        "1. A\n2. B\n3. C\n4. D\n5. E\n6. F\n7. G"
      );
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it("extracts multiple types of options from complex message", () => {
      const result = extractDynamicButtons(
        "请选择方案一或方案2，或者选项A、选项B"
      );
      expect(result).toContain("方案1");
      expect(result).toContain("方案2");
      expect(result).toContain("选项A");
      expect(result).toContain("选项B");
    });
  });

  describe("isValidButtonText", () => {
    it("returns true for valid button text", () => {
      expect(isValidButtonText("继续")).toBe(true);
      expect(isValidButtonText("方案1")).toBe(true);
      expect(isValidButtonText("选项A")).toBe(true);
    });

    it("returns false for empty or whitespace-only text", () => {
      expect(isValidButtonText("")).toBe(false);
      expect(isValidButtonText("   ")).toBe(false);
      // @ts-expect-error Testing invalid input
      expect(isValidButtonText(null)).toBe(false);
      // @ts-expect-error Testing invalid input
      expect(isValidButtonText(undefined)).toBe(false);
    });

    it("returns false for text longer than 20 characters", () => {
      expect(isValidButtonText("这是一个非常长的按钮文本超过了二十个字符的限制")).toBe(false);
    });
  });

  describe("detectMessageType", () => {
    it('returns "proposal" when message contains proposal keywords', () => {
      expect(detectMessageType('请选择方案1或方案2')).toBe('proposal');
      expect(detectMessageType('这是我的建议')).toBe('proposal');
      expect(detectMessageType('推荐使用这个选项')).toBe('proposal');
      expect(detectMessageType('对比两种实现方式')).toBe('proposal');
      expect(detectMessageType('分析优缺点')).toBe('proposal');
    });

    it('returns "decision" when message has no proposal keywords', () => {
      expect(detectMessageType('代码修改已完成')).toBe('decision');
      expect(detectMessageType('发现3个错误需要修复')).toBe('decision');
      expect(detectMessageType('测试通过')).toBe('decision');
    });

    it('returns "decision" for empty or invalid input', () => {
      expect(detectMessageType('')).toBe('decision');
      expect(detectMessageType('   ')).toBe('decision');
    });
  });
});

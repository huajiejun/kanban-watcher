/** 通用快捷词（始终显示） */
export const STATIC_BUTTONS = ["继续", "同意"] as const;

/** 中文数字到阿拉伯数字的映射 */
const CHINESE_NUMBER_MAP: Record<string, string> = {
  一: "1",
  二: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
  十: "10",
};

/** 最大动态按钮数量 */
const MAX_DYNAMIC_BUTTONS = 5;

/**
 * 标准化按钮文本
 * @param fullMatch 完整匹配文本
 * @param captured 捕获组内容
 * @returns 标准化后的按钮文本
 */
function normalizeButtonText(fullMatch: string, captured: string): string {
  // 中文数字转阿拉伯数字
  if (CHINESE_NUMBER_MAP[captured]) {
    return fullMatch.replace(captured, CHINESE_NUMBER_MAP[captured]);
  }

  // 字母统一大写
  if (/^[A-Za-z]$/.test(captured)) {
    return fullMatch.replace(captured, captured.toUpperCase());
  }

  // 其他情况保持原样
  return fullMatch.trim();
}

/**
 * 从文本中提取动态按钮
 * @param text AI 消息文本
 * @returns 动态按钮列表（已去重，最多5个）
 */
export function extractDynamicButtons(text: string): string[] {
  if (!text || typeof text !== "string" || !text.trim()) {
    return [];
  }

  const matches = new Set<string>();

  // 中文数字方案: 方案一、方案二
  const schemeChinesePattern = /方案([一二三四五六七八九十]+)/g;
  let match: RegExpExecArray | null;
  while ((match = schemeChinesePattern.exec(text)) !== null) {
    const normalized = normalizeButtonText(match[0], match[1]);
    matches.add(normalized);
  }

  // 阿拉伯数字方案: 方案1、方案 2
  const schemeArabicPattern = /方案\s*([1-9])/g;
  while ((match = schemeArabicPattern.exec(text)) !== null) {
    matches.add(match[0].replace(/\s+/g, ""));
  }

  // 中文数字选项: 选项一、选项二
  const optionChinesePattern = /选项([一二三四五六七八九十]+)/g;
  while ((match = optionChinesePattern.exec(text)) !== null) {
    const normalized = normalizeButtonText(match[0], match[1]);
    matches.add(normalized);
  }

  // 字母选项: 选项A、选项 B
  const optionLetterPattern = /选项\s*([A-Za-z])/g;
  while ((match = optionLetterPattern.exec(text)) !== null) {
    const normalized = normalizeButtonText(match[0], match[1]);
    matches.add(normalized);
  }

  // 英文选项: Option A、Option B（必须有空格）
  const englishOptionPattern = /Option\s+([A-Za-z])/gi;
  while ((match = englishOptionPattern.exec(text)) !== null) {
    const normalized = normalizeButtonText(match[0], match[1]);
    matches.add(normalized);
  }

  // 序号列表: 1.、2.、3.（行首）
  const listPattern = /^\s*([1-9])\./gm;
  while ((match = listPattern.exec(text)) !== null) {
    matches.add(`${match[1]}.`);
  }

  // 括号字母: (A)、(B)、(C)
  const parenPattern = /\(([A-Za-z])\)/g;
  while ((match = parenPattern.exec(text)) !== null) {
    const normalized = normalizeButtonText(match[0], match[1]);
    matches.add(normalized);
  }

  // 转为数组，限制数量
  return Array.from(matches).slice(0, MAX_DYNAMIC_BUTTONS);
}

/**
 * 检查按钮文本是否为有效选项
 * @param text 按钮文本
 * @returns 是否有效
 */
export function isValidButtonText(text: string): boolean {
  if (typeof text !== "string") {
    return false;
  }
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 20;
}

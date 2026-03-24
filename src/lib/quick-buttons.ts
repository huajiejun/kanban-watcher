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

/** LLM 分析配置 */
interface LLMConfig {
  baseUrl?: string;
  model?: string;
  timeout?: number;
}

/** 快捷按钮分析请求参数 */
interface QuickButtonsRequest {
  message: string;
  workspaceStatus: "running" | "attention" | "idle" | "completed";
  llmEnabled?: boolean;
  llmConfig?: LLMConfig;
}

/** LLM 分析结果 */
interface LLMAnalysisResult {
  buttons: string[];
  needsAction: boolean;
}

/**
 * 使用 LLM 分析消息，提取快捷按钮
 * @param message AI 消息文本
 * @param llmBaseUrl LLM API 基础 URL（默认 http://localhost:1234）
 * @param llmModel LLM 模型名称（默认 local-model）
 * @returns 快捷按钮列表
 */
export async function analyzeButtonsWithLLM(
  message: string,
  llmBaseUrl?: string,
  llmModel?: string
): Promise<string[]> {
  if (!message || typeof message !== "string" || !message.trim()) {
    return [];
  }

  const baseUrl = llmBaseUrl || "http://localhost:1234";
  const model = llmModel || "local-model";
  const url = `${baseUrl}/v1/chat/completions`;

  const systemPrompt = `你是一个快捷按钮分析助手。分析用户的 AI 助手消息，判断是否需要用户进行选择操作。

任务：
1. 判断消息是否包含需要用户选择的方案/选项
2. 如果是"注意事项"、"说明"、"已完成"等无需用户操作的内容，返回空数组
3. 如果需要用户选择，提取具体的选项名称（最多5个）

返回格式要求：
- 必须返回严格的 JSON 数组格式
- 每个选项不超过10个字符
- 如果无需操作，返回空数组 []

示例：
- "请选择方案1或方案2" → ["方案1", "方案2"]
- "选项A是快速实现，选项B是完整实现" → ["选项A", "选项B"]
- "注意事项：请确保数据库已备份" → []
- "任务已完成" → []`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return [];
    }

    // 尝试解析 JSON
    try {
      // 提取 JSON 数组
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        return [];
      }

      // 过滤和限制
      const buttons = parsed
        .filter((item): item is string => typeof item === "string")
        .map((item: string) => item.trim())
        .filter((item: string) => isValidButtonText(item))
        .slice(0, MAX_DYNAMIC_BUTTONS);

      return buttons;
    } catch {
      return [];
    }
  } catch {
    return [];
  }
}

/** 快捷按钮结果 */
export interface QuickButtonsResult {
  staticButtons: string[];
  dynamicButtons: string[];
}

/**
 * 获取快捷按钮（结合静态按钮和 LLM 分析）
 * @param request 请求参数
 * @returns 快捷按钮结果（静态 + 动态）
 */
export async function getQuickButtonsWithLLM(
  request: QuickButtonsRequest
): Promise<QuickButtonsResult> {
  const { message, workspaceStatus, llmEnabled, llmConfig } = request;

  // 运行中只返回静态按钮（隐藏所有动态按钮）
  if (workspaceStatus === "running") {
    return {
      staticButtons: [...STATIC_BUTTONS],
      dynamicButtons: [],
    };
  }

  // idle / completed / attention 状态都显示动态按钮
  // LLM 未启用，使用正则匹配
  if (!llmEnabled) {
    const dynamicButtons = extractDynamicButtons(message);
    return {
      staticButtons: [...STATIC_BUTTONS],
      dynamicButtons: dynamicButtons.filter(isValidButtonText),
    };
  }

  // 使用 LLM 分析
  const dynamicButtons = await analyzeButtonsWithLLM(
    message,
    llmConfig?.baseUrl,
    llmConfig?.model
  );

  // LLM 返回空，回退到正则
  if (dynamicButtons.length === 0) {
    const regexButtons = extractDynamicButtons(message);
    return {
      staticButtons: [...STATIC_BUTTONS],
      dynamicButtons: regexButtons.filter(isValidButtonText),
    };
  }

  return {
    staticButtons: [...STATIC_BUTTONS],
    dynamicButtons: dynamicButtons.filter(isValidButtonText),
  };
}

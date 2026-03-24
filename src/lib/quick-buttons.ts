import type {
  MessageType,
  ButtonWithReason,
  ProposalButtonsResponse,
  DecisionButtonsResponse,
  LLMButtonsResponse,
  SessionMessageResponse
} from '../types';

/** 通用快捷词（始终显示） */
export const STATIC_BUTTONS = ["继续", "同意"] as const;

/** 方案类消息关键词 */
const PROPOSAL_KEYWORDS = [
  '方案', '选择', '建议', '推荐', '选项', '计划',
  '决定', '评估', '对比', '优缺点', '利弊'
];

/**
 * 检测消息类型
 * @param message 消息文本
 * @returns 消息类型（proposal/decision）
 */
export function detectMessageType(message: string): 'proposal' | 'decision' {
  if (!message || typeof message !== 'string') {
    return 'decision';
  }
  const hasProposalKeyword = PROPOSAL_KEYWORDS.some(
    keyword => message.includes(keyword)
  );
  return hasProposalKeyword ? 'proposal' : 'decision';
}

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
  recentMessages?: SessionMessageResponse[];
}

/** 构建 LLM 分析的上下文消息
 * 如果最后一条消息少于100字符，则取最近5条 assistant_message 作为上下文
 */
function buildAnalysisContext(
  lastMessage: string,
  recentMessages?: SessionMessageResponse[]
): string {
  // 如果消息足够长，直接使用
  if (lastMessage.length >= 100) {
    return lastMessage;
  }

  // 如果提供了历史消息，提取最近5条 assistant_message
  if (recentMessages && recentMessages.length > 0) {
    const assistantMessages = recentMessages
      .filter((msg) => msg.role === "assistant" || msg.role === "ai")
      .slice(-5);

    if (assistantMessages.length > 0) {
      const context = assistantMessages
        .map((msg) => msg.content || "")
        .filter((content) => content.length > 0)
        .join("\n\n---\n\n");

      if (context.length > 0) {
        return context;
      }
    }
  }

  // 回退到单条消息
  return lastMessage;
}

/** LLM 分析结果 */
interface LLMAnalysisResult {
  buttons: string[];
  needsAction: boolean;
}

/** 方案评价师 Prompt（方案类消息） */
const PROPOSAL_EVALUATOR_PROMPT = `你是优秀的方案评价师。根据给出的方案给出你的选择和理由（可以推荐多个）。

任务：
1. 从消息中提取已有的选项（如果有）
2. 基于方案内容，给出1-3个推荐操作，每个推荐需包含理由

输出 JSON 格式：
{
  "extracted": ["选项1", "选项2"],
  "suggested": [
    {"button": "推荐操作1", "reason": "选择理由"},
    {"button": "推荐操作2", "reason": "选择理由"}
  ]
}

示例：
消息："请选择方案1或方案2，方案1是快速实现，方案2是完整实现"
返回：{"extracted": ["方案1", "方案2"], "suggested": [{"button": "选择方案1", "reason": "快速实现，适合紧急需求"}]}`;

/** 任务决策者 Prompt（非方案类消息） */
const DECISION_MAKER_PROMPT = `你是优秀的任务决策者。根据当前项目情况，给出接下来1-3个紧急要做的事情。

任务：
- 分析消息上下文，判断当前状态
- 给出1-3个决策指令，每个指令需包含理由

输出 JSON 格式：
{
  "actions": [
    {"button": "决策指令1", "reason": "理由"},
    {"button": "决策指令2", "reason": "理由"}
  ]
}

示例：
消息："代码修改已完成，测试通过"
返回：{"actions": [{"button": "继续", "reason": "任务已完成，可继续下一步"}, {"button": "查看改动", "reason": "确认修改内容"}]}`;

/**
 * 使用 LLM 分析消息，根据消息类型返回对应的按钮建议
 * @param message AI 消息文本
 * @param llmBaseUrl LLM API 基础 URL（默认 http://localhost:1234）
 * @param llmModel LLM 模型名称（默认 local-model）
 * @returns 按钮分析结果
 */
export async function analyzeButtonsWithLLM(
  message: string,
  llmBaseUrl?: string,
  llmModel?: string
): Promise<LLMButtonsResponse> {
  const defaultDecisionResult: DecisionButtonsResponse = {
    type: 'decision',
    actions: []
  };

  if (!message || typeof message !== "string" || !message.trim()) {
    return defaultDecisionResult;
  }

  // 1. 检测消息类型
  const messageType = detectMessageType(message);

  // 2. 选择对应的 prompt
  const systemPrompt = messageType === 'proposal'
    ? PROPOSAL_EVALUATOR_PROMPT
    : DECISION_MAKER_PROMPT;

  const baseUrl = llmBaseUrl || "http://localhost:1234";
  const model = llmModel || "local-model";
  const url = `${baseUrl}/v1/chat/completions`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return defaultDecisionResult;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return defaultDecisionResult;
    }

    // 尝试解析 JSON
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return defaultDecisionResult;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed !== "object" || parsed === null) {
        return defaultDecisionResult;
      }

      // 根据消息类型返回不同格式
      if (messageType === 'proposal') {
        const extracted: string[] = Array.isArray(parsed.extracted)
          ? (parsed.extracted as unknown[])
              .filter((item: unknown): item is string => typeof item === "string")
              .map((item: string) => item.trim())
              .filter((item: string) => isValidButtonText(item))
              .slice(0, 3)
          : [];

        const suggested: ButtonWithReason[] = Array.isArray(parsed.suggested)
          ? (parsed.suggested as unknown[])
              .filter((item: unknown): item is Record<string, unknown> =>
                typeof item === "object" && item !== null
              )
              .map((item: Record<string, unknown>) => ({
                button: String(item.button || "").trim().slice(0, 20),
                reason: String(item.reason || "").trim().slice(0, 50)
              }))
              .filter((item: ButtonWithReason) => isValidButtonText(item.button))
              .slice(0, 3)
          : [];

        return {
          type: 'proposal',
          extracted,
          suggested
        };
      } else {
        const actions: ButtonWithReason[] = Array.isArray(parsed.actions)
          ? (parsed.actions as unknown[])
              .filter((item: unknown): item is Record<string, unknown> =>
                typeof item === "object" && item !== null
              )
              .map((item: Record<string, unknown>) => ({
                button: String(item.button || "").trim().slice(0, 20),
                reason: String(item.reason || "").trim().slice(0, 50)
              }))
              .filter((item: ButtonWithReason) => isValidButtonText(item.button))
              .slice(0, 3)
          : [];

        return {
          type: 'decision',
          actions
        };
      }
    } catch {
      return defaultDecisionResult;
    }
  } catch {
    return defaultDecisionResult;
  }
}

/** 快捷按钮结果 */
export interface QuickButtonsResult {
  /** 消息类型 */
  type: MessageType;
  /** 静态按钮（继续、同意） */
  staticButtons: string[];
  /** 从消息中提取的选项 */
  extractedButtons: string[];
  /** LLM 语义联想推荐的操作（带理由） */
  suggestedButtons: ButtonWithReason[];
  /** @deprecated 使用 extractedButtons 代替 */
  dynamicButtons: string[];
}

/**
 * 获取快捷按钮（结合静态按钮和 LLM 分析）
 * @param request 请求参数
 * @returns 快捷按钮结果（静态 + 提取 + 推荐）
 */
export async function getQuickButtonsWithLLM(
  request: QuickButtonsRequest
): Promise<QuickButtonsResult> {
  const { message, workspaceStatus, llmEnabled, llmConfig, recentMessages } = request;

  // 构建分析上下文（短消息时使用历史记录）
  const analysisContext = buildAnalysisContext(message, recentMessages);

  // 运行中只返回静态按钮（隐藏所有动态按钮）
  if (workspaceStatus === "running") {
    return {
      type: 'decision',
      staticButtons: [...STATIC_BUTTONS],
      extractedButtons: [],
      suggestedButtons: [],
      dynamicButtons: [],
    };
  }

  // idle / completed / attention 状态都显示动态按钮
  // LLM 未启用，使用正则匹配（仍使用原始消息提取按钮）
  if (!llmEnabled) {
    const extractedButtons = extractDynamicButtons(message);
    return {
      type: 'decision',
      staticButtons: [...STATIC_BUTTONS],
      extractedButtons: extractedButtons.filter(isValidButtonText),
      suggestedButtons: [],
      dynamicButtons: extractedButtons.filter(isValidButtonText),
    };
  }

  // 使用 LLM 分析（使用构建的上下文）
  const llmResult = await analyzeButtonsWithLLM(
    analysisContext,
    llmConfig?.baseUrl,
    llmConfig?.model
  );

  // 检查 LLM 是否返回有效结果（如果失败或返回空，回退到正则模式）
  const isLLMFailed =
    (llmResult.type === 'proposal' && llmResult.suggested.length === 0) ||
    (llmResult.type === 'decision' && llmResult.actions.length === 0);

  if (isLLMFailed) {
    // LLM 失败或返回空，回退到正则提取模式（不显示推荐按钮）
    const extractedButtons = extractDynamicButtons(message);
    return {
      type: 'decision',
      staticButtons: [...STATIC_BUTTONS],
      extractedButtons: extractedButtons.filter(isValidButtonText),
      suggestedButtons: [],
      dynamicButtons: extractedButtons.filter(isValidButtonText),
    };
  }

  // 根据类型处理结果
  if (llmResult.type === 'proposal') {
    // LLM 返回空提取，回退到正则
    const extractedButtons =
      llmResult.extracted.length > 0
        ? llmResult.extracted
        : extractDynamicButtons(message);

    return {
      type: 'proposal',
      staticButtons: [...STATIC_BUTTONS],
      extractedButtons: extractedButtons.filter(isValidButtonText),
      suggestedButtons: llmResult.suggested,
      dynamicButtons: [
        ...extractedButtons,
        ...llmResult.suggested.map(s => s.button)
      ].filter(isValidButtonText),
    };
  } else {
    // decision 类型
    return {
      type: 'decision',
      staticButtons: [...STATIC_BUTTONS],
      extractedButtons: [],
      suggestedButtons: llmResult.actions,
      dynamicButtons: llmResult.actions.map(a => a.button).filter(isValidButtonText),
    };
  }
}

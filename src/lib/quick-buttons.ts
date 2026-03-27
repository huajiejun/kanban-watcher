import type {
  MessageType,
  ButtonWithReason,
  ProposalButtonsResponse,
  DecisionButtonsResponse,
  LLMButtonsResponse,
  SessionMessageResponse,
  QuickButtonRules
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

export const DEFAULT_QUICK_BUTTON_RULES: Required<QuickButtonRules> = {
  forbiddenActions: ["部署", "上线", "发版", "发布", "合并代码", "提交代码", "推送代码", "创建PR", "合并PR"],
};

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
  const addCandidate = (value: string) => {
    const cleaned = sanitizeButtonCandidate(value);
    if (isValidButtonText(cleaned)) {
      matches.add(cleaned);
    }
  };

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

  // 编号列表: 1. 补充测试 / 1、方案A
  const listPattern = /^\s*(?:[1-9]\d*|[一二三四五六七八九十]+)[.)。、]\s*(.+)$/gm;
  while ((match = listPattern.exec(text)) !== null) {
    addCandidate(match[1]);
  }

  // 项目符号列表: - 补充测试 / * 检查边界
  const bulletListPattern = /^\s*[-*•]\s*(.+)$/gm;
  while ((match = bulletListPattern.exec(text)) !== null) {
    addCandidate(match[1]);
  }

  // 括号字母: (A)、(B)、(C)
  const parenPattern = /\(([A-Za-z])\)/g;
  while ((match = parenPattern.exec(text)) !== null) {
    const normalized = normalizeButtonText(match[0], match[1]);
    matches.add(normalized);
  }

  // 自然语言动作拆分: 可以继续：补充测试；检查边界；整理说明
  const inlineActionPattern = /(?:可以|可继续|接下来可以|下一步可以)[：:]\s*([^\n]+)/g;
  while ((match = inlineActionPattern.exec(text)) !== null) {
    splitInlineActionCandidates(match[1]).forEach(addCandidate);
  }

  // 转为数组，限制数量
  return Array.from(matches).slice(0, MAX_DYNAMIC_BUTTONS);
}

function sanitizeButtonCandidate(value: string): string {
  return value
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[。；;，,、]+$/g, "")
    .trim();
}

function splitInlineActionCandidates(value: string): string[] {
  return value
    .split(/\s*[；;、/／]\s*/g)
    .map((item) => sanitizeButtonCandidate(item))
    .filter((item) => item.length > 0);
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
  quickButtonRules?: QuickButtonRules;
  recentMessages?: SessionMessageResponse[];
}

/** 构建 LLM 分析的上下文消息
 * 统一取最后3条消息，并显式标记顺序与角色。
 */
function buildAnalysisContext(
  lastMessage: string,
  recentMessages?: SessionMessageResponse[]
): string {
  if (recentMessages && recentMessages.length > 0) {
    const orderedMessages = recentMessages
      .filter((msg) => typeof msg.content === "string" && msg.content.trim().length > 0)
      .slice(-3);

    if (orderedMessages.length > 0) {
      const context = orderedMessages
        .map((msg, index) => {
          const role = msg.role === "assistant" || msg.role === "ai" ? "AI" : "用户";
          return `第${index + 1}条（${role}）：${msg.content?.trim()}`;
        })
        .join("\n");

      if (context.length > 0) {
        return context;
      }
    }
  }

  return `第1条（AI）：${lastMessage}`;
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

function normalizeQuickButtonRules(rules?: QuickButtonRules): Required<QuickButtonRules> {
  const forbiddenActions = rules?.forbiddenActions
    ?.map((item) => item.trim())
    .filter((item) => item.length > 0);

  return {
    forbiddenActions: forbiddenActions && forbiddenActions.length > 0
      ? Array.from(new Set(forbiddenActions))
      : DEFAULT_QUICK_BUTTON_RULES.forbiddenActions,
  };
}

function buildDecisionMakerPrompt(rules: Required<QuickButtonRules>) {
  const forbiddenText = rules.forbiddenActions.join("、");
  return `你是 AI AGENT 下一步动作建议器。请根据当前上下文，分析 AI AGENT 后续可以做什么，并只输出 1-3 个 AI AGENT 当前可以直接执行且容易执行的动作。

任务：
- 分析消息上下文，判断当前状态
- 给出 1-3 个后续可以做什么的动作，每个动作都要容易执行、低风险、无需外部审批
- 不要输出这些动作：${forbiddenText}

输出 JSON 格式：
{
  "actions": [
    {"button": "决策指令1", "reason": "理由"},
    {"button": "决策指令2", "reason": "理由"}
  ]
}

示例：
消息："代码修改已完成，测试通过"
返回：{"actions": [{"button": "补充测试", "reason": "低风险且可直接执行"}, {"button": "查看改动", "reason": "便于确认修改范围"}]}`;
}

function containsForbiddenAction(text: string, rules: Required<QuickButtonRules>): boolean {
  return rules.forbiddenActions.some((item) => text.includes(item));
}

function filterButtonWithReasonList(
  items: ButtonWithReason[],
  rules: Required<QuickButtonRules>
): ButtonWithReason[] {
  return items.filter((item) => !containsForbiddenAction(item.button, rules));
}

function filterTextButtons(items: string[], rules: Required<QuickButtonRules>): string[] {
  return items.filter((item) => !containsForbiddenAction(item, rules));
}

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
  llmModel?: string,
  quickButtonRules?: QuickButtonRules
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
  const rules = normalizeQuickButtonRules(quickButtonRules);

  // 2. 选择对应的 prompt
  const systemPrompt = messageType === 'proposal'
    ? PROPOSAL_EVALUATOR_PROMPT
    : buildDecisionMakerPrompt(rules);

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
          suggested: filterButtonWithReasonList(suggested, rules)
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
          actions: filterButtonWithReasonList(actions, rules)
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
  const { message, workspaceStatus, llmEnabled, llmConfig, quickButtonRules, recentMessages } = request;
  const rules = normalizeQuickButtonRules(quickButtonRules);

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
    const extractedButtons = filterTextButtons(extractDynamicButtons(message), rules);
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
    llmConfig?.model,
    rules
  );

  // 检查 LLM 是否返回有效结果（如果失败或返回空，回退到正则模式）
  const isLLMFailed =
    (llmResult.type === 'proposal' && llmResult.suggested.length === 0) ||
    (llmResult.type === 'decision' && llmResult.actions.length === 0);

  if (isLLMFailed) {
    // LLM 失败或返回空，回退到正则提取模式（不显示推荐按钮）
    const extractedButtons = filterTextButtons(extractDynamicButtons(message), rules);
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
        : filterTextButtons(extractDynamicButtons(message), rules);

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

# LLM 快捷按钮提示词策略改进实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 根据消息类型动态切换 LLM 角色，使快捷按钮推荐更精准

**Architecture:** 使用关键词规则检测消息类型（方案类/非方案类），根据类型选择对应的 Prompt（方案评价师/任务决策者），输出带理由的按钮建议

**Tech Stack:** TypeScript, Lit Web Components, OpenAI-compatible API (LM Studio)

---

## 文件结构

| 文件 | 变更类型 | 职责 |
|------|----------|------|
| `src/lib/quick-buttons.ts` | 修改 | 消息类型检测、两种 Prompt、响应接口更新 |
| `src/types.ts` | 修改 | 新增类型定义 |
| `src/kanban-watcher-card.ts` | 修改 | 适配带 reason 的按钮渲染 |
| `tests/quick-buttons-llm.test.ts` | 修改 | 更新测试用例 |

---

## Chunk 1: 类型定义与消息类型检测

### Task 1: 新增类型定义

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: 在 types.ts 末尾添加新类型**

```typescript
/** 消息类型 */
export type MessageType = 'proposal' | 'decision';

/** 带理由的按钮 */
export interface ButtonWithReason {
  button: string;
  reason: string;
}

/** 方案类响应（方案评价师） */
export interface ProposalButtonsResponse {
  type: 'proposal';
  extracted: string[];
  suggested: ButtonWithReason[];
}

/** 非方案类响应（任务决策者） */
export interface DecisionButtonsResponse {
  type: 'decision';
  actions: ButtonWithReason[];
}

/** LLM 按钮响应（联合类型） */
export type LLMButtonsResponse = ProposalButtonsResponse | DecisionButtonsResponse;
```

- [ ] **Step 2: 验证类型定义**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: 新增 LLM 按钮响应类型定义"
```

---

### Task 2: 实现消息类型检测函数

**Files:**
- Modify: `src/lib/quick-buttons.ts`

- [ ] **Step 1: 添加方案类关键词常量和检测函数**

在 `quick-buttons.ts` 中，在 `STATIC_BUTTONS` 常量后添加：

```typescript
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
```

- [ ] **Step 2: 为 detectMessageType 编写测试**

在 `tests/quick-buttons.test.ts` 末尾添加：

```typescript
import { detectMessageType } from '../src/lib/quick-buttons';

describe('detectMessageType', () => {
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
```

- [ ] **Step 3: 运行测试验证**

Run: `npx vitest run tests/quick-buttons.test.ts`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add src/lib/quick-buttons.ts tests/quick-buttons.test.ts
git commit -m "feat: 新增消息类型检测函数"
```

---

## Chunk 2: Prompt 策略与响应接口更新

### Task 3: 新增两种 Prompt

**Files:**
- Modify: `src/lib/quick-buttons.ts`

- [ ] **Step 1: 添加方案评价师 Prompt**

在 `analyzeButtonsWithLLM` 函数之前添加：

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/quick-buttons.ts
git commit -m "feat: 新增方案评价师和任务决策者 Prompt"
```

---

### Task 4: 更新 LLMButtonsResponse 接口

**Files:**
- Modify: `src/lib/quick-buttons.ts`

- [ ] **Step 1: 更新接口定义（使用 types.ts 中的类型）**

在 `quick-buttons.ts` 中：
1. 删除现有的 `LLMButtonsResponse` 接口定义（约141-146行）
2. 添加从 types.ts 的导入：

```typescript
import type {
  MessageType,
  ButtonWithReason,
  ProposalButtonsResponse,
  DecisionButtonsResponse,
  LLMButtonsResponse
} from '../types';
```

- [ ] **Step 2: 验证类型导入**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/lib/quick-buttons.ts
git commit -m "refactor: 使用 types.ts 中的 LLM 按钮类型"
```

---

### Task 5: 重构 analyzeButtonsWithLLM 函数

**Files:**
- Modify: `src/lib/quick-buttons.ts`

- [ ] **Step 1: 重写 analyzeButtonsWithLLM 函数**

将现有的 `analyzeButtonsWithLLM` 函数替换为：

```typescript
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
          ? parsed.extracted
              .filter((item): item is string => typeof item === "string")
              .map((item: string) => item.trim())
              .filter((item: string) => isValidButtonText(item))
              .slice(0, 3)
          : [];

        const suggested: ButtonWithReason[] = Array.isArray(parsed.suggested)
          ? parsed.suggested
              .filter((item): item is Record<string, unknown> =>
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
          ? parsed.actions
              .filter((item): item is Record<string, unknown> =>
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
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/lib/quick-buttons.ts
git commit -m "feat: 重构 analyzeButtonsWithLLM 支持动态角色切换"
```

---

## Chunk 3: 调用方适配与测试更新

### Task 6: 更新 getQuickButtonsWithLLM 函数

**Files:**
- Modify: `src/lib/quick-buttons.ts`

- [ ] **Step 1: 更新 QuickButtonsResult 接口**

将 `QuickButtonsResult` 接口更新为支持带理由的按钮：

```typescript
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
```

- [ ] **Step 2: 更新 getQuickButtonsWithLLM 函数**

```typescript
/**
 * 获取快捷按钮（结合静态按钮和 LLM 分析）
 * @param request 请求参数
 * @returns 快捷按钮结果（静态 + 提取 + 推荐）
 */
export async function getQuickButtonsWithLLM(
  request: QuickButtonsRequest
): Promise<QuickButtonsResult> {
  const { message, workspaceStatus, llmEnabled, llmConfig } = request;

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

  // LLM 未启用，使用正则匹配
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

  // 使用 LLM 分析
  const llmResult = await analyzeButtonsWithLLM(
    message,
    llmConfig?.baseUrl,
    llmConfig?.model
  );

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
    return {
      type: 'decision',
      staticButtons: [...STATIC_BUTTONS],
      extractedButtons: [],
      suggestedButtons: llmResult.actions,
      dynamicButtons: llmResult.actions.map(a => a.button).filter(isValidButtonText),
    };
  }
}
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/lib/quick-buttons.ts
git commit -m "feat: 更新 getQuickButtonsWithLLM 支持带理由的按钮"
```

---

### Task 7: 更新测试用例

**Files:**
- Modify: `tests/quick-buttons-llm.test.ts`

- [ ] **Step 1: 更新测试文件头部导入**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeButtonsWithLLM,
  getQuickButtonsWithLLM,
  detectMessageType,
  type QuickButtonsResult,
} from "../src/lib/quick-buttons";
import type { LLMButtonsResponse, ButtonWithReason } from "../src/types";
```

- [ ] **Step 2: 更新 analyzeButtonsWithLLM 测试用例**

将现有测试替换为：

```typescript
describe("analyzeButtonsWithLLM", () => {
  it("returns default decision result when LLM API is not available", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await analyzeButtonsWithLLM("请选择方案1或方案2");
    expect(result.type).toBe('decision');
    expect(result.actions).toEqual([]);
  });

  it("calls LM Studio API with proposal prompt for proposal messages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"extracted": ["方案1", "方案2"], "suggested": [{"button": "选择方案1", "reason": "推荐理由"}]}',
            },
          },
        ],
      }),
    });

    const result = await analyzeButtonsWithLLM(
      "请选择方案1或方案2",
      "http://localhost:1234"
    );

    expect(result.type).toBe('proposal');
    if (result.type === 'proposal') {
      expect(result.extracted).toEqual(["方案1", "方案2"]);
      expect(result.suggested).toEqual<ButtonWithReason[]>([
        { button: "选择方案1", reason: "推荐理由" }
      ]);
    }
  });

  it("calls LM Studio API with decision prompt for non-proposal messages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"actions": [{"button": "继续", "reason": "任务已完成"}]}',
            },
          },
        ],
      }),
    });

    const result = await analyzeButtonsWithLLM(
      "代码修改已完成",
      "http://localhost:1234"
    );

    expect(result.type).toBe('decision');
    if (result.type === 'decision') {
      expect(result.actions).toEqual<ButtonWithReason[]>([
        { button: "继续", reason: "任务已完成" }
      ]);
    }
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
    expect(result.type).toBe('decision');
    if (result.type === 'decision') {
      expect(result.actions).toEqual([]);
    }
  });
});
```

- [ ] **Step 3: 更新 getQuickButtonsWithLLM 测试用例**

```typescript
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

    expect(result.staticButtons).toEqual(["继续", "同意"]);
    expect(result.extractedButtons).toEqual([]);
    expect(result.suggestedButtons).toEqual([]);
  });

  it("returns proposal buttons for proposal messages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"extracted": ["方案1"], "suggested": [{"button": "选择方案1", "reason": "推荐理由"}]}',
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

    expect(result.type).toBe('proposal');
    expect(result.staticButtons).toEqual(["继续", "同意"]);
    expect(result.extractedButtons).toContain("方案1");
    expect(result.suggestedButtons).toEqual([{ button: "选择方案1", reason: "推荐理由" }]);
  });

  it("returns decision buttons for non-proposal messages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"actions": [{"button": "继续", "reason": "可继续下一步"}]}',
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

    expect(result.type).toBe('decision');
    expect(result.suggestedButtons).toEqual([{ button: "继续", reason: "可继续下一步" }]);
  });

  it("falls back to regex when LLM is disabled", async () => {
    const result = await getQuickButtonsWithLLM({
      message: "请选择方案1或方案2",
      workspaceStatus: "attention",
      llmEnabled: false,
      llmConfig: undefined,
    });

    expect(result.extractedButtons).toContain("方案1");
    expect(result.suggestedButtons).toEqual([]);
  });
});
```

- [ ] **Step 4: 运行测试验证**

Run: `npx vitest run tests/quick-buttons-llm.test.ts`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add tests/quick-buttons-llm.test.ts
git commit -m "test: 更新 LLM 按钮测试用例支持新响应格式"
```

---

### Task 8: 适配 kanban-watcher-card.ts 渲染逻辑

**Files:**
- Modify: `src/kanban-watcher-card.ts`

- [ ] **Step 1: 更新状态变量类型**

找到 `suggestedButtonsByWorkspace` 的定义，更新类型为支持 `ButtonWithReason[]`：

```typescript
// 在类定义中找到这些变量，更新类型
@property({ attribute: false })
private suggestedButtonsByWorkspace: Record<string, ButtonWithReason[]> = {};
```

需要导入类型：
```typescript
import type { ButtonWithReason, MessageType } from './types';
```

- [ ] **Step 2: 更新 analyzeDynamicButtons 方法**

更新缓存逻辑：

```typescript
private async analyzeDynamicButtons(workspace: KanbanWorkspace) {
  const messages = this.dialogMessagesByWorkspace[workspace.id] || [];

  const lastAiMessage = [...messages]
    .reverse()
    .find((msg) => msg.kind === "message" && msg.sender === "ai");

  if (!lastAiMessage || !("text" in lastAiMessage)) {
    this.extractedButtonsByWorkspace = {
      ...this.extractedButtonsByWorkspace,
      [workspace.id]: [],
    };
    this.suggestedButtonsByWorkspace = {
      ...this.suggestedButtonsByWorkspace,
      [workspace.id]: [],
    };
    this.dynamicButtonsByWorkspace = {
      ...this.dynamicButtonsByWorkspace,
      [workspace.id]: [],
    };
    delete this.dynamicButtonsMessageHashByWorkspace[workspace.id];
    return;
  }

  const message = lastAiMessage.text;
  const messageHash = this.simpleHash(message);
  const cachedHash = this.dynamicButtonsMessageHashByWorkspace[workspace.id];

  if (cachedHash === messageHash) {
    return;
  }

  const result = await getQuickButtonsWithLLM({
    message,
    workspaceStatus: workspace.status,
    llmEnabled: this.config?.llm_enabled ?? false,
    llmConfig: {
      baseUrl: this.config?.llm_base_url,
      model: this.config?.llm_model,
    },
  });

  this.dynamicButtonsMessageHashByWorkspace[workspace.id] = messageHash;
  this.extractedButtonsByWorkspace = {
    ...this.extractedButtonsByWorkspace,
    [workspace.id]: result.extractedButtons,
  };
  this.suggestedButtonsByWorkspace = {
    ...this.suggestedButtonsByWorkspace,
    [workspace.id]: result.suggestedButtons,
  };
  this.dynamicButtonsByWorkspace = {
    ...this.dynamicButtonsByWorkspace,
    [workspace.id]: result.dynamicButtons,
  };
  this.requestUpdate();
}
```

- [ ] **Step 3: 更新 renderQuickButtons 方法**

支持带理由的按钮渲染（可选显示 reason）：

```typescript
private renderQuickButtons(workspace: KanbanWorkspace) {
  const isRunning = workspace.status === "running";

  if (isRunning) {
    return nothing;
  }

  const staticBtns = STATIC_BUTTONS;
  const extractedBtns = this.extractedButtonsByWorkspace[workspace.id] || [];
  const suggestedBtns = this.suggestedButtonsByWorkspace[workspace.id] || [];

  if (staticBtns.length === 0 && extractedBtns.length === 0 && suggestedBtns.length === 0) {
    return nothing;
  }

  return html`
    <div class="quick-buttons">
      ${staticBtns.map((text) => html`
        <button
          class="quick-button is-static"
          type="button"
          @click=${() => void this.handleQuickButtonClick(text)}
        >
          ${text}
        </button>
      `)}
      ${extractedBtns.map((text) => html`
        <button
          class="quick-button is-extracted"
          type="button"
          @click=${() => void this.handleQuickButtonClick(text)}
        >
          ${text}
        </button>
      `)}
      ${suggestedBtns.map((item) => html`
        <button
          class="quick-button is-suggested"
          type="button"
          title="${item.reason}"
          @click=${() => void this.handleQuickButtonClick(item.button)}
        >
          ${item.button}
        </button>
      `)}
    </div>
  `;
}
```

- [ ] **Step 4: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: 运行所有测试**

Run: `npx vitest run`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add src/kanban-watcher-card.ts
git commit -m "feat: 适配快捷按钮渲染支持带理由的建议"
```

---

### Task 9: 最终验证与集成

- [ ] **Step 1: 运行完整测试套件**

Run: `npx vitest run`
Expected: 所有测试通过

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "feat: 完成 LLM 快捷按钮提示词策略改进"
```

---

## 验证清单

- [ ] `detectMessageType` 函数正确识别方案类/非方案类消息
- [ ] 方案类消息使用"方案评价师" Prompt，输出 `extracted` + `suggested`
- [ ] 非方案类消息使用"任务决策者" Prompt，输出 `actions`
- [ ] 所有建议按钮都带有 `reason` 字段
- [ ] UI 渲染正确显示带理由的按钮（通过 title 属性）
- [ ] 所有测试通过
- [ ] 构建成功

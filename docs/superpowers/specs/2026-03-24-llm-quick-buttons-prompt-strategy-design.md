# LLM 快捷按钮提示词策略改进设计

## 概述

根据 AI 消息类型动态切换 LLM 角色，使快捷按钮推荐更精准、更符合用户当下需求。

## 问题背景

当前实现使用单一角色"快捷按钮分析助手"，无法区分不同类型的消息场景：
- 方案类消息：需要评价方案、给出选择理由
- 非方案类消息：需要给出决策指令（继续、暂停等）

## 解决方案

### 1. 消息类型检测

使用混合策略：关键词规则 + 默认分类

```typescript
// 方案类关键词
const PROPOSAL_KEYWORDS = [
  '方案', '选择', '建议', '推荐', '选项', '计划',
  '决定', '评估', '对比', '优缺点', '利弊'
];

// 判断消息类型
function detectMessageType(message: string): MessageType {
  const hasProposalKeyword = PROPOSAL_KEYWORDS.some(
    keyword => message.includes(keyword)
  );
  return hasProposalKeyword ? 'proposal' : 'decision';
}
```

### 2. 数据结构

```typescript
// 消息类型枚举
type MessageType = 'proposal' | 'decision';

// 方案类响应（方案评价师）
interface ProposalButtonsResponse {
  type: 'proposal';
  extracted: string[];  // 从消息中提取的选项
  suggested: Array<{
    button: string;
    reason: string;
  }>;
}

// 非方案类响应（任务决策者）
interface DecisionButtonsResponse {
  type: 'decision';
  actions: Array<{
    button: string;
    reason: string;
  }>;
}

// 联合类型
type LLMButtonsResponse = ProposalButtonsResponse | DecisionButtonsResponse;
```

### 3. Prompt 设计

#### 方案评价师（方案类消息）

```
你是优秀的方案评价师。根据给出的方案给出你的选择和理由（可以推荐多个）。

任务：
1. 从消息中提取已有的选项
2. 基于方案内容，给出1-3个推荐操作，每个推荐需包含理由

输出 JSON 格式：
{
  "extracted": ["选项1", "选项2"],
  "suggested": [
    {"button": "推荐操作1", "reason": "选择理由"},
    {"button": "推荐操作2", "reason": "选择理由"}
  ]
}
```

#### 任务决策者（非方案类消息）

```
你是优秀的任务决策者。根据当前项目情况，给出接下来1-3个紧急要做的事情。

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
```

### 4. 核心函数

```typescript
// src/lib/quick-buttons.ts

export async function analyzeButtonsWithLLM(
  message: string,
  context?: string
): Promise<LLMButtonsResponse> {
  // 1. 检测消息类型
  const messageType = detectMessageType(message);

  // 2. 选择对应的 prompt
  const systemPrompt = messageType === 'proposal'
    ? PROPOSAL_EVALUATOR_PROMPT
    : DECISION_MAKER_PROMPT;

  // 3. 调用 LLM
  const response = await callLLM(systemPrompt, message, context);

  // 4. 返回结果（带类型标记）
  return {
    type: messageType,
    ...response
  };
}
```

### 5. 调用方适配

```typescript
// kanban-watcher-card.ts
renderQuickButtons(result: LLMButtonsResponse) {
  const buttons: Array<{text: string, reason?: string, cssClass: string}> = [];

  // 静态按钮（始终显示）
  buttons.push(
    { text: '继续', cssClass: 'is-static' },
    { text: '同意', cssClass: 'is-static' }
  );

  if (result.type === 'proposal') {
    // 方案类：提取的选项 + 带理由的推荐
    result.extracted.forEach(text =>
      buttons.push({ text, cssClass: 'is-extracted' })
    );
    result.suggested.forEach(item =>
      buttons.push({ text: item.button, reason: item.reason, cssClass: 'is-suggested' })
    );
  } else {
    // 非方案类：带理由的决策指令
    result.actions.forEach(item =>
      buttons.push({ text: item.button, reason: item.reason, cssClass: 'is-suggested' })
    );
  }

  return buttons;
}
```

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/lib/quick-buttons.ts` | 修改 | 新增类型检测、Prompt 常量、响应接口 |
| `src/kanban-watcher-card.ts` | 修改 | 适配新响应格式的渲染逻辑 |
| `src/types.ts` | 修改 | 新增 `MessageType`、`LLMButtonsResponse` 类型 |

## 验证方案

1. 单元测试覆盖 `detectMessageType()` 函数
2. 测试方案类消息的 LLM 响应解析
3. 测试非方案类消息的 LLM 响应解析
4. 手动测试 UI 渲染效果

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 关键词误判 | 保留原有 `extracted` 逻辑作为兜底 |
| LLM 响应格式不符 | 增加解析容错，返回空数组而非报错 |
| 理由过长 | 限制 `reason` 字段长度为 50 字符 |

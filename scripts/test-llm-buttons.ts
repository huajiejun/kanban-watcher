/**
 * 测试 LLM 快捷按钮分析
 * 使用方法: npx tsx scripts/test-llm-buttons.ts
 */

const LLM_BASE_URL = "http://localhost:1234";
const LLM_MODEL = "qwen3-coder-30b-a3b-instruct-mlx";

// 测试消息样本
const TEST_MESSAGES = [
  {
    name: "方案选择",
    message: `我已经分析了代码，有几个方案可以选择：

方案 A: 使用正则表达式匹配
方案 B: 使用 LLM 语义分析
方案 C: 结合两种方式

你更倾向于哪个方案？`,
  },
  {
    name: "继续执行",
    message: `代码修改已完成，请确认是否继续执行下一步操作？`,
  },
  {
    name: "选项列表",
    message: `请选择一个选项：
Option A: 快速修复
Option B: 完整重构
Option C: 暂时跳过`,
  },
  {
    name: "普通通知",
    message: `任务已完成，所有测试都通过了。`,
  },
  {
    name: "Yes/No 选择",
    message: `检测到潜在的问题，是否要继续执行？请回复 Yes 或 No`,
  },
];

async function analyzeButtonsWithLLM(message: string): Promise<string[]> {
  const systemPrompt = `你是一个快捷按钮提取助手。分析用户消息，提取可能的快捷回复按钮。

规则：
1. 只返回 JSON 数组格式，例如 ["按钮1", "按钮2"]
2. 如果消息中有选项（如方案A/B/C、Option A/B/C、Yes/No 等），提取这些选项
3. 如果消息询问是否继续，返回 ["继续", "取消"]
4. 如果没有明确的操作选项，返回空数组 []
5. 按钮文本要简短（不超过20字）
6. 不要返回任何解释，只返回 JSON 数组`;

  try {
    const response = await fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.1,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API 错误: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // 提取 JSON 数组
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (error) {
    console.error("LLM 调用失败:", error);
    return [];
  }
}

async function main() {
  console.log("=== LLM 快捷按钮测试 ===\n");
  console.log(`LLM 服务: ${LLM_BASE_URL}`);
  console.log(`模型: ${LLM_MODEL}\n`);

  for (const test of TEST_MESSAGES) {
    console.log(`--- ${test.name} ---`);
    console.log(`消息: ${test.message.slice(0, 100)}...`);

    const startTime = Date.now();
    const buttons = await analyzeButtonsWithLLM(test.message);
    const duration = Date.now() - startTime;

    console.log(`结果: ${JSON.stringify(buttons)}`);
    console.log(`耗时: ${duration}ms\n`);
  }
}

main().catch(console.error);

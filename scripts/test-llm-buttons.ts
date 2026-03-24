/**
 * 测试 LLM 快捷按钮分析（包括提取选项和语义联想推荐）
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
  {
    name: "发现错误",
    message: `在运行测试时发现了 3 个错误，需要修复后才能继续。`,
  },
  {
    name: "代码审查",
    message: `代码已经准备好提交，建议先进行一次代码审查。`,
  },
];

interface LLMButtonsResponse {
  extracted: string[];
  suggested: string[];
}

async function analyzeButtonsWithLLM(message: string): Promise<LLMButtonsResponse> {
  const systemPrompt = `你是一个快捷按钮分析助手。分析 AI 助手发送给用户的消息，完成两个任务：

任务1 - 提取选项（extracted）：
- 判断消息是否包含需要用户选择的方案/选项
- 如果是"注意事项"、"说明"、"已完成"等无需用户操作的内容，返回空数组
- 如果需要用户选择，提取具体的选项名称（最多3个）

任务2 - 智能推荐（suggested）：
基于消息内容，提供2个最有价值的下一步操作建议：
- 如果有多个方案：推荐审核某个方案、询问选择理由、指出潜在问题
- 如果是完成状态：推荐验证结果、查看详情、继续下一步
- 如果发现错误：推荐查看错误、自动修复
- 推荐要有信息量，帮助用户做决策，而不是简单重复选项

返回格式要求（必须是严格JSON）：
{
  "extracted": ["选项1", "选项2"],
  "suggested": ["推荐操作1", "推荐操作2"]
}

示例：
消息："请选择方案1或方案2，方案1是快速实现，方案2是完整实现"
返回：{"extracted": ["方案1", "方案2"], "suggested": ["审核方案1的代码", "方案2有什么风险"]}

消息："发现三种实现方式：A用正则、B用LLM、C用混合"
返回：{"extracted": ["方案A", "方案B", "方案C"], "suggested": ["对比各方案优劣", "推荐哪个方案"]}

消息："代码修改已完成，测试通过"
返回：{"extracted": [], "suggested": ["运行测试验证", "查看改动详情"]}

消息："发现3个错误需要修复"
返回：{"extracted": [], "suggested": ["查看错误详情", "自动修复这些错误"]}`;

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
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API 错误: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    // 提取 JSON 对象
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        extracted: Array.isArray(parsed.extracted) ? parsed.extracted : [],
        suggested: Array.isArray(parsed.suggested) ? parsed.suggested : [],
      };
    }
    return { extracted: [], suggested: [] };
  } catch (error) {
    console.error("LLM 调用失败:", error);
    return { extracted: [], suggested: [] };
  }
}

async function main() {
  console.log("=== LLM 快捷按钮测试（提取 + 推荐）===\n");
  console.log(`LLM 服务: ${LLM_BASE_URL}`);
  console.log(`模型: ${LLM_MODEL}\n`);

  for (const test of TEST_MESSAGES) {
    console.log(`--- ${test.name} ---`);
    console.log(`消息: ${test.message.slice(0, 100)}...`);

    const startTime = Date.now();
    const result = await analyzeButtonsWithLLM(test.message);
    const duration = Date.now() - startTime;

    console.log(`提取选项: ${JSON.stringify(result.extracted)}`);
    console.log(`推荐操作: ${JSON.stringify(result.suggested)}`);
    console.log(`耗时: ${duration}ms\n`);
  }
}

main().catch(console.error);

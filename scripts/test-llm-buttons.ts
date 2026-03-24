import { analyzeButtonsWithLLM, detectMessageType } from "../src/lib/quick-buttons";

const testCases = [
  // 方案类消息
  {
    name: "方案类 - 多方案选择",
    message: "发现两种实现方式：方案1使用正则匹配，方案2使用 LLM 语义分析。请选择使用哪种方式？"
  },
  {
    name: "方案类 - 推荐请求",
    message: "我有三个技术栈可以选择：React、Vue、Angular。你建议我用哪个？"
  },
  {
    name: "方案类 - 评估对比",
    message: "对比一下使用 Redis 和 Memcached 作为缓存的优缺点"
  },
  {
    name: "方案类 - 决策建议",
    message: "项目需要选择一个数据库，我正在考虑 PostgreSQL 和 MySQL，帮我分析一下"
  },
  {
    name: "方案类 - 计划选择",
    message: "制定开发计划：计划A是快速迭代，计划B是完整重构。你倾向于哪个？"
  },
  // 非方案类消息
  {
    name: "非方案类 - 完成通知",
    message: "代码修改已完成，所有测试通过。"
  },
  {
    name: "非方案类 - 错误发现",
    message: "发现 3 个 TypeScript 类型错误需要修复。"
  },
  {
    name: "非方案类 - 等待输入",
    message: "请确认是否继续执行下一步操作？"
  },
  {
    name: "非方案类 - 状态更新",
    message: "当前任务执行中，已处理 80% 的文件。"
  },
  {
    name: "非方案类 - 提问",
    message: "你的项目使用什么构建工具？"
  }
];

async function runTests() {
  console.log("=== LLM 快捷按钮测试 ===\n");

  for (const testCase of testCases) {
    console.log(`\n【${testCase.name}】`);
    console.log(`消息: "${testCase.message}"`);

    const detectedType = detectMessageType(testCase.message);
    console.log(`检测类型: ${detectedType}`);

    try {
      const result = await analyzeButtonsWithLLM(testCase.message, "http://localhost:1234");
      console.log(`返回类型: ${result.type}`);

      if (result.type === 'proposal') {
        console.log(`提取选项: ${JSON.stringify(result.extracted)}`);
        console.log(`推荐操作: ${JSON.stringify(result.suggested)}`);
      } else {
        console.log(`决策指令: ${JSON.stringify(result.actions)}`);
      }
    } catch (error) {
      console.log(`错误: ${error}`);
    }
  }
}

runTests().catch(console.error);

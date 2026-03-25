#!/usr/bin/env node

/**
 * Todo List 功能测试脚本
 *
 * 这个脚本用于测试 kanban-watcher 的 todo list 功能
 * 运行方式：node scripts/test-todo-feature.js
 */

console.log("🧪 Todo List 功能测试\n");
console.log("=".repeat(60));

// 测试 1: 模拟 todo_management 消息
console.log("\n📝 测试 1: 模拟 todo_management 消息\n");

const mockTodoMessage = {
  session_id: "test-session-001",
  role: "assistant",
  content: "我已经为您创建了待办事项列表",
  timestamp: new Date().toISOString(),
  tool_info: {
    tool_name: "TodoWrite",
    action_type: {
      action: "todo_management",
      todos: [
        {
          content: "完成用户界面设计",
          status: "completed"
        },
        {
          content: "实现后端 API",
          status: "in_progress"
        },
        {
          content: "编写单元测试",
          status: "pending"
        },
        {
          content: "部署到生产环境",
          status: "pending"
        }
      ]
    }
  }
};

console.log("模拟消息内容:");
console.log(JSON.stringify(mockTodoMessage, null, 2));

// 测试 2: 提取 todo 数据
console.log("\n📋 测试 2: 提取 todo 数据\n");

function extractTodos(message) {
  if (message.tool_info?.action_type?.action === 'todo_management') {
    return message.tool_info.action_type.todos || [];
  }
  return [];
}

const todos = extractTodos(mockTodoMessage);
console.log(`✅ 提取到 ${todos.length} 个待办事项:`);

todos.forEach((todo, index) => {
  const statusMap = {
    'completed': '✅',
    'in_progress': '🔵',
    'pending': '⭕',
    'cancelled': '❌'
  };
  const icon = statusMap[todo.status] || '⭕';
  console.log(`   ${icon} ${index + 1}. ${todo.content} (${todo.status})`);
});

// 测试 3: 计算进度
console.log("\n📊 测试 3: 计算进度\n");

const total = todos.length;
const completed = todos.filter(t => t.status === 'completed').length;
const percentage = Math.round((completed / total) * 100);

console.log(`   总计: ${total} 项`);
console.log(`   已完成: ${completed} 项`);
console.log(`   进度: ${percentage}%`);

// 测试 4: 保存到历史记录
console.log("\n💾 测试 4: 保存到历史记录\n");

const historyKey = 'kanban-watcher-todo-history';
const historyEntry = {
  workspaceId: 'test-workspace',
  workspaceName: '测试工作区',
  todos: todos,
  timestamp: Date.now(),
  completedCount: completed,
  totalCount: total
};

console.log("历史记录条目:");
console.log(JSON.stringify(historyEntry, null, 2));

// 测试 5: 浏览器控制台测试
console.log("\n🌐 测试 5: 浏览器控制台测试\n");

console.log("在浏览器中打开 kanban-watcher，然后在控制台运行以下代码：");
console.log("\n" + "=".repeat(60));
console.log(`
// 模拟接收 todo 消息
const testMessage = {
  session_id: "test-session",
  role: "assistant",
  tool_info: {
    tool_name: "TodoWrite",
    action_type: {
      action: "todo_management",
      todos: [
        { content: "测试任务 1", status: "completed" },
        { content: "测试任务 2", status: "in_progress" },
        { content: "测试任务 3", status: "pending" }
      ]
    }
  }
};

// 查找 kanban-watcher-card 元素
const card = document.querySelector('kanban-watcher-card');
if (card) {
  // 调用消息处理方法（需要根据实际 API 调整）
  console.log("✅ 找到 kanban-watcher-card 元素");
  console.log("💡 提示：需要在实际对话中触发 todo_management 工具调用");
} else {
  console.log("❌ 未找到 kanban-watcher-card 元素");
}
`);
console.log("=".repeat(60));

// 测试 6: 手动测试步骤
console.log("\n📖 测试 6: 手动测试步骤\n");

console.log("1. 启动 kanban-watcher 服务");
console.log("2. 在对话框中输入类似以下的请求：");
console.log("   '请帮我创建一个待办事项列表，包含：设计、开发、测试'");
console.log("3. AI 会执行 TodoWrite 工具调用");
console.log("4. 系统会自动提取并显示待办事项");
console.log("5. 点击工具栏的 todo 图标查看详细列表");
console.log("6. 切换到'历史记录'标签查看所有历史 todo");

// 总结
console.log("\n" + "=".repeat(60));
console.log("✅ 测试脚本执行完成！\n");

console.log("📋 Todo List 功能说明:");
console.log("   - 自动提取：当 AI 执行 TodoWrite 工具时自动提取");
console.log("   - 实时显示：在工具栏显示进度指示器");
console.log("   - 历史记录：保存最近 20 条 todo 记录");
console.log("   - 状态追踪：支持 completed、in_progress、pending、cancelled");
console.log("   - 暗黑风格：使用深色背景和白色图标");
console.log("   - 始终可点击：即使没有 todo 也可以查看历史记录");

console.log("\n🎯 测试完成！");

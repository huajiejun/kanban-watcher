# 测试基线-全量Vitest存在既有失败

## 发现时间

2026-03-27

## 发现方式

在完成“预制按钮规则调整”后执行全量回归：

```bash
npm test
```

## 现象

当前仓库存在多组既有失败，主要集中在：

- `tests/kanban-watcher-card.test.ts`
- `tests/workspace-pane-layout.test.ts`
- `tests/workspace-home.test.ts`
- `tests/todo-progress-popup.test.ts`
- `tests/todo-integration.test.ts`

## 判断

这些失败与本次快捷按钮规则改动无直接代码交集：

- 本次修改集中在 `src/lib/quick-buttons.ts`、预览配置透传、卡片快捷按钮配置入口
- 失败点主要落在工作区布局、Todo 组件、卡片对话框既有断言

因此先按“既有测试基线问题”记录，避免误判为本次需求回归。

## 建议

后续单独开一个修复批次，先对上述测试做基线排查，再决定是修实现还是修断言。

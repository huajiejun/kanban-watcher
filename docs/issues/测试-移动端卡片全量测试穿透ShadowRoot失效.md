# 测试-移动端卡片全量测试穿透ShadowRoot失效

## 问题概述

执行 `npm test -- tests/kanban-watcher-card.test.ts` 时，存在多条历史用例失败，失败点集中在直接从 `kanban-watcher-card` 的 `shadowRoot` 查询弹窗内部节点。

## 现象

- `.message-input` 查询结果为 `null`
- `.message-tool-button` 查询结果为 `null`
- `.dialog-feedback` 文本为空
- 部分消息列表断言得到空数组

## 根因判断

`workspace-conversation-pane` 自身使用 shadow DOM，相关节点实际挂载在它的内部 `shadowRoot` 中。当前多条旧测试仍按扁平 DOM 结构从 `card.shadowRoot` 直接读取，导致在组件边界收紧后整批断言失效。

## 与本次修复的关系

- 本次“移动端打开文件入口对齐”只新增了 `workspacePath` 传参和共享路径工具
- 新增定向回归测试通过
- 桌面端回归测试通过
- 该全量测试问题为既存测试债务，建议后续单独修复测试查询路径

## 建议处理

1. 为 `tests/kanban-watcher-card.test.ts` 增加统一的 pane 查询 helper
2. 所有弹窗内部节点统一通过 `workspace-conversation-pane.shadowRoot` 查询
3. 完成后再补跑整个 `kanban-watcher-card` 测试文件

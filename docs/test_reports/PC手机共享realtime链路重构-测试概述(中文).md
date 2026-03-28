# PC/手机共享 realtime 链路重构测试概述

## 本次目标

- 提取 `src/lib/realtime-sync.ts` 作为 PC 端和手机模式共用的 realtime 策略层
- 统一 `realtime.base_url` 解析、活动消息过滤常量和 selected session 切换判定
- 确认重构后不影响现有 PC/手机 realtime 相关回归测试

## 执行测试

### 1. 共享 helper 单测

命令：

```bash
npm test -- --run tests/realtime-sync.test.ts
```

结果：

- 通过，`1` 个测试文件，`6` 条用例全部通过

### 2. 手机模式 realtime 回归

命令：

```bash
npm test -- --run tests/todo-integration.test.ts -t "uses realtime.base_url for the mobile card|requests filtered latest messages for the mobile card dialog|switches the mobile card session websocket when workspace snapshot updates latest_session_id"
```

结果：

- 通过，命中过滤后的 `4` 条用例全部通过，`8` 条未命中的用例被跳过
- 运行过程中有 Lit dev mode 和一次 `change-in-update` 提示，未导致失败

### 3. PC 端 mobile-card 委托回归

命令：

```bash
npm test -- --run tests/workspace-home.test.ts -t "delegates mobile realtime startup to the embedded card"
```

结果：

- 通过，命中的 `1` 条用例通过，其他 `60` 条未命中的用例被跳过

## 结论

- PC 端和手机模式已共用同一套 realtime 策略 helper
- 已覆盖并验证 `realtime.base_url`、活动消息过滤、selected session 切换判定三类共享逻辑
- 本次验证范围内未发现新的回归

# Vibe Kanban 日志提取与 Home Assistant 推送技术文档

## 概述

本文档描述如何从 Vibe Kanban 的日志文件中提取 AI 对话内容，并推送到 Home Assistant 进行展示。

---

## 1. 日志文件位置

### 1.1 基础路径

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/ai.bloop.vibe-kanban/` |
| Linux | `~/.local/share/vibe-kanban/` |
| Windows | `%APPDATA%\ai.bloop.vibe-kanban\` |

### 1.2 日志目录结构

```
{基础路径}/
├── config.json              # 配置文件
├── db.v2.sqlite             # SQLite 数据库
└── sessions/                # 会话日志目录
    ├── {uuid_prefix}/       # UUID 前2位 (小写)
    │   └── {session_id}/    # 完整 session UUID
    │       └── processes/   # 执行过程目录
    │           └── {execution_id}.jsonl  # 日志文件
    └── ...
```

**示例路径：**
```
~/Library/Application Support/ai.bloop.vibe-kanban/sessions/d7/d7e7140c-669f-46ab-a7df-f76d31508a53/processes/5d1e5433-0e63-43f2-99fa-5b3c87b276e2.jsonl
```

### 1.3 路径构建规则

```go
func GetLogFilePath(sessionID, executionID string) string {
    homeDir, _ := os.UserHomeDir()
    uuidPrefix := strings.ToLower(sessionID[:2])

    return filepath.Join(
        homeDir,
        "Library/Application Support/ai.bloop.vibe-kanban",
        "sessions",
        uuidPrefix,
        sessionID,
        "processes",
        executionID+".jsonl",
    )
}
```

---

## 2. 日志文件格式

### 2.1 文件格式

- **格式**: JSON Lines (JSONL)
- **编码**: UTF-8
- **每行**: 一个独立的 JSON 对象

### 2.2 外层结构

```json
{
  "Stdout": "{...内部JSON字符串...}"
}
```

或

```json
{
  "Stderr": "错误信息"
}
```

### 2.3 内层消息类型

内层 `Stdout` 是一个 JSON 字符串，包含以下类型：

#### 2.3.1 AI 回复消息

```json
{
  "type": "assistant",
  "message": {
    "id": "msg_xxx",
    "type": "message",
    "role": "assistant",
    "model": "glm-5",
    "content": [
      {
        "type": "text",
        "text": "这是AI的回复内容..."
      },
      {
        "type": "tool_use",
        "id": "call_xxx",
        "name": "Read",
        "input": {...}
      }
    ],
    "stop_reason": "end_turn"
  },
  "session_id": "xxx",
  "uuid": "xxx"
}
```

#### 2.3.2 用户消息

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "用户输入的内容"
  },
  "session_id": "xxx",
  "uuid": "xxx"
}
```

#### 2.3.3 工具结果消息

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "call_xxx",
        "content": "工具执行结果..."
      }
    ]
  }
}
```

---

## 3. 数据提取规则

### 3.1 提取目标

| 字段 | 来源 | 说明 |
|------|------|------|
| 角色 | `type` 字段 | `assistant` 或 `user` |
| 内容 | `message.content` | 文本内容或工具调用信息 |
| 时间 | 文件修改时间 | 日志按时间顺序写入 |

### 3.2 内容提取逻辑

```
IF type == "assistant":
    FOR EACH item IN message.content:
        IF item.type == "text":
            提取 item.text 作为 AI 回复

IF type == "user":
    IF message.content IS string:
        提取作为用户输入
    ELSE IF message.content IS array:
        FOR EACH item:
            IF item.type == "tool_result":
                可选：提取工具执行结果
```

### 3.3 过滤规则

**需要提取：**
- AI 的文本回复 (`type: "assistant"`, `content[].type: "text"`)
- 用户的原始输入 (`type: "user"`, `content: string`)

**可以忽略：**
- 工具调用 (`content[].type: "tool_use"`)
- 工具结果 (`content[].type: "tool_result"`)
- 系统消息 (`type: "system"`)
- 控制消息 (`type: "control_request"`, `type: "control_response"`)

---

## 4. 数据模型定义

### 4.1 Go 结构体

```go
// Conversation 对话记录
type Conversation struct {
    Role      string    `json:"role"`       // "user" 或 "assistant"
    Content   string    `json:"content"`    // 对话内容
    Timestamp time.Time `json:"timestamp"`  // 时间戳
    SessionID string    `json:"session_id"` // 会话ID
}

// ConversationSummary 对话摘要（用于推送到 Home Assistant）
type ConversationSummary struct {
    SessionID      string `json:"session_id"`
    LastMessage    string `json:"last_message"`     // 最后一条消息
    LastRole       string `json:"last_role"`        // 最后消息角色
    MessageCount   int    `json:"message_count"`    // 消息总数
    UpdatedAt      string `json:"updated_at"`       // 更新时间
    WorkspaceName  string `json:"workspace_name"`   // 工作区名称（可选）
}
```

---

## 5. Home Assistant 推送方案

### 5.1 方案一：MQTT（推荐）

#### 5.1.1 配置格式

推送到的 MQTT Topic：
```
homeassistant/sensor/vibe_kanban/{session_id}/config
homeassistant/sensor/vibe_kanban/{session_id}/state
```

#### 5.1.2 配置消息 (config)

```json
{
  "name": "Vibe Kanban 对话",
  "unique_id": "vibe_kanban_session_{session_id}",
  "state_topic": "vibe_kanban/sensor/{session_id}/state",
  "json_attributes_topic": "vibe_kanban/sensor/{session_id}/attributes",
  "icon": "mdi:robot",
  "device": {
    "identifiers": ["vibe_kanban"],
    "name": "Vibe Kanban",
    "manufacturer": "Vibe Kanban"
  }
}
```

#### 5.1.3 状态消息 (state)

```json
{
  "last_message": "已修复！主要修改了两个问题...",
  "last_role": "assistant",
  "message_count": 42,
  "updated_at": "2024-03-22T10:30:00Z",
  "session_id": "d7e7140c-669f-46ab-a7df-f76d31508a53"
}
```

### 5.2 方案二：REST API

#### 5.2.1 端点

```
POST http://homeassistant.local:8123/api/states/sensor.vibe_kanban_{session_id}
```

#### 5.2.2 请求头

```
Authorization: Bearer {LONG_LIVED_ACCESS_TOKEN}
Content-Type: application/json
```

#### 5.2.3 请求体

```json
{
  "state": "active",
  "attributes": {
    "last_message": "已修复！主要修改了两个问题...",
    "last_role": "assistant",
    "message_count": 42,
    "updated_at": "2024-03-22T10:30:00Z",
    "session_id": "d7e7140c-669f-46ab-a7df-f76d31508a53",
    "friendly_name": "Vibe Kanban 对话"
  }
}
```

### 5.3 方案三：WebSocket API

```javascript
// 连接 Home Assistant WebSocket
ws = new WebSocket("ws://homeassistant.local:8123/api/websocket");

// 认证
ws.send(JSON.stringify({
  type: "auth",
  access_token: "LONG_LIVED_ACCESS_TOKEN"
}));

// 更新状态（通过 fire_event）
ws.send(JSON.stringify({
  id: 1,
  type: "fire_event",
  event_type: "vibe_kanban_update",
  event_data: {
    session_id: "xxx",
    last_message: "xxx",
    message_count: 42
  }
}));
```

---

## 6. 完整代码示例

### 6.1 Go 实现完整代码

```go
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ==================== 数据结构 ====================

// LogEntry 日志文件外层结构
type LogEntry struct {
	Stdout string `json:"Stdout"`
	Stderr string `json:"Stderr"`
}

// InnerMessage 内层消息
type InnerMessage struct {
	Type      string          `json:"type"`
	Message   json.RawMessage `json:"message"`
	SessionID string          `json:"session_id"`
	UUID      string          `json:"uuid"`
}

// AssistantMsgContent AI消息内容项
type AssistantMsgContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// AssistantMessage AI消息结构
type AssistantMessage struct {
	ID      string                 `json:"id"`
	Role    string                 `json:"role"`
	Content []AssistantMsgContent  `json:"content"`
}

// UserMessage 用户消息结构
type UserMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

// Conversation 对话记录
type Conversation struct {
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	SessionID string    `json:"session_id"`
}

// HomeAssistantState HA 状态
type HomeAssistantState struct {
	State  string                 `json:"state"`
	Attributes map[string]interface{} `json:"attributes"`
}

// ==================== 配置 ====================

type Config struct {
	SessionID             string
	ExecutionID           string
	HomeAssistantURL      string
	HomeAssistantToken    string
	MQTTBroker            string
	MQTTTopic             string
}

// ==================== 日志解析 ====================

// GetLogFilePath 获取日志文件路径
func GetLogFilePath(sessionID, executionID string) string {
	homeDir, _ := os.UserHomeDir()
	uuidPrefix := strings.ToLower(sessionID[:2])

	return filepath.Join(
		homeDir,
		"Library/Application Support/ai.bloop.vibe-kanban",
		"sessions",
		uuidPrefix,
		sessionID,
		"processes",
		executionID+".jsonl",
	)
}

// ParseLogMessages 解析日志文件，提取对话
func ParseLogMessages(logPath string) ([]Conversation, error) {
	file, err := os.Open(logPath)
	if err != nil {
		return nil, fmt.Errorf("open log file: %w", err)
	}
	defer file.Close()

	var conversations []Conversation
	fileModTime := getFileModTime(logPath)

	scanner := bufio.NewScanner(file)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 10*1024*1024) // 10MB 缓冲

	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		conv := parseLine(line, fileModTime, lineNum)
		if conv != nil {
			conversations = append(conversations, *conv)
		}
	}

	return conversations, scanner.Err()
}

func getFileModTime(path string) time.Time {
	info, err := os.Stat(path)
	if err != nil {
		return time.Now()
	}
	return info.ModTime()
}

func parseLine(line []byte, baseTime time.Time, lineNum int) *Conversation {
	// 解析外层
	var entry LogEntry
	if err := json.Unmarshal(line, &entry); err != nil {
		return nil
	}

	if entry.Stdout == "" {
		return nil
	}

	// 解析内层
	var inner InnerMessage
	if err := json.Unmarshal([]byte(entry.Stdout), &inner); err != nil {
		return nil
	}

	switch inner.Type {
	case "assistant":
		return parseAssistantMessage(inner.Message, inner.SessionID, baseTime, lineNum)
	case "user":
		return parseUserMessage(inner.Message, inner.SessionID, baseTime, lineNum)
	}

	return nil
}

func parseAssistantMessage(raw json.RawMessage, sessionID string, t time.Time, lineNum int) *Conversation {
	var msg struct {
		Content []AssistantMsgContent `json:"content"`
	}

	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil
	}

	// 提取文本内容
	var texts []string
	for _, item := range msg.Content {
		if item.Type == "text" && item.Text != "" {
			texts = append(texts, item.Text)
		}
	}

	if len(texts) == 0 {
		return nil
	}

	return &Conversation{
		Role:      "assistant",
		Content:   strings.Join(texts, "\n"),
		Timestamp: t.Add(time.Duration(lineNum) * time.Millisecond),
		SessionID: sessionID,
	}
}

func parseUserMessage(raw json.RawMessage, sessionID string, t time.Time, lineNum int) *Conversation {
	var msg UserMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil
	}

	// 处理 string 类型内容
	if str, ok := msg.Content.(string); ok && str != "" {
		return &Conversation{
			Role:      "user",
			Content:   str,
			Timestamp: t.Add(time.Duration(lineNum) * time.Millisecond),
			SessionID: sessionID,
		}
	}

	return nil
}

// ==================== Home Assistant 推送 ====================

// PushToHomeAssistant 通过 REST API 推送到 Home Assistant
func PushToHomeAssistant(config Config, convs []Conversation) error {
	if len(convs) == 0 {
		return fmt.Errorf("no conversations to push")
	}

	// 获取最后一条消息
	lastConv := convs[len(convs)-1]

	// 截断内容（避免太长）
	content := lastConv.Content
	if len(content) > 500 {
		content = content[:500] + "..."
	}

	// 构建状态
	state := HomeAssistantState{
		State: "active",
		Attributes: map[string]interface{}{
			"last_message":   content,
			"last_role":      lastConv.Role,
			"message_count":  len(convs),
			"updated_at":     time.Now().Format(time.RFC3339),
			"session_id":     config.SessionID,
			"friendly_name":  "Vibe Kanban 对话",
			"icon":           "mdi:robot",
		},
	}

	// 序列化
	body, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}

	// 发送请求
	url := fmt.Sprintf("%s/api/states/sensor.vibe_kanban_%s",
		config.HomeAssistantURL,
		config.SessionID[:8])

	req, err := http.NewRequest("POST", url, strings.NewReader(string(body)))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+config.HomeAssistantToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("home assistant returned status %d", resp.StatusCode)
	}

	log.Printf("Successfully pushed to Home Assistant: %s", url)
	return nil
}

// ==================== 主程序 ====================

func main() {
	// 配置
	config := Config{
		SessionID:          "d7e7140c-669f-46ab-a7df-f76d31508a53",
		ExecutionID:        "5d1e5433-0e63-43f2-99fa-5b3c87b276e2",
		HomeAssistantURL:   "http://homeassistant.local:8123",
		HomeAssistantToken: "YOUR_LONG_LIVED_ACCESS_TOKEN",
	}

	// 获取日志文件路径
	logPath := GetLogFilePath(config.SessionID, config.ExecutionID)
	log.Printf("Reading log file: %s", logPath)

	// 解析日志
	convs, err := ParseLogMessages(logPath)
	if err != nil {
		log.Fatalf("Parse log messages: %v", err)
	}

	log.Printf("Found %d conversations", len(convs))

	// 打印最后 3 条对话
	for i, conv := range convs {
		if i >= len(convs)-3 {
			role := "用户"
			if conv.Role == "assistant" {
				role = "AI"
			}
			content := conv.Content
			if len(content) > 100 {
				content = content[:100] + "..."
			}
			log.Printf("[%s] %s", role, content)
		}
	}

	// 推送到 Home Assistant
	if err := PushToHomeAssistant(config, convs); err != nil {
		log.Printf("Failed to push to Home Assistant: %v", err)
	} else {
		log.Println("Successfully pushed to Home Assistant")
	}
}
```

### 6.2 Python 实现示例

```python
#!/usr/bin/env python3
"""
Vibe Kanban 日志提取器 - 推送到 Home Assistant
"""

import json
import os
import requests
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional


class LogExtractor:
    """日志提取器"""

    def __init__(self, session_id: str, execution_id: str):
        self.session_id = session_id
        self.execution_id = execution_id
        self.log_path = self._get_log_path()

    def _get_log_path(self) -> Path:
        """获取日志文件路径"""
        home = Path.home()
        uuid_prefix = self.session_id[:2].lower()

        return home / "Library/Application Support/ai.bloop.vibe-kanban" / \
               "sessions" / uuid_prefix / self.session_id / \
               "processes" / f"{self.execution_id}.jsonl"

    def extract_conversations(self) -> List[Dict]:
        """提取对话内容"""
        conversations = []

        with open(self.log_path, 'r') as f:
            for line in f:
                conv = self._parse_line(line)
                if conv:
                    conversations.append(conv)

        return conversations

    def _parse_line(self, line: str) -> Optional[Dict]:
        """解析单行日志"""
        try:
            outer = json.loads(line)
            stdout = outer.get('Stdout', '')
            if not stdout:
                return None

            inner = json.loads(stdout)
            msg_type = inner.get('type')

            if msg_type == 'assistant':
                return self._parse_assistant(inner)
            elif msg_type == 'user':
                return self._parse_user(inner)

        except json.JSONDecodeError:
            pass

        return None

    def _parse_assistant(self, data: dict) -> Optional[Dict]:
        """解析 AI 消息"""
        message = data.get('message', {})
        contents = message.get('content', [])

        texts = []
        for item in contents:
            if item.get('type') == 'text':
                text = item.get('text', '')
                if text.strip():
                    texts.append(text)

        if texts:
            return {
                'role': 'assistant',
                'content': '\n'.join(texts),
                'session_id': data.get('session_id', '')
            }

        return None

    def _parse_user(self, data: dict) -> Optional[Dict]:
        """解析用户消息"""
        message = data.get('message', {})
        content = message.get('content')

        if isinstance(content, str) and content.strip():
            return {
                'role': 'user',
                'content': content,
                'session_id': data.get('session_id', '')
            }

        return None


class HomeAssistantClient:
    """Home Assistant 客户端"""

    def __init__(self, url: str, token: str):
        self.url = url.rstrip('/')
        self.token = token
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def update_sensor(self, session_id: str, conversations: List[Dict]) -> bool:
        """更新传感器状态"""
        if not conversations:
            return False

        last_conv = conversations[-1]
        content = last_conv['content']
        if len(content) > 500:
            content = content[:500] + '...'

        entity_id = f"sensor.vibe_kanban_{session_id[:8]}"

        payload = {
            'state': 'active',
            'attributes': {
                'last_message': content,
                'last_role': last_conv['role'],
                'message_count': len(conversations),
                'updated_at': datetime.now().isoformat(),
                'session_id': session_id,
                'friendly_name': 'Vibe Kanban 对话',
                'icon': 'mdi:robot'
            }
        }

        response = requests.post(
            f'{self.url}/api/states/{entity_id}',
            headers=self.headers,
            json=payload,
            timeout=10
        )

        return response.status_code < 400


def main():
    # 配置
    SESSION_ID = "d7e7140c-669f-46ab-a7df-f76d31508a53"
    EXECUTION_ID = "5d1e5433-0e63-43f2-99fa-5b3c87b276e2"
    HA_URL = "http://homeassistant.local:8123"
    HA_TOKEN = "YOUR_LONG_LIVED_ACCESS_TOKEN"

    # 提取对话
    extractor = LogExtractor(SESSION_ID, EXECUTION_ID)
    conversations = extractor.extract_conversations()

    print(f"提取到 {len(conversations)} 条对话")

    # 打印最后 3 条
    for conv in conversations[-3:]:
        role = "AI" if conv['role'] == 'assistant' else "用户"
        content = conv['content'][:100] + "..." if len(conv['content']) > 100 else conv['content']
        print(f"[{role}] {content}")

    # 推送到 Home Assistant
    client = HomeAssistantClient(HA_URL, HA_TOKEN)
    if client.update_sensor(SESSION_ID, conversations):
        print("✅ 成功推送到 Home Assistant")
    else:
        print("❌ 推送失败")


if __name__ == '__main__':
    main()
```

---

## 7. 部署建议

### 7.1 定时轮询

```go
// 每 30 秒检查一次日志更新
func StartPolling(config Config, interval time.Duration) {
    ticker := time.NewTicker(interval)
    defer ticker.Stop()

    var lastModTime time.Time

    for range ticker.C {
        logPath := GetLogFilePath(config.SessionID, config.ExecutionID)

        // 检查文件修改时间
        info, err := os.Stat(logPath)
        if err != nil {
            continue
        }

        if info.ModTime().After(lastModTime) {
            lastModTime = info.ModTime()

            // 解析并推送
            convs, err := ParseLogMessages(logPath)
            if err == nil && len(convs) > 0 {
                PushToHomeAssistant(config, convs)
            }
        }
    }
}
```

### 7.2 文件监听 (推荐)

```go
import "github.com/fsnotify/fsnotify"

func WatchLogFile(config Config) {
    watcher, err := fsnotify.NewWatcher()
    if err != nil {
        log.Fatal(err)
    }
    defer watcher.Close()

    logPath := GetLogFilePath(config.SessionID, config.ExecutionID)
    watcher.Add(logPath)

    for {
        select {
        case event := <-watcher.Events:
            if event.Op&fsnotify.Write == fsnotify.Write {
                // 文件被修改，重新解析
                convs, _ := ParseLogMessages(logPath)
                if len(convs) > 0 {
                    PushToHomeAssistant(config, convs)
                }
            }
        case err := <-watcher.Errors:
            log.Println("Watcher error:", err)
        }
    }
}
```

### 7.3 WebSocket 实时流 (最佳)

```go
// 连接 Vibe Kanban WebSocket 获取实时日志
func StreamLogsRealtime(config Config) {
    port := GetVibeKanbanPort()
    url := fmt.Sprintf("ws://127.0.0.1:%d/api/execution-processes/%s/raw-logs/ws",
        port, config.ExecutionID)

    conn, _, err := websocket.DefaultDialer.Dial(url, nil)
    if err != nil {
        log.Fatal(err)
    }
    defer conn.Close()

    for {
        _, message, err := conn.ReadMessage()
        if err != nil {
            log.Println("Read error:", err)
            break
        }

        // 解析并推送到 Home Assistant
        conv := parseWebSocketMessage(message)
        if conv != nil {
            PushToHomeAssistant(config, []Conversation{*conv})
        }
    }
}
```

---

## 8. Home Assistant Lovelace 卡片配置

```yaml
type: entity
entity: sensor.vibe_kanban_d7e7140c
name: Vibe Kanban 对话
icon: mdi:robot
state_color: true
```

或自定义卡片：

```yaml
type: custom:markdown-card
title: Vibe Kanban 状态
content: |
  ## 🤖 最后消息
  **角色**: {{ state_attr('sensor.vibe_kanban_d7e7140c', 'last_role') }}

  **内容**:
  {{ state_attr('sensor.vibe_kanban_d7e7140c', 'last_message') }}

  ---

  📊 消息数: {{ state_attr('sensor.vibe_kanban_d7e7140c', 'message_count') }}
  🕐 更新于: {{ state_attr('sensor.vibe_kanban_d7e7140c', 'updated_at') }}
```

---

## 9. 常见问题

### Q1: 日志文件找不到？
- 确认 Vibe Kanban 正在运行
- 检查 session_id 和 execution_id 是否正确
- 确认路径中的 UUID 前缀是小写的

### Q2: JSON 解析失败？
- 某些行可能是纯文本而非 JSON，需要跳过
- 使用 `try-catch` 处理解析错误

### Q3: Home Assistant 推送失败？
- 检查 Long-Lived Access Token 是否有效
- 确认 Home Assistant URL 可访问
- 检查网络连接

---

## 10. 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2024-03-22 | 初始版本 |

---

**文档维护**: Claude Code
**最后更新**: 2024-03-22

# 工作区待办备忘录 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在工作区对话面板表头添加待办备忘录功能，用户可以快速记录、管理和发送待办事项

**Architecture:** 独立 Lit 组件 `workspace-todo-panel.ts` 通过自定义事件与对话面板通信。后端在 Go 服务中新增 CRUD API，MySQL 持久化。PC/移动端共用同一个组件，通过 CSS 媒体查询适配。

**Tech Stack:** Lit (前端) + Go net/http (后端) + MySQL (数据库)

**设计规格:** `docs/superpowers/plans/2026-03-27-workspace-todo-memo.md`

---

## Chunk 1: 后端 - 数据库与 API

### Task 1: 数据库建表

**Files:**
- Modify: `internal/store/store.go:41-186` (InitSchema)

- [ ] **Step 1: 在 InitSchema 的 statements 数组末尾添加建表语句**

在 `internal/store/store.go` 的 `InitSchema` 方法中，`kw_token_usage_daily` 建表语句之后，添加：

```go
`CREATE TABLE IF NOT EXISTS kw_workspace_todos (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL,
    content VARCHAR(500) NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_kw_todos_workspace (workspace_id),
    INDEX idx_kw_todos_workspace_completed (workspace_id, is_completed),
    CONSTRAINT fk_kw_todos_workspace
        FOREIGN KEY (workspace_id) REFERENCES kw_workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /Users/huajiejun/github/vibe-kanban/.vibe-kanban-workspaces/7c25-/kanban-watcher && go build ./...`
Expected: 编译成功，无错误

- [ ] **Step 3: Commit**

```bash
git add internal/store/store.go
git commit -m "feat(todos): 添加 kw_workspace_todos 建表语句"
```

---

### Task 2: Store 层 CRUD 方法

**Files:**
- Modify: `internal/store/store.go` (新增方法)

- [ ] **Step 1: 定义 WorkspaceTodo 结构体**

在 `internal/store/store.go` 文件顶部（Store 结构体定义之前）添加：

```go
// WorkspaceTodo 工作区待办事项
type WorkspaceTodo struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	Content     string    `json:"content"`
	IsCompleted bool      `json:"is_completed"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
```

- [ ] **Step 2: 实现 ListWorkspaceTodos 方法**

在 Store 类中添加（查询未完成待办，返回 pending_count）：

```go
// ListWorkspaceTodos 获取工作区待办列表
// includeCompleted 为 true 时返回全部，否则只返回未完成
func (s *Store) ListWorkspaceTodos(ctx context.Context, workspaceID string, includeCompleted bool) ([]WorkspaceTodo, int, error) {
	todos := make([]WorkspaceTodo, 0)

	// 先查未完成数量
	var pendingCount int
	err := s.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM kw_workspace_todos WHERE workspace_id = ? AND is_completed = FALSE",
		workspaceID,
	).Scan(&pendingCount)
	if err != nil {
		return nil, 0, fmt.Errorf("查询待办数量: %w", err)
	}

	query := "SELECT id, workspace_id, content, is_completed, created_at, updated_at FROM kw_workspace_todos WHERE workspace_id = ?"
	args := []interface{}{workspaceID}
	if !includeCompleted {
		query += " AND is_completed = FALSE"
	}
	query += " ORDER BY created_at ASC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("查询待办列表: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var t WorkspaceTodo
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.Content, &t.IsCompleted, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, 0, fmt.Errorf("扫描待办行: %w", err)
		}
		todos = append(todos, t)
	}

	return todos, pendingCount, rows.Err()
}
```

- [ ] **Step 3: 实现 CreateWorkspaceTodo 方法**

```go
// CreateWorkspaceTodo 创建待办事项
func (s *Store) CreateWorkspaceTodo(ctx context.Context, todo *WorkspaceTodo) error {
	_, err := s.db.ExecContext(ctx,
		"INSERT INTO kw_workspace_todos (id, workspace_id, content, is_completed) VALUES (?, ?, ?, FALSE)",
		todo.ID, todo.WorkspaceID, todo.Content,
	)
	if err != nil {
		return fmt.Errorf("创建待办: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: 实现 UpdateWorkspaceTodo 方法**

```go
// UpdateWorkspaceTodo 更新待办事项
func (s *Store) UpdateWorkspaceTodo(ctx context.Context, id string, content string, isCompleted bool) error {
	_, err := s.db.ExecContext(ctx,
		"UPDATE kw_workspace_todos SET content = ?, is_completed = ? WHERE id = ?",
		content, isCompleted, id,
	)
	if err != nil {
		return fmt.Errorf("更新待办: %w", err)
	}
	return nil
}
```

- [ ] **Step 5: 实现 DeleteWorkspaceTodo 方法**

```go
// DeleteWorkspaceTodo 删除待办事项
func (s *Store) DeleteWorkspaceTodo(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM kw_workspace_todos WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("删除待办: %w", err)
	}
	return nil
}
```

- [ ] **Step 6: 验证编译通过**

Run: `go build ./...`
Expected: 编译成功

- [ ] **Step 7: Commit**

```bash
git add internal/store/store.go
git commit -m "feat(todos): 实现待办事项 CRUD 数据库方法"
```

---

### Task 3: API 路由处理器

**Files:**
- Modify: `internal/server/server.go`

- [ ] **Step 1: 在 Start() 中注册新路由**

在 `internal/server/server.go` 的 `Start()` 方法中，`mux.HandleFunc("/api/workspace/", ...)` 之后添加：

```go
// 工作区待办事项接口
mux.HandleFunc("/api/workspaces/", s.handleWorkspacesRoute)
```

- [ ] **Step 2: 实现 handleWorkspacesRoute 分发方法**

在 server.go 中添加（注意路径 `/api/workspaces/` 已被 `GetMessageRoutes` 注册用于 latest-messages，需要区分）：

```go
// handleWorkspacesRoute 处理 /api/workspaces/ 下的子路由
//   GET  /api/workspaces/{id}/todos[?include_completed=true]
//   POST /api/workspaces/{id}/todos
//   PUT  /api/workspaces/{id}/todos/{todo_id}
//   DELETE /api/workspaces/{id}/todos/{todo_id}
func (s *Server) handleWorkspacesRoute(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		http.Error(w, "数据库未初始化", http.StatusInternalServerError)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/workspaces/")
	parts := strings.SplitN(path, "/", 3)

	// /api/workspaces/{id}/todos 或 /api/workspaces/{id}/todos/{todo_id}
	if len(parts) >= 2 && parts[1] == "todos" {
		workspaceID := parts[0]
		if workspaceID == "" {
			http.Error(w, "workspace_id is required", http.StatusBadRequest)
			return
		}

		if len(parts) == 3 && parts[2] != "" {
			// /api/workspaces/{id}/todos/{todo_id}
			s.handleTodoItem(w, r, workspaceID, parts[2])
			return
		}

		// /api/workspaces/{id}/todos
		s.handleTodoList(w, r, workspaceID)
		return
	}

	// 路径不匹配，尝试消息路由
	api.GetMessageRoutes(s.store, "")[r.URL.Path](w, r)
}
```

- [ ] **Step 3: 实现 handleTodoList (GET + POST)**

```go
func (s *Server) handleTodoList(w http.ResponseWriter, r *http.Request, workspaceID string) {
	switch r.Method {
	case http.MethodGet:
		includeCompleted := r.URL.Query().Get("include_completed") == "true"
		todos, pendingCount, err := s.store.ListWorkspaceTodos(r.Context(), workspaceID, includeCompleted)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"todos":         todos,
			"pending_count": pendingCount,
		})

	case http.MethodPost:
		var req struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Content) == "" {
			http.Error(w, "content is required", http.StatusBadRequest)
			return
		}
		todo := &store.WorkspaceTodo{
			ID:          generateUUID(),
			WorkspaceID: workspaceID,
			Content:     strings.TrimSpace(req.Content),
		}
		if err := s.store.CreateWorkspaceTodo(r.Context(), todo); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(todo)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
```

- [ ] **Step 4: 实现 handleTodoItem (PUT + DELETE)**

```go
func (s *Server) handleTodoItem(w http.ResponseWriter, r *http.Request, workspaceID, todoID string) {
	switch r.Method {
	case http.MethodPut:
		var req struct {
			Content     string `json:"content"`
			IsCompleted bool   `json:"is_completed"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if err := s.store.UpdateWorkspaceTodo(r.Context(), todoID, req.Content, req.IsCompleted); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": true})

	case http.MethodDelete:
		if err := s.store.DeleteWorkspaceTodo(r.Context(), todoID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
```

- [ ] **Step 5: 添加 UUID 生成辅助函数**

在 server.go 中添加（如果没有的话，检查项目是否已有）：

```go
func generateUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
```

注意：需要在 import 中添加 `"crypto/rand"`（如果尚未导入）。

- [ ] **Step 6: 验证编译通过**

Run: `go build ./...`
Expected: 编译成功

- [ ] **Step 7: Commit**

```bash
git add internal/server/server.go
git commit -m "feat(todos): 添加待办事项 CRUD API 路由"
```

---

### Task 4: 路由冲突修复

**Files:**
- Modify: `internal/api/messages.go`
- Modify: `internal/server/server.go`

- [ ] **Step 1: 评估路由冲突**

`/api/workspaces/` 路径同时被 `GetMessageRoutes` 注册（用于 latest-messages）和新的待办 API 使用。需要确保不冲突。

当前 `GetMessageRoutes` 注册了 `/api/workspaces/` 处理器，它内部解析子路径。新的 `handleWorkspacesRoute` 需要在 `GetMessageRoutes` 注册之前匹配，或者将待办路由注册为更具体的路径。

**解决方案：** 将待办路由注册为 `/api/workspaces/` 但在 `GetMessageRoutes` 注册之前，且在 handler 内部判断是否匹配 `/todos` 子路径。如果不匹配则回退到 `GetMessageRoutes` 的处理器。

但实际上 `Start()` 中 `mux.HandleFunc` 的注册顺序决定了匹配优先级。Go 的 `http.ServeMux` 使用最长路径匹配，所以 `/api/workspace/` 和 `/api/workspaces/` 不会冲突（注意 `workspace` vs `workspaces`）。

**关键发现：** 现有路由 `/api/workspace/`（单数）和新路由 `/api/workspaces/`（复数）不冲突。但 `GetMessageRoutes` 也注册了 `/api/workspaces/` 用于 latest-messages。Go ServeMux 会选择最后注册的 handler。

**修正方案：** 不在 `Start()` 中注册 `/api/workspaces/`，而是在 `GetMessageRoutes` 返回的 map 中添加待办路由，或者在 `GetMessageRoutes` 的 `/api/workspaces/` handler 内部分发。

**最优方案：** 在 `GetMessageRoutes` 的 `/api/workspaces/` handler (`handleWorkspaceLatestMessages`) 中，添加 `/todos` 子路径判断，分发到待办处理器。

- [ ] **Step 2: 在 handleWorkspaceLatestMessages 中添加待办路由分发**

修改 `internal/api/messages.go` 中的 `/api/workspaces/` handler，在函数开头添加待办路由判断：

```go
"/api/workspaces/": func(w http.ResponseWriter, r *http.Request) {
    path := strings.TrimPrefix(r.URL.Path, "/api/workspaces/")
    parts := strings.SplitN(path, "/", 3)
    if len(parts) >= 2 && parts[1] == "todos" {
        handleWorkspaceTodos(w, r, dbStore, parts[0], parts)
        return
    }
    handleWorkspaceLatestMessages(w, r, dbStore)
},
```

- [ ] **Step 3: 实现 handleWorkspaceTodos 和 handleWorkspaceTodoItem**

在 `messages.go` 中添加：

```go
func handleWorkspaceTodos(w http.ResponseWriter, r *http.Request, dbStore *store.Store, workspaceID string, parts []string) {
    if workspaceID == "" {
        http.Error(w, "workspace_id is required", http.StatusBadRequest)
        return
    }

    // /api/workspaces/{id}/todos/{todo_id}
    if len(parts) == 3 && parts[2] != "" {
        handleWorkspaceTodoItem(w, r, dbStore, workspaceID, parts[2])
        return
    }

    // /api/workspaces/{id}/todos
    switch r.Method {
    case http.MethodGet:
        includeCompleted := r.URL.Query().Get("include_completed") == "true"
        todos, pendingCount, err := dbStore.ListWorkspaceTodos(r.Context(), workspaceID, includeCompleted)
        if err != nil {
            http.Error(w, err.Error(), http.StatusInternalServerError)
            return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{
            "todos":         todos,
            "pending_count": pendingCount,
        })

    case http.MethodPost:
        var req struct {
            Content string `json:"content"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            http.Error(w, "Invalid JSON", http.StatusBadRequest)
            return
        }
        if strings.TrimSpace(req.Content) == "" {
            http.Error(w, "content is required", http.StatusBadRequest)
            return
        }
        todo := &store.WorkspaceTodo{
            ID:          generateTodoUUID(),
            WorkspaceID: workspaceID,
            Content:     strings.TrimSpace(req.Content),
        }
        if err := dbStore.CreateWorkspaceTodo(r.Context(), todo); err != nil {
            http.Error(w, err.Error(), http.StatusInternalServerError)
            return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(todo)

    default:
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
    }
}

func handleWorkspaceTodoItem(w http.ResponseWriter, r *http.Request, dbStore *store.Store, workspaceID, todoID string) {
    switch r.Method {
    case http.MethodPut:
        var req struct {
            Content     string `json:"content"`
            IsCompleted bool   `json:"is_completed"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            http.Error(w, "Invalid JSON", http.StatusBadRequest)
            return
        }
        if err := dbStore.UpdateWorkspaceTodo(r.Context(), todoID, req.Content, req.IsCompleted); err != nil {
            http.Error(w, err.Error(), http.StatusInternalServerError)
            return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]bool{"success": true})

    case http.MethodDelete:
        if err := dbStore.DeleteWorkspaceTodo(r.Context(), todoID); err != nil {
            http.Error(w, err.Error(), http.StatusInternalServerError)
            return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]bool{"success": true})

    default:
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
    }
}

func generateTodoUUID() string {
    b := make([]byte, 16)
    _, _ = rand.Read(b)
    return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
        b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
```

注意：需要在 import 中添加 `"crypto/rand"` 和 `"fmt"`（如果尚未导入）。

- [ ] **Step 4: 回退 Task 3 的 server.go 修改**

如果 Task 3 已经在 server.go 中注册了 `/api/workspaces/` 路由，需要移除，因为待办路由现在通过 `GetMessageRoutes` 注册。

- [ ] **Step 5: 验证编译通过**

Run: `go build ./...`
Expected: 编译成功

- [ ] **Step 6: Commit**

```bash
git add internal/api/messages.go internal/server/server.go
git commit -m "feat(todos): 在 GetMessageRoutes 中注册待办 API 路由"
```

---

## Chunk 2: 前端 - 类型定义与 API 客户端

### Task 5: TypeScript 类型定义

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: 添加 WorkspaceTodo 类型**

在 `src/types.ts` 文件末尾添加：

```typescript
/** 工作区待办事项 */
export interface WorkspaceTodo {
  id: string;
  workspace_id: string;
  content: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

/** 待办列表响应 */
export interface WorkspaceTodosResponse {
  todos: WorkspaceTodo[];
  pending_count: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat(todos): 添加 WorkspaceTodo 类型定义"
```

---

### Task 6: 前端 API 客户端

**Files:**
- Modify: `src/lib/http-api.ts`

- [ ] **Step 1: 添加类型导入**

在 `src/lib/http-api.ts` 的 import 中添加 `WorkspaceTodosResponse, WorkspaceTodo`：

```typescript
import type {
  // ... 现有导入
  WorkspaceTodosResponse,
} from "../types";
```

- [ ] **Step 2: 添加 fetchWorkspaceTodos 函数**

```typescript
export async function fetchWorkspaceTodos({
  baseUrl,
  apiKey,
  workspaceId,
  includeCompleted,
}: RequestOptions & {
  workspaceId: string;
  includeCompleted?: boolean;
}): Promise<WorkspaceTodosResponse> {
  const query = new URLSearchParams();
  if (includeCompleted) {
    query.set("include_completed", "true");
  }
  const queryString = query.toString();
  const url = `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/todos${queryString ? `?${queryString}` : ""}`;
  return fetchJSON<WorkspaceTodosResponse>(url, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });
}
```

- [ ] **Step 3: 添加 createWorkspaceTodo 函数**

```typescript
export async function createWorkspaceTodo({
  baseUrl,
  apiKey,
  workspaceId,
  content,
}: RequestOptions & {
  workspaceId: string;
  content: string;
}): Promise<WorkspaceTodo> {
  return fetchJSON<WorkspaceTodo>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/todos`,
    {
      method: "POST",
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({ content }),
    },
  );
}
```

- [ ] **Step 4: 添加 updateWorkspaceTodo 函数**

```typescript
export async function updateWorkspaceTodo({
  baseUrl,
  apiKey,
  workspaceId,
  todoId,
  content,
  isCompleted,
}: RequestOptions & {
  workspaceId: string;
  todoId: string;
  content: string;
  isCompleted: boolean;
}): Promise<{ success: boolean }> {
  return fetchJSON<{ success: boolean }>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/todos/${todoId}`,
    {
      method: "PUT",
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify({ content, is_completed: isCompleted }),
    },
  );
}
```

- [ ] **Step 5: 添加 deleteWorkspaceTodo 函数**

```typescript
export async function deleteWorkspaceTodo({
  baseUrl,
  apiKey,
  workspaceId,
  todoId,
}: RequestOptions & {
  workspaceId: string;
  todoId: string;
}): Promise<{ success: boolean }> {
  return fetchJSON<{ success: boolean }>(
    `${normalizeBaseUrl(baseUrl)}/api/workspaces/${workspaceId}/todos/${todoId}`,
    {
      method: "DELETE",
      headers: buildHeaders(apiKey),
    },
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/http-api.ts
git commit -m "feat(todos): 添加待办事项前端 API 客户端函数"
```

---

## Chunk 3: 前端 - 待办面板组件

### Task 7: 创建 workspace-todo-panel.ts 组件

**Files:**
- Create: `src/components/workspace-todo-panel.ts`

- [ ] **Step 1: 创建组件文件**

创建 `src/components/workspace-todo-panel.ts`，实现完整的待办面板组件。

组件需要：
- `workspaceId` 属性
- `baseUrl` 和 `apiKey` 属性（用于 API 调用）
- `open` 属性控制显示
- `pendingCount` 属性（用于外部显示角标）
- 自定义事件：`todo-selected`（发送待办内容）、`todo-count-change`（待办数量变化）
- Modal 弹窗 UI（复用 file-browser-overlay 的样式模式）
- 新增输入框（回车或按钮添加）
- 待办列表（支持点击发送、hover 显示操作按钮）
- 编辑模式（inline edit）
- 完成归档区域（折叠显示，可恢复）
- 响应式适配（640px 断点）

参考现有 `todo-progress-popup.ts` 的 SVG icons 和 `workspace-conversation-pane.ts` 中 `renderFileBrowser()` 的 modal 模式。

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/components/workspace-todo-panel.ts
git commit -m "feat(todos): 创建待办面板 Lit 组件"
```

---

## Chunk 4: 前端 - 集成到对话面板

### Task 8: 对话面板添加待办按钮

**Files:**
- Modify: `src/components/workspace-conversation-pane.ts`

- [ ] **Step 1: 导入待办面板组件**

在文件顶部添加导入：

```typescript
import "./workspace-todo-panel";
```

- [ ] **Step 2: 添加新属性**

在 static properties 中添加：

```typescript
workspaceId: { attribute: false },
todoBaseUrl: { attribute: false },
todoApiKey: { attribute: false },
todoPendingCount: { attribute: false },
showTodoPanel: { type: Boolean, state: true },
```

在属性声明中添加默认值：

```typescript
workspaceId = "";
todoBaseUrl = "";
todoApiKey = "";
todoPendingCount = 0;
private showTodoPanel = false;
```

- [ ] **Step 3: 在表头按钮区域添加待办按钮**

在 `render()` 方法中，文件浏览器按钮之前添加：

```html
<button
  class="dialog-action-icon"
  type="button"
  aria-label="待办事项"
  title="待办事项"
  @click=${this.toggleTodoPanel}
>
  📋${this.todoPendingCount > 0
    ? html`<span class="todo-badge">${this.todoPendingCount}</span>`
    : nothing}
</button>
```

- [ ] **Step 4: 添加待办面板渲染**

在 `render()` 中 `${this.showFileBrowser ? this.renderFileBrowser() : nothing}` 之后添加：

```html
${this.showTodoPanel
  ? html`
      <workspace-todo-panel
        .workspaceId=${this.workspaceId}
        .baseUrl=${this.todoBaseUrl}
        .apiKey=${this.todoApiKey}
        .open=${this.showTodoPanel}
        @todo-selected=${this.handleTodoSelected}
        @todo-count-change=${this.handleTodoCountChange}
        @close=${() => { this.showTodoPanel = false; }}
      ></workspace-todo-panel>
    `
  : nothing}
```

- [ ] **Step 5: 添加事件处理方法**

```typescript
private toggleTodoPanel = () => {
  this.showTodoPanel = !this.showTodoPanel;
};

private handleTodoSelected = (event: CustomEvent<{ content: string; todoId: string }>) => {
  // 关闭面板
  this.showTodoPanel = false;
  // 通知父组件发送消息并标记完成
  this.dispatchEvent(
    new CustomEvent("todo-selected", {
      detail: event.detail,
      bubbles: true,
      composed: true,
    }),
  );
};

private handleTodoCountChange = (event: CustomEvent<{ count: number }>) => {
  this.todoPendingCount = event.detail.count;
};
```

- [ ] **Step 6: Commit**

```bash
git add src/components/workspace-conversation-pane.ts
git commit -m "feat(todos): 对话面板添加待办按钮和面板集成"
```

---

### Task 9: workspace-home.ts 集成

**Files:**
- Modify: `src/web/workspace-home.ts`

- [ ] **Step 1: 导入待办 API 函数**

```typescript
import {
  // ... 现有导入
  fetchWorkspaceTodos,
} from "../lib/http-api";
```

- [ ] **Step 2: 在 renderWorkspacePane 中传递新属性**

在 `workspace-conversation-pane` 标签上添加：

```html
.workspaceId=${workspace.id}
.todoBaseUrl=${this.previewOptions.baseUrl ?? ""}
.todoApiKey=${this.previewOptions.apiKey}
.todoPendingCount=${this.todoPendingCountByWorkspace[workspace.id] ?? 0}
@todo-selected=${(event: CustomEvent<{ content: string; todoId: string }>) =>
  void this.handleTodoSelected(workspace, event.detail)}
```

- [ ] **Step 3: 添加 todoPendingCountByWorkspace 状态**

在 properties 中添加：

```typescript
todoPendingCountByWorkspace: { state: true },
```

初始化：

```typescript
private todoPendingCountByWorkspace: Record<string, number> = {};
```

- [ ] **Step 4: 添加 handleTodoSelected 方法**

```typescript
private async handleTodoSelected(workspace: KanbanWorkspace, detail: { content: string; todoId: string }) {
  // 设置消息草稿并发送
  this.messageDraftByWorkspace = {
    ...this.messageDraftByWorkspace,
    [workspace.id]: detail.content,
  };
  await this.handlePaneAction(workspace, "send");
}
```

- [ ] **Step 5: 在消息轮询中加载待办数量**

在合适的轮询位置（如 loadWorkspaceMessages 成功后）添加待办数量加载：

```typescript
private async loadTodoPendingCount(workspaceId: string) {
  try {
    const response = await fetchWorkspaceTodos({
      baseUrl: this.previewOptions.baseUrl!,
      apiKey: this.previewOptions.apiKey,
      workspaceId,
    });
    this.todoPendingCountByWorkspace = {
      ...this.todoPendingCountByWorkspace,
      [workspaceId]: response.pending_count ?? 0,
    };
  } catch {
    // 静默失败
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/web/workspace-home.ts
git commit -m "feat(todos): workspace-home 集成待办功能"
```

---

### Task 10: kanban-watcher-card.ts 集成

**Files:**
- Modify: `src/kanban-watcher-card.ts`

- [ ] **Step 1: 导入待办 API 函数**

```typescript
import {
  // ... 现有导入
  fetchWorkspaceTodos,
} from "./lib/http-api";
```

- [ ] **Step 2: 在 workspace-conversation-pane 标签上传递新属性**

```html
.workspaceId=${workspace.id}
.todoBaseUrl=${this.baseUrl}
.todoApiKey=${this.apiKey}
.todoPendingCount=${this.todoPendingCount}
@todo-selected=${(event: CustomEvent<{ content: string; todoId: string }>) =>
  void this.handleTodoSelected(event.detail)}
```

- [ ] **Step 3: 添加 todoPendingCount 状态和 handleTodoSelected 方法**

```typescript
private todoPendingCount = 0;

private async handleTodoSelected(detail: { content: string; todoId: string }) {
  this.messageDraft = detail.content;
  await this.handleActionClick("send");
}
```

- [ ] **Step 4: 在打开工作区对话框时加载待办数量**

在 `openWorkspaceDialog` 相关方法中添加待办数量加载。

- [ ] **Step 5: Commit**

```bash
git add src/kanban-watcher-card.ts
git commit -m "feat(todos): 移动端卡片集成待办功能"
```

---

## Chunk 5: 样式

### Task 11: 添加待办面板样式

**Files:**
- Modify: `src/styles.ts`

- [ ] **Step 1: 添加待办面板 modal 样式**

参考文件浏览器样式（`.file-browser-overlay`, `.file-browser-modal`），在 `styles.ts` 中添加待办面板的 modal 样式。包括：
- `.todo-panel-overlay` — 复用 overlay 模式
- `.todo-panel-modal` — 弹窗容器（480px 宽，最大 600px 高）
- `.todo-panel-header` — 头部区域
- `.todo-panel-input-area` — 新增输入区域
- `.todo-list` — 待办列表
- `.todo-item` — 单个待办项
- `.todo-item-actions` — hover 时显示的操作按钮
- `.todo-item-edit` — 编辑模式输入框
- `.todo-archive` — 已归档区域
- `.todo-badge` — 表头按钮角标
- 移动端适配（≤640px）

- [ ] **Step 2: Commit**

```bash
git add src/styles.ts
git commit -m "feat(todos): 添加待办面板样式"
```

---

## Chunk 6: 手动验证

### Task 12: 启动服务手动测试

- [ ] **Step 1: 启动后端服务**

Run: `go run ./cmd/kanban-watcher`

- [ ] **Step 2: 验证数据库建表**

检查 MySQL 中 `kw_workspace_todos` 表是否已创建。

- [ ] **Step 3: 验证 API 接口**

使用 curl 测试 CRUD 接口：
- POST 创建待办
- GET 获取待办列表
- PUT 更新待办
- DELETE 删除待办

- [ ] **Step 4: 启动前端开发服务**

Run: `npm run dev`

- [ ] **Step 5: 验证前端功能**

- 表头待办按钮显示
- 点击打开 modal
- 新增待办
- 编辑待办
- 标记完成（移到归档区域）
- 点击待办发送消息
- 角标数字显示
- 移动端适配

- [ ] **Step 6: 截图保存**

截图保存到 `./test-images/待办备忘录/` 目录下。

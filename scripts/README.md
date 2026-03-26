# 启动脚本说明

## start-dev.sh

根据 worktree ID 自动分配固定端口的前后端启动脚本。

### 用法

```bash
# 方式1: 自动检测 worktree ID
./scripts/start-dev.sh

# 方式2: 指定 worktree ID
./scripts/start-dev.sh 5590
```

### 端口规则

| Worktree ID | 后端端口 | 前端端口 |
|------------|---------|---------|
| 1467 | 18615 | 16615 |
| 5590 | 18508 | 16508 |
| 5655 | 18979 | 16979 |

- 后端端口: 18000-18999 (根据 worktree_id hash)
- 前端端口: 后端端口 - 2000 (16000-16999)
- 同一个 worktree_id 总是获得相同的端口

### 访问方式

#### 本地访问
- 前端: http://localhost:16615
- 后端: http://localhost:18615

#### 外网访问 (通过 Nginx 代理)
- http://47.96.112.110:2453/16615/

### 日志文件

- 后端: `/tmp/kanban-backend-{port}.log`
- 前端: `/tmp/kanban-frontend-{port}.log`

### 停止服务

```bash
# 停止后端
kill $(lsof -t -i :18615)

# 停止前端
kill $(lsof -t -i :16615)
```

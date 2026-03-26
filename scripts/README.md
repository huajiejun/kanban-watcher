# 启动脚本说明

## start-dev.sh

根据工作区 ID 自动分配固定端口的前后端启动脚本。

### 用法

```bash
# 启动服务
./scripts/start-dev.sh start 1467

# 埥看状态
./scripts/start-dev.sh status 1467

# 埥看所有运行中的服务
./scripts/start-dev.sh status

# 停止服务
./scripts/start-dev.sh stop 1467

# 重启服务
./scripts/start-dev.sh restart 1467
```

如果不指定 worktree_id，脚本会自动从当前目录名推断。

### 命令说明

| 命令 | 说明 |
|-----|------|
| `start` | 启动前后端服务 |
| `stop` | 停止前后端服务 |
| `status` | 查看服务状态（不指定 ID 则显示所有） |
| `restart` | 重启服务 |

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
- PID 文件: `/tmp/kanban-dev/`

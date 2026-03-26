#!/bin/bash
# 多后端开发启动脚本
# 用法: ./scripts/start-dev.sh [start|stop|status|restart] [worktree_id]
#
# 端口规则:
# - 后端端口: 18000-18999 (根据 worktree_id hash)
# - 前端端口: 后端端口 - 2000 (16000-16999)
# - 同一个 worktree_id 总是获得相同的端口

set -e

# 获取命令
COMMAND="${1:-start}"
WORKTREE_ID="${2:-}"

# 如果第一个参数不是命令，则当作 worktree_id
if [[ "$COMMAND" != "start" && "$COMMAND" != "stop" && "$COMMAND" != "status" && "$COMMAND" != "restart" ]]; then
    WORKTREE_ID="$COMMAND"
    COMMAND="start"
fi

if [ -z "$WORKTREE_ID" ]; then
    # 优先从 git 分支名获取 worktree_id
    # 分支名格式: vibe/1467-nginx -> 提取 1467
    BRANCH_NAME=$(git branch --show-current 2>/dev/null || echo "")
    if [[ "$BRANCH_NAME" =~ ^vibe/([0-9a-f]{4})- ]]; then
        WORKTREE_ID="${BASH_REMATCH[1]}"
    elif [[ "$BRANCH_NAME" =~ ^([0-9a-f]{4})- ]]; then
        WORKTREE_ID="${BASH_REMATCH[1]}"
    else
        # 尝试从当前目录名获取 worktree_id
        CURRENT_DIR=$(basename $(dirname $(pwd)))
        if [[ "$CURRENT_DIR" =~ ^([0-9a-f]{4})- ]]; then
            WORKTREE_ID="${BASH_REMATCH[1]}"
        else
            # 使用目录名的 hash
            WORKTREE_ID=$(echo "$(pwd)" | cksum | cut -d' ' -f1 | xargs printf '%04x' | cut -c1-4)
        fi
    fi
fi

# 计算端口 (基于 worktree_id 的 hash)
HASH=$(echo -n "$WORKTREE_ID" | cksum | cut -d' ' -f1)
PORT_OFFSET=$((HASH % 1000))

# 后端端口: 18000-18999
BACKEND_PORT=$((18000 + PORT_OFFSET))
# 前端端口: 后端 - 2000 = 16000-16999
FRONTEND_PORT=$((BACKEND_PORT - 2000))

# PID 文件
PID_DIR="/tmp/kanban-dev"
mkdir -p "$PID_DIR"
BACKEND_PID_FILE="$PID_DIR/backend-$BACKEND_PORT.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend-$FRONTEND_PORT.pid"
BACKEND_STDERR_TEE_PID_FILE="$PID_DIR/backend-stderr-tee-$BACKEND_PORT.pid"
BACKEND_LOG_FILE="/tmp/kanban-backend-$BACKEND_PORT.log"
FRONTEND_LOG_FILE="/tmp/kanban-frontend-$FRONTEND_PORT.log"
BACKEND_STDERR_PIPE="/tmp/kanban-backend-$BACKEND_PORT.stderr.pipe"

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        return 1
    fi
    return 0
}

# 获取端口占用的 PID
get_port_pid() {
    local port=$1
    lsof -t -i :$port 2>/dev/null || echo ""
}

cleanup_backend_stderr_mirror() {
    local mirror_pid=""

    if [ -f "$BACKEND_STDERR_TEE_PID_FILE" ]; then
        mirror_pid=$(cat "$BACKEND_STDERR_TEE_PID_FILE" 2>/dev/null || echo "")
    fi

    if [ -n "$mirror_pid" ] && kill -0 "$mirror_pid" 2>/dev/null; then
        kill "$mirror_pid" 2>/dev/null || true
    fi

    rm -f "$BACKEND_STDERR_TEE_PID_FILE" "$BACKEND_STDERR_PIPE"
}

start_backend_stderr_mirror() {
    cleanup_backend_stderr_mirror

    mkfifo "$BACKEND_STDERR_PIPE"
    tee -a "$BACKEND_LOG_FILE" < "$BACKEND_STDERR_PIPE" >&2 &
    echo $! > "$BACKEND_STDERR_TEE_PID_FILE"
}

# 显示状态
show_status() {
    echo "============================================"
    echo "Worktree ID: $WORKTREE_ID"
    echo "后端端口: $BACKEND_PORT"
    echo "前端端口: $FRONTEND_PORT"
    echo "============================================"

    # 检查后端状态
    BACKEND_PID=$(get_port_pid $BACKEND_PORT)
    if [ -n "$BACKEND_PID" ]; then
        echo "✅ 后端运行中 (PID: $BACKEND_PID)"
    else
        echo "❌ 后端未运行"
    fi

    # 检查前端状态
    FRONTEND_PID=$(get_port_pid $FRONTEND_PORT)
    if [ -n "$FRONTEND_PID" ]; then
        echo "✅ 前端运行中 (PID: $FRONTEND_PID)"
    else
        echo "❌ 前端未运行"
    fi

    echo ""
    echo "访问地址:"
    echo "  本地前端: http://localhost:$FRONTEND_PORT"
    echo "  本地后端: http://localhost:$BACKEND_PORT"
    echo "  外网访问: http://47.96.112.110:2453/$FRONTEND_PORT/"
    echo "============================================"
}

# 停止服务
stop_services() {
    echo "停止服务..."

    # 停止后端
    BACKEND_PID=$(get_port_pid $BACKEND_PORT)
    if [ -n "$BACKEND_PID" ]; then
        echo "停止后端 (PID: $BACKEND_PID)..."
        kill $BACKEND_PID 2>/dev/null || true
        sleep 1
        # 强制杀死
        if kill -0 $BACKEND_PID 2>/dev/null; then
            kill -9 $BACKEND_PID 2>/dev/null || true
        fi
        echo "✅ 后端已停止"
    else
        echo "后端未运行"
    fi

    # 停止前端
    FRONTEND_PID=$(get_port_pid $FRONTEND_PORT)
    if [ -n "$FRONTEND_PID" ]; then
        echo "停止前端 (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID 2>/dev/null || true
        sleep 1
        # 强制杀死
        if kill -0 $FRONTEND_PID 2>/dev/null; then
            kill -9 $FRONTEND_PID 2>/dev/null || true
        fi
        echo "✅ 前端已停止"
    else
        echo "前端未运行"
    fi

    # 清理 PID 文件
    rm -f "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"
    cleanup_backend_stderr_mirror
}

# 启动后端
start_backend() {
    echo "启动后端服务 (端口: $BACKEND_PORT)..."

    # 检查端口
    if ! check_port $BACKEND_PORT; then
        echo "❌ 后端端口 $BACKEND_PORT 已被占用"
        return 1
    fi

    # 设置环境变量
    export KANBAN_PORT=$BACKEND_PORT

    start_backend_stderr_mirror

    # 在后台启动 Go 服务
    cd "$(dirname "$0")/.."
    go run ./cmd/kanban-watcher >> "$BACKEND_LOG_FILE" 2> "$BACKEND_STDERR_PIPE" &
    BACKEND_PID=$!
    echo $BACKEND_PID > "$BACKEND_PID_FILE"
    echo "后端 PID: $BACKEND_PID"

    # 等待后端启动
    sleep 2

    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "❌ 后端启动失败，查看日志:"
        cat "$BACKEND_LOG_FILE"
        cleanup_backend_stderr_mirror
        return 1
    fi

    echo "✅ 后端启动成功"
}

# 启动前端
start_frontend() {
    echo "启动前端服务 (端口: $FRONTEND_PORT)..."

    # 检查端口
    if ! check_port $FRONTEND_PORT; then
        echo "❌ 前端端口 $FRONTEND_PORT 已被占用"
        return 1
    fi

    cd "$(dirname "$0")/.."

    # 设置环境变量给 Vite
    export VITE_BACKEND_PORT=$BACKEND_PORT

    # 启动 Vite 开发服务器 (使用 web 配置，支持 dev server)
    npx vite --config vite.config.web.ts --port $FRONTEND_PORT \
        > >(tee -a "$FRONTEND_LOG_FILE") \
        2> >(tee -a "$FRONTEND_LOG_FILE" >&2) &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$FRONTEND_PID_FILE"
    echo "前端 PID: $FRONTEND_PID"

    sleep 2

    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "❌ 前端启动失败，查看日志:"
        cat "$FRONTEND_LOG_FILE"
        return 1
    fi

    echo "✅ 前端启动成功"
}

# 启动服务
start_services() {
    echo "============================================"
    echo "Worktree ID: $WORKTREE_ID"
    echo "后端端口: $BACKEND_PORT"
    echo "前端端口: $FRONTEND_PORT"
    echo "============================================"

    start_backend || exit 1
    start_frontend || exit 1

    echo ""
    echo "============================================"
    echo "🚀 服务启动完成!"
    echo ""
    echo "本地访问:"
    echo "  前端: http://localhost:$FRONTEND_PORT"
    echo "  后端: http://localhost:$BACKEND_PORT"
    echo ""
    echo "外网访问 (通过 Nginx 代理):"
    echo "  http://47.96.112.110:2453/$FRONTEND_PORT/"
    echo ""
    echo "日志文件:"
    echo "  后端: $BACKEND_LOG_FILE"
    echo "  前端: $FRONTEND_LOG_FILE"
    echo ""
    echo "管理命令:"
    echo "  停止: ./scripts/start-dev.sh stop $WORKTREE_ID"
    echo "  状态: ./scripts/start-dev.sh status $WORKTREE_ID"
    echo "  重启: ./scripts/start-dev.sh restart $WORKTREE_ID"
    echo "============================================"
}

# 主逻辑
case "$COMMAND" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    status)
        show_status
        ;;
    restart)
        stop_services
        sleep 1
        start_services
        ;;
    *)
        echo "用法: $0 [start|stop|status|restart] [worktree_id]"
        echo ""
        echo "命令:"
        echo "  start   - 启动服务 (默认)"
        echo "  stop    - 停止服务"
        echo "  status  - 查看状态"
        echo "  restart - 重启服务"
        exit 1
        ;;
esac

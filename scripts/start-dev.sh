#!/bin/bash
# 根据工作区ID自动分配固定端口的启动脚本
# 用法: ./scripts/start-dev.sh [worktree_id]
#
# 端口规则:
# - 后端端口: 18000-18999 (根据 worktree_id hash)
# - 前端端口: 后端端口 - 2000 (16000-16999)
# - 同一个 worktree_id 总是获得相同的端口

set -e

# 获取工作区ID
WORKTREE_ID="${1:-}"

if [ -z "$WORKTREE_ID" ]; then
    # 尝试从当前目录名获取 worktree_id
    CURRENT_DIR=$(basename $(dirname $(pwd)))
    if [[ "$CURRENT_DIR" =~ ^[a-f0-9]{4}- ]]; then
        WORKTREE_ID=$(echo "$CURRENT_DIR" | cut -d'-' -f1)
    else
        # 使用目录名的 hash
        WORKTREE_ID=$(echo "$(pwd)" | cksum | cut -d' ' -f1 | xargs printf '%04x' | cut -c1-4)
    fi
fi

# 计算端口 (基于 worktree_id 的 hash)
# 使用简单的 hash 算法确保同一个 ID 总是得到相同的结果
HASH=$(echo -n "$WORKTREE_ID" | cksum | cut -d' ' -f1)
PORT_OFFSET=$((HASH % 1000))

# 后端端口: 18000-18999
BACKEND_PORT=$((18000 + PORT_OFFSET))
# 前端端口: 后端 - 2000 = 16000-16999
FRONTEND_PORT=$((BACKEND_PORT - 2000))

echo "============================================"
echo "Worktree ID: $WORKTREE_ID"
echo "后端端口: $BACKEND_PORT"
echo "前端端口: $FRONTEND_PORT"
echo "============================================"

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        return 1
    fi
    return 0
}

# 启动后端
start_backend() {
    echo "启动后端服务 (端口: $BACKEND_PORT)..."

    # 设置环境变量
    export KANBAN_PORT=$BACKEND_PORT

    # 在后台启动 Go 服务
    cd "$(dirname "$0")/.."
    nohup go run ./cmd/kanban-watcher > /tmp/kanban-backend-$BACKEND_PORT.log 2>&1 &
    BACKEND_PID=$!
    echo "后端 PID: $BACKEND_PID"

    # 等待后端启动
    sleep 2

    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "❌ 后端启动失败，查看日志:"
        cat /tmp/kanban-backend-$BACKEND_PORT.log
        exit 1
    fi

    echo "✅ 后端启动成功"
}

# 启动前端
start_frontend() {
    echo "启动前端服务 (端口: $FRONTEND_PORT)..."

    cd "$(dirname "$0")/.."

    # 设置环境变量给 Vite
    export VITE_BACKEND_PORT=$BACKEND_PORT

    # 启动 Vite 开发服务器
    nohup npm run dev -- --port $FRONTEND_PORT > /tmp/kanban-frontend-$FRONTEND_PORT.log 2>&1 &
    FRONTEND_PID=$!
    echo "前端 PID: $FRONTEND_PID"

    sleep 2

    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "❌ 前端启动失败，查看日志:"
        cat /tmp/kanban-frontend-$FRONTEND_PORT.log
        exit 1
    fi

    echo "✅ 前端启动成功"
}

# 主逻辑
main() {
    # 检查端口
    if ! check_port $BACKEND_PORT; then
        echo "⚠️  后端端口 $BACKEND_PORT 已被占用"
        echo "   进程信息: $(lsof -i :$BACKEND_PORT | tail -1)"
        read -p "是否终止占用进程? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill $(lsof -t -i :$BACKEND_PORT)
            sleep 1
        else
            echo "❌ 无法启动，端口被占用"
            exit 1
        fi
    fi

    if ! check_port $FRONTEND_PORT; then
        echo "⚠️  前端端口 $FRONTEND_PORT 已被占用"
        echo "   进程信息: $(lsof -i :$FRONTEND_PORT | tail -1)"
        read -p "是否终止占用进程? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill $(lsof -t -i :$FRONTEND_PORT)
            sleep 1
        else
            echo "❌ 无法启动，端口被占用"
            exit 1
        fi
    fi

    # 启动服务
    start_backend
    start_frontend

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
    echo "  后端: /tmp/kanban-backend-$BACKEND_PORT.log"
    echo "  前端: /tmp/kanban-frontend-$FRONTEND_PORT.log"
    echo "============================================"
}

main

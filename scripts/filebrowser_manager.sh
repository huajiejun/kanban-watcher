#!/bin/bash
#===============================================================================
# File Browser 管理脚本
# 用于在 Mac 上启动 Web 文件浏览器
#===============================================================================

set -e

# 配置
FB_PORT="${FB_PORT:-8080}"
FB_ROOT="${FB_ROOT:-${HOME}}"  # 默认访问用户主目录
FB_CONFIG="${HOME}/.filebrowser/filebrowser.json"
FB_LOG="${HOME}/.filebrowser/filebrowser.log"
FB_DB_DIR="${HOME}/.filebrowser"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 File Browser 是否安装
check_installation() {
    if ! command -v filebrowser &> /dev/null; then
        log_error "File Browser 未安装"
        echo ""
        echo "请先安装 File Browser："
        echo "  brew install filebrowser"
        echo ""
        echo "或下载二进制文件："
        echo "  https://github.com/filebrowser/filebrowser/releases"
        exit 1
    fi
}

# 创建配置目录
setup_config() {
    mkdir -p "${FB_DB_DIR}"

    if [ ! -f "${FB_CONFIG}" ]; then
        log_info "创建 File Browser 配置文件..."
        cat > "${FB_CONFIG}" << 'EOF'
{
  "port": 8080,
  "baseURL": "",
  "address": "127.0.0.1",
  "database": "/Users/huajiejun/.filebrowser/filebrowser.db",
  "log": "stdout",
  "root": "/Users/huajiejun",
  "username": "admin",
  "password": "$2a$10$xxxxxxx",  # 请使用 'filebrowser hash' 生成
  "theme": "light"
}
EOF
        log_warn "请编辑 ${FB_CONFIG} 设置密码："
        echo "  1. 运行: filebrowser hash <your-password>"
        echo "  2. 将生成的哈希值填入 config.json 的 password 字段"
    fi
}

# 启动 File Browser
start_filebrowser() {
    check_installation
    setup_config

    # 检查是否已在运行
    if lsof -i :${FB_PORT} &> /dev/null; then
        log_warn "File Browser 已在运行 (端口 ${FB_PORT})"
        show_status
        return
    fi

    log_info "启动 File Browser..."
    log_info "访问地址: http://127.0.0.1:${FB_PORT}"
    log_info "根目录: ${FB_ROOT}"

    # 后台启动
    nohup filebrowser -c "${FB_CONFIG}" > "${FB_LOG}" 2>&1 &

    sleep 2

    if lsof -i :${FB_PORT} &> /dev/null; then
        log_info "File Browser 启动成功!"
        echo ""
        echo "本地访问: http://127.0.0.1:${FB_PORT}"
        echo "日志文件: ${FB_LOG}"
    else
        log_error "启动失败，请检查日志: ${FB_LOG}"
    fi
}

# 停止 File Browser
stop_filebrowser() {
    local pid=$(lsof -ti :${FB_PORT} 2>/dev/null || true)

    if [ -n "${pid}" ]; then
        log_info "停止 File Browser (PID: ${pid})..."
        kill ${pid} 2>/dev/null || true
        sleep 1
        log_info "已停止"
    else
        log_warn "File Browser 未运行"
    fi
}

# 查看状态
show_status() {
    local pid=$(lsof -ti :${FB_PORT} 2>/dev/null || true)

    if [ -n "${pid}" ]; then
        log_info "File Browser 正在运行"
        echo "  PID: ${pid}"
        echo "  端口: ${FB_PORT}"
        echo "  根目录: ${FB_ROOT}"
        echo ""
        echo "本地访问: http://127.0.0.1:${FB_PORT}"
        echo "局域网访问: http://$(ipconfig getifaddr en0):${FB_PORT}"
    else
        log_warn "File Browser 未运行"
    fi
}

# 查看日志
show_log() {
    if [ -f "${FB_LOG}" ]; then
        tail -50 "${FB_LOG}"
    else
        log_error "日志文件不存在: ${FB_LOG}"
    fi
}

# 生成密码哈希
hash_password() {
    if command -v filebrowser &> /dev/null; then
        echo "请输入密码，然后按 Ctrl+C"
        filebrowser hash
    else
        log_error "File Browser 未安装"
    fi
}

# 清理旧进程
cleanup() {
    local pid=$(lsof -ti :${FB_PORT} 2>/dev/null || true)
    if [ -n "${pid}" ]; then
        log_warn "清理旧进程: ${pid}"
        kill -9 ${pid} 2>/dev/null || true
    fi
}

# 主菜单
show_help() {
    echo ""
    echo "=========================================="
    echo "       File Browser 管理脚本"
    echo "=========================================="
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  start     启动 File Browser"
    echo "  stop      停止 File Browser"
    echo "  restart   重启 File Browser"
    echo "  status    查看运行状态"
    echo "  log       查看日志"
    echo "  hash      生成密码哈希"
    echo "  cleanup   清理旧进程"
    echo "  help      显示此帮助"
    echo ""
    echo "环境变量:"
    echo "  FB_PORT   端口号 (默认: 8080)"
    echo "  FB_ROOT   根目录 (默认: ${HOME})"
    echo ""
}

# 主入口
case "${1:-start}" in
    start)
        start_filebrowser
        ;;
    stop)
        stop_filebrowser
        ;;
    restart)
        stop_filebrowser
        sleep 1
        start_filebrowser
        ;;
    status)
        show_status
        ;;
    log)
        show_log
        ;;
    hash)
        hash_password
        ;;
    cleanup)
        cleanup
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "未知命令: $1"
        show_help
        exit 1
        ;;
esac
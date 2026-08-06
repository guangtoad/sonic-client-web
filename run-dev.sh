#!/bin/sh

# ============================================
# 端口检测 & 自动清理启动脚本（macOS / POSIX sh）
# 用法: ./dev.sh [端口]    默认 3002
# ============================================

# 1. 端口参数设置（默认 3002）

PORT="3002"
if [ -n "$1" ]; then
    PORT="$1"
fi

echo "🔍 正在检测端口 ${PORT} 的占用情况..."
echo ""

# 2. 检测端口占用（macOS 使用 lsof）
PIDS=$(lsof -t -i :"${PORT}" 2>/dev/null)

if [ -z "$PIDS" ]; then
    echo "✅ 端口 ${PORT} 未被占用，直接启动开发服务器..."
    echo ""
    npm run dev
    exit 0
fi

# 3. 有占用，输出详细信息
echo "⚠️  端口 ${PORT} 已被以下进程占用："
echo ""
# 显示表头 + 占用详情
lsof -i :"${PORT}" | awk 'NR==1 {print "   " $0} NR>1 {printf "   %-12s %-8s %-8s %-20s %s\n", $1, $2, $3, $8, $9}'
echo ""

# 4. 等待用户输入
printf "🗑️  是否强制关闭以上所有进程并启动 dev 服务器？输入 y 确认，其他键取消: "
read CONFIRM

if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
    echo ""
    echo "🛑 正在关闭占用端口 ${PORT} 的进程..."

    # 循环 kill 每个 PID（处理多个进程的情况）
    for PID in $PIDS; do
        PROC_NAME=$(ps -p "$PID" -o comm= 2>/dev/null || echo "unknown")
        if kill -9 "$PID" 2>/dev/null; then
            echo "   ✅ 已终止: $PROC_NAME (PID: $PID)"
        else
            echo "   ❌ 无法终止: $PROC_NAME (PID: $PID)，可能需要 sudo"
        fi
    done

    # 再次确认端口已释放
    sleep 0.5
    REMAINING=$(lsof -t -i :"${PORT}" 2>/dev/null)
    if [ -n "$REMAINING" ]; then
        echo ""
        echo "⚠️  仍有残留，尝试 sudo kill..."
        sudo kill -9 $REMAINING 2>/dev/null
    fi

    echo ""
    echo "🚀 启动开发服务器..."
    echo ""
    npm run dev
else
    echo ""
    echo "❌ 已取消。请手动释放端口 ${PORT} 后重试。"
    exit 1
fi
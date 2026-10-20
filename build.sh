#!/bin/bash
# Sonic Client Web Docker 镜像构建脚本
# 用法: ./build-client.sh <版本号>
# 示例: ./build-client.sh v1.0.4

# 开启严格模式：遇到错误立即退出，未定义变量报错
set -euo pipefail

# --- 辅助函数：带时间戳的日志输出 ---
log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

log_success() {
    echo "[SUCCESS] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# --- 1. 参数校验与变量定义 ---
if [ -z "${1:-}" ]; then
    log_error "缺少版本号参数！"
    echo "用法: $0 <版本号>"
    echo "示例: $0 v1.0.4"
    exit 1
fi

VERSION="$1"
IMAGE_NAME="tg/sonic-client-web"
IMAGE_TAG="${IMAGE_NAME}:${VERSION}"
# 假设你的 Dockerfile 位于项目根目录，如果位于子目录请修改此处路径
DOCKERFILE="./Dockerfile"

# --- 2. 前端项目构建 ---
log_info "开始执行前端构建 (npm run build)..."
if npm run build; then
    log_success "前端构建成功，产物已生成。"
else
    log_error "前端构建失败！请检查 npm 依赖或代码错误。"
    exit 1
fi

# --- 3. Docker 镜像构建 ---
echo ""
log_info "========================================"
log_info "开始构建 Docker 镜像"
log_info "镜像名称: ${IMAGE_TAG}"
log_info "Dockerfile 路径: ${DOCKERFILE}"
log_info "========================================"

# 检查 Dockerfile 是否存在
if [ ! -f "${DOCKERFILE}" ]; then
    log_error "Dockerfile 不存在: ${DOCKERFILE}"
    exit 1
fi

log_info "执行命令: docker build -f ${DOCKERFILE} . -t ${IMAGE_TAG}"
if docker build -f "${DOCKERFILE}" . -t "${IMAGE_TAG}"; then
    log_success "Docker 镜像构建成功: ${IMAGE_TAG}"
else
    log_error "Docker 镜像构建失败！"
    exit 1
fi

# --- 4. 构建结果确认 ---
echo ""
log_info "当前系统存在的目标镜像："
# 增加 || true 防止 grep 没找到匹配项时导致脚本因 set -e 报错退出
docker images | grep "${IMAGE_NAME}" | grep "${VERSION}" || true

log_success "客户端镜像构建流程全部完成！"
#!/bin/bash

# ============================================
# Deno Deploy 一键部署脚本
# 项目: codexapp-demo
# ============================================

set -e

# 配置参数
ORG="jay6697117"
APP="codexapp-demo"
ENTRYPOINT="server/main.ts"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的信息
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 deployctl 是否已安装
check_deployctl() {
    if ! command -v deployctl &> /dev/null; then
        warning "deployctl 未安装，正在安装..."
        deno install -gArf jsr:@deno/deployctl
        success "deployctl 安装完成"
    else
        success "deployctl 已安装: $(deployctl --version 2>/dev/null || echo 'unknown version')"
    fi
}

# 检查 Deno 是否已安装
check_deno() {
    if ! command -v deno &> /dev/null; then
        error "Deno 未安装！请先安装 Deno: https://deno.land/#installation"
        exit 1
    fi
    success "Deno 已安装: $(deno --version | head -n 1)"
}

# 检查是否已登录
check_login() {
    info "检查 Deno Deploy 登录状态..."
    # deployctl 会在需要时提示登录
    echo ""
}

# 构建客户端（如果需要）
build_client() {
    if [ -d "client" ]; then
        info "检测到 client 目录，检查是否需要构建..."
        if [ -f "package.json" ]; then
            if command -v pnpm &> /dev/null; then
                info "使用 pnpm 安装依赖..."
                pnpm install
            elif command -v npm &> /dev/null; then
                info "使用 npm 安装依赖..."
                npm install
            fi
        fi
    fi
}

# 部署到 Deno Deploy
deploy() {
    info "开始部署到 Deno Deploy..."
    echo ""
    echo "============================================"
    echo "  组织: $ORG"
    echo "  项目: $APP"
    echo "  入口: $ENTRYPOINT"
    echo "============================================"
    echo ""

    # 切换到项目根目录
    cd "$(dirname "$0")/.."

    # 执行部署
    # --project: 项目名称
    # --org: 组织名称
    # --prod: 部署到生产环境
    # --include: 包含的文件/目录
    deployctl deploy \
        --org="$ORG" \
        --project="$APP" \
        --prod \
        --include="server,shared,client/dist,deno.json" \
        "$ENTRYPOINT"

    if [ $? -eq 0 ]; then
        success "部署成功！"
        echo ""
        echo "============================================"
        echo "  🎉 应用已部署到:"
        echo "  https://${APP}.deno.dev"
        echo ""
        echo "  控制台:"
        echo "  https://dash.deno.com/projects/${APP}"
        echo "============================================"
    else
        error "部署失败，请检查错误信息"
        exit 1
    fi
}

# 显示帮助信息
show_help() {
    echo ""
    echo "Deno Deploy 一键部署脚本"
    echo ""
    echo "用法: ./scripts/deploy-deno.sh [选项]"
    echo ""
    echo "选项:"
    echo "  --help, -h     显示帮助信息"
    echo "  --dry-run      模拟部署（不实际执行）"
    echo "  --preview      部署到预览环境（非生产）"
    echo ""
    echo "配置:"
    echo "  ORG:        $ORG"
    echo "  APP:        $APP"
    echo "  ENTRYPOINT: $ENTRYPOINT"
    echo ""
}

# 主函数
main() {
    echo ""
    echo "============================================"
    echo "  Deno Deploy 一键部署工具"
    echo "============================================"
    echo ""

    # 解析参数
    PREVIEW=false
    DRY_RUN=false

    for arg in "$@"; do
        case $arg in
            --help|-h)
                show_help
                exit 0
                ;;
            --dry-run)
                DRY_RUN=true
                ;;
            --preview)
                PREVIEW=true
                ;;
        esac
    done

    # 检查环境
    check_deno
    check_deployctl
    check_login

    # 构建客户端
    build_client

    if [ "$DRY_RUN" = true ]; then
        info "模拟部署模式，实际部署命令如下:"
        echo ""
        echo "  deployctl deploy \\"
        echo "      --org=\"$ORG\" \\"
        echo "      --project=\"$APP\" \\"
        if [ "$PREVIEW" = false ]; then
            echo "      --prod \\"
        fi
        echo "      --include=\"server,shared,client/dist,deno.json\" \\"
        echo "      \"$ENTRYPOINT\""
        echo ""
        exit 0
    fi

    # 执行部署
    if [ "$PREVIEW" = true ]; then
        info "部署到预览环境..."
        cd "$(dirname "$0")/.."
        deployctl deploy \
            --org="$ORG" \
            --project="$APP" \
            --include="server,shared,client/dist,deno.json" \
            "$ENTRYPOINT"
    else
        deploy
    fi
}

# 运行主函数
main "$@"

#!/usr/bin/env bash
#
# deploy-vercel.sh
# 暑假打卡积分系统 — Vercel 一键部署脚本 (macOS / Linux / Git Bash)
#
# 前置条件：
#   1. 已安装 Node.js（https://nodejs.org）
#   2. 已登录 Vercel CLI：npm i -g vercel && vercel login
#
# 使用方法：
#   chmod +x scripts/deploy-vercel.sh
#   bash scripts/deploy-vercel.sh

set -e

echo "╔══════════════════════════════════════════════╗"
echo "║   暑假打卡积分系统 — Vercel 一键部署         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 1: 检查 Node.js ──
echo "[1/5] 检查 Node.js..."
if ! command -v node &> /dev/null; then
  echo "❌ 未检测到 Node.js，请先安装：https://nodejs.org"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# ── Step 2: 检查/安装 Vercel CLI ──
echo ""
echo "[2/5] 检查 Vercel CLI..."
if ! command -v vercel &> /dev/null; then
  echo "📦 正在安装 Vercel CLI..."
  npm install -g vercel
fi
echo "✅ Vercel CLI 就绪"

# ── Step 3: 自动更新缓存版本号 ──
echo ""
echo "[3/5] 更新缓存版本号..."
node scripts/bump-cache-version.js
echo "✅ 缓存版本号已更新"

# ── Step 4: PWA 检查 ──
echo ""
echo "[4/5] PWA 配置检查..."
node scripts/check-pwa.js
echo "✅ PWA 配置检查通过"

# ── Step 5: 部署到 Vercel ──
echo ""
echo "[5/5] 部署到 Vercel..."
echo ""
echo "  接下来 Vercel CLI 会问你几个问题，请按以下回答："
echo ""
echo "    ? Set up and deploy?                  → Y (回车)"
echo "    ? Which scope?                        → 选择你的账号 (回车)"
echo "    ? Link to existing project?           → N (如果没有旧项目)"
echo "    ? What's your project's name?         → daka-pwa (回车)"
echo "    ? In which directory is your code?    → ./ (回车)"
echo "    ? Want to override settings?          → N (回车)"
echo ""

vercel --prod

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅ 部署完成！                              ║"
echo "║                                              ║"
echo "║   请将部署后的网址发送到 iPad 进行安装。      ║"
echo "║   详见 IPAD_SETUP_GUIDE.md                   ║"
echo "╚══════════════════════════════════════════════╝"

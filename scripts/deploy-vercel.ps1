# deploy-vercel.ps1
# 暑假打卡积分系统 — Vercel 一键部署脚本 (Windows PowerShell)
#
# 前置条件：
#   1. 已安装 Node.js（https://nodejs.org）
#   2. 已登录 Vercel CLI：npm i -g vercel && vercel login
#
# 使用方法：
#   右键 → "使用 PowerShell 运行" 或在 PowerShell 中运行：
#   .\scripts\deploy-vercel.ps1

$ErrorActionPreference = "Stop"

Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   暑假打卡积分系统 — Vercel 一键部署         ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: 检查 Node.js ──
Write-Host "[1/5] 检查 Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    Write-Host "✅ Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 未检测到 Node.js，请先安装：https://nodejs.org" -ForegroundColor Red
    exit 1
}

# ── Step 2: 检查 Vercel CLI ──
Write-Host ""
Write-Host "[2/5] 检查 Vercel CLI..." -ForegroundColor Yellow
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelInstalled) {
    Write-Host "📦 正在安装 Vercel CLI..." -ForegroundColor Yellow
    npm install -g vercel
}
Write-Host "✅ Vercel CLI 就绪" -ForegroundColor Green

# ── Step 3: 自动更新缓存版本号 ──
Write-Host ""
Write-Host "[3/5] 更新缓存版本号..." -ForegroundColor Yellow
node scripts/bump-cache-version.js
Write-Host "✅ 缓存版本号已更新" -ForegroundColor Green

# ── Step 4: PWA 检查 ──
Write-Host ""
Write-Host "[4/5] PWA 配置检查..." -ForegroundColor Yellow
node scripts/check-pwa.js
Write-Host "✅ PWA 配置检查通过" -ForegroundColor Green

# ── Step 5: 部署到 Vercel ──
Write-Host ""
Write-Host "[5/5] 部署到 Vercel..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  接下来 Vercel CLI 会问你几个问题，请按以下回答："
Write-Host ""
Write-Host "    ? Set up and deploy?                  → Y (回车)"
Write-Host "    ? Which scope?                        → 选择你的账号 (回车)"
Write-Host "    ? Link to existing project?           → N (如果没有旧项目)"
Write-Host "    ? What's your project's name?         → daka-pwa (回车)"
Write-Host "    ? In which directory is your code?    → ./ (回车)"
Write-Host "    ? Want to override settings?          → N (回车)"
Write-Host ""

vercel --prod

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   ✅ 部署完成！                              ║" -ForegroundColor Cyan
Write-Host "║                                              ║" -ForegroundColor Cyan
Write-Host "║   请将部署后的网址发送到 iPad 进行安装。      ║" -ForegroundColor Cyan
Write-Host "║   详见 IPAD_SETUP_GUIDE.md                   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan

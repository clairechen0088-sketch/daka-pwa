#!/usr/bin/env node
/**
 * scripts/check-pwa.js
 * PWA 配置完整性检查脚本
 * 用法: node scripts/check-pwa.js
 * 检查项: manifest, SW, icons, meta tags, 文件完整性
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let errors = 0;
let warnings = 0;

function log(level, msg) {
  const prefix = { ok: '✅', error: '❌', warn: '⚠️' }[level] || '  ';
  console.log(`  ${prefix} ${msg}`);
  if (level === 'error') errors++;
  if (level === 'warn') warnings++;
}

function checkFile(relPath, label) {
  const fullPath = path.join(ROOT, relPath);
  if (fs.existsSync(fullPath)) {
    log('ok', `${label}: ${relPath}`);
    return true;
  } else {
    log('error', `${label}: ${relPath} — 文件不存在`);
    return false;
  }
}

console.log('\n🔍 PWA 配置检查\n');
console.log('━'.repeat(50));

// ── 1. Manifest ──
console.log('\n📱 Manifest 检查');
checkFile('manifest.webmanifest', 'Web App Manifest');
checkFile('manifest.json', 'Manifest (JSON 兼容)');

const manifestPath = path.join(ROOT, 'manifest.webmanifest');
if (fs.existsSync(manifestPath)) {
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const checks = [
      ['name', 'name 字段'],
      ['short_name', 'short_name 字段'],
      ['start_url', 'start_url 字段'],
      ['display', 'display 字段'],
      ['icons', 'icons 数组'],
    ];
    for (const [key, label] of checks) {
      if (m[key]) {
        log('ok', `${label}: ${typeof m[key] === 'string' ? m[key] : JSON.stringify(m[key])}`);
      } else {
        log('error', `${label}: 缺失`);
      }
    }
    if (m.icons && Array.isArray(m.icons)) {
      log('ok', `图标数量: ${m.icons.length}`);
      for (const icon of m.icons) {
        const iconPath = path.join(ROOT, icon.src.replace(/^\//, ''));
        if (fs.existsSync(iconPath)) {
          log('ok', `图标 ${icon.sizes}: ${icon.src} ✓`);
        } else {
          log('error', `图标 ${icon.sizes}: ${icon.src} — 文件不存在`);
        }
      }
    }
  } catch (e) {
    log('error', `manifest.webmanifest JSON 解析失败: ${e.message}`);
  }
}

// ── 2. Service Worker ──
console.log('\n⚙️  Service Worker 检查');
checkFile('sw.js', 'Service Worker');

const swPath = path.join(ROOT, 'sw.js');
if (fs.existsSync(swPath)) {
  const swContent = fs.readFileSync(swPath, 'utf-8');
  if (/CACHE_NAME/.test(swContent)) log('ok', 'CACHE_NAME 已定义');
  else log('error', 'CACHE_NAME 未定义');
  if (/STATIC_ASSETS/.test(swContent)) log('ok', 'STATIC_ASSETS 已定义');
  else log('warn', 'STATIC_ASSETS 未定义');
  if (/skipWaiting/.test(swContent)) log('ok', 'skipWaiting 已使用');
  else log('error', 'skipWaiting 未使用 — 可能导致更新延迟');
  if (/clients\.claim/.test(swContent)) log('ok', 'clients.claim 已使用');
  else log('error', 'clients.claim 未使用');
  if (/SKIP_WAITING/.test(swContent)) log('ok', 'SKIP_WAITING 消息处理已实现');
  else log('warn', 'SKIP_WAITING 消息处理未实现');
}

// ── 3. index.html meta ──
console.log('\n🏷️  index.html Meta 检查');
checkFile('index.html', '入口 HTML');

const indexPath = path.join(ROOT, 'index.html');
if (fs.existsSync(indexPath)) {
  const html = fs.readFileSync(indexPath, 'utf-8');
  const metaChecks = [
    ['apple-mobile-web-app-capable', 'iOS PWA 模式'],
    ['apple-mobile-web-app-status-bar-style', 'iOS 状态栏样式'],
    ['apple-mobile-web-app-title', 'iOS PWA 标题'],
    ['manifest.webmanifest', 'manifest.webmanifest 链接'],
    ['apple-touch-icon', 'Apple Touch Icon'],
    ['viewport-fit=cover', 'viewport-fit 适配'],
    ['format-detection', '电话号检测禁用'],
    ['theme-color', '主题色 meta'],
  ];
  for (const [pattern, label] of metaChecks) {
    if (html.includes(pattern)) {
      log('ok', label);
    } else {
      log('warn', `${label}: 未找到 "${pattern}"`);
    }
  }
}

// ── 4. Icons ──
console.log('\n🖼️  图标检查');
const iconsDir = path.join(ROOT, 'assets', 'icons');
if (fs.existsSync(iconsDir)) {
  const icons = fs.readdirSync(iconsDir).filter(f => f.endsWith('.png'));
  for (const icon of icons) {
    const iconPath = path.join(iconsDir, icon);
    const stat = fs.statSync(iconPath);
    if (stat.size > 1000) {
      log('ok', `${icon} (${(stat.size / 1024).toFixed(1)} KB)`);
    } else {
      log('warn', `${icon}: 文件太小 (${stat.size} bytes)，可能不是有效图片`);
    }
  }
} else {
  log('error', 'assets/icons/ 目录不存在');
}

// ── 5. Vercel 配置 ──
console.log('\n☁️  Vercel 部署检查');
checkFile('vercel.json', 'Vercel 配置');
checkFile('package.json', 'package.json');
checkFile('.vercelignore', '.vercelignore');

// ── 6. 关键源文件 ──
console.log('\n📄 关键源文件检查');
const keyFiles = [
  'src/db.js', 'src/engine.js', 'src/rules.js', 'src/app.js',
  'src/utils.js', 'src/backup.js',
  'vendor/dexie.min.js',
];
for (const f of keyFiles) checkFile(f, f);

// ── 总结 ──
console.log('\n' + '━'.repeat(50));
if (errors === 0 && warnings === 0) {
  console.log('\n🎉 PWA 配置完全通过，可以部署！\n');
} else {
  console.log(`\n📊 检查结果: ❌ ${errors} 项错误, ⚠️ ${warnings} 项警告\n`);
  if (errors > 0) {
    console.log('请先修复以上错误再部署。\n');
    process.exit(1);
  }
}

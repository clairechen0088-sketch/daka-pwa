#!/usr/bin/env node
/**
 * scripts/bump-cache-version.js
 * 自动更新 sw.js 中的 CACHE_NAME 版本号
 * 用法: node scripts/bump-cache-version.js
 * 每次部署前运行，确保客户端不会使用旧缓存
 */
const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'sw.js');

if (!fs.existsSync(swPath)) {
  console.error('[bump-cache-version] sw.js 未找到');
  process.exit(1);
}

let content = fs.readFileSync(swPath, 'utf-8');

// 匹配 CACHE_NAME = 'daka-pwa-v{num}-{date}' 或 'daka-pwa-v{num}-{date}-{suffix}'
const cacheNameRegex = /(CACHE_NAME\s*=\s*'daka-pwa-v)(\d+)(-\d{8})(-[^']*)?(')/;
const match = content.match(cacheNameRegex);

if (!match) {
  console.error('[bump-cache-version] 无法匹配 CACHE_NAME 格式，请检查 sw.js');
  process.exit(1);
}

const oldVersion = parseInt(match[2], 10);
const newVersion = oldVersion + 1;
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const oldSuffix = match[4] || '';
const newCacheName = `daka-pwa-v${newVersion}-${today}`;

content = content.replace(cacheNameRegex, `$1${newVersion}-${today}$5`);

// 同时更新静态资源列表（确保最新的文件列表）
fs.writeFileSync(swPath, content, 'utf-8');
console.log(`[bump-cache-version] CACHE_NAME: daka-pwa-v${oldVersion}-${match[3]} → ${newCacheName}`);

// 输出新版本号供部署脚本使用
process.stdout.write(newCacheName);

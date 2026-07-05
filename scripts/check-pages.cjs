// 检查 Pages 部署状态和最近构建
const { execSync } = require('child_process');
const https = require('https');

const credInput = "protocol=https\nhost=github.com\n";
const tokenOutput = execSync('git credential fill', { input: credInput, encoding: 'utf8' });
const token = tokenOutput.match(/^password=(.+)$/m)?.[1];

function api(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.github.com', path,
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'node' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    }).on('error', reject);
  });
}

(async () => {
  // 1. Pages 配置
  console.log('=== Pages 配置 ===');
  const pages = await api('/repos/clairechen0088-sketch/daka-pwa/pages');
  const p = pages.body;
  console.log(`Build type: ${p.build_type}`);
  console.log(`Status: ${p.status || '(not yet built)'}`);
  console.log(`Source: ${p.source?.branch} / ${p.source?.path}`);
  console.log(`URL: ${p.html_url}`);
  console.log(`HTTPS enforced: ${p.https_enforced}`);

  // 2. 最新 Pages 构建
  console.log('\n=== 最新构建 ===');
  const builds = await api('/repos/clairechen0088-sketch/daka-pwa/pages/builds?per_page=3');
  if (builds.body?.length > 0) {
    for (const b of builds.body.slice(0, 3)) {
      console.log(`  [${b.status}] ${b.commit?.substring(0, 7)} - ${b.created_at}`);
    }
  } else {
    console.log('  暂无构建记录');
  }

  // 3. 尝试触发构建 (仅当没有进行中的构建时)
  console.log('\n=== 触发部署 ===');
  if (!p.status || p.status === 'built') {
    const trigger = await api('/repos/clairechen0088-sketch/daka-pwa/pages/builds', 'POST');
    console.log(`Status: ${trigger.status}`);
    if (trigger.status === 200 || trigger.status === 201) {
      console.log('✅ 构建已触发！');
    } else {
      console.log(JSON.stringify(trigger.body).substring(0, 300));
    }
  } else {
    console.log(`  Pages 当前状态: ${p.status}，等待中...`);
  }
})();

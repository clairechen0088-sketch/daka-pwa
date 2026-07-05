// 快速检查 Pages 最新构建
const { execSync } = require('child_process');
const https = require('https');

const credInput = "protocol=https\nhost=github.com\n";
const tokenOutput = execSync('git credential fill', { input: credInput, encoding: 'utf8' });
const token = tokenOutput.match(/^password=(.+)$/m)?.[1];

https.get({
  hostname: 'api.github.com',
  path: '/repos/clairechen0088-sketch/daka-pwa/pages/builds?per_page=2',
  headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'node' }
}, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const builds = JSON.parse(body);
    if (Array.isArray(builds)) {
      builds.forEach(b => console.log(`[${b.status}] ${b.commit?.substring(0,7)} ${b.created_at} ${b.error?.message || ''}`));
    } else {
      console.log(JSON.stringify(builds).substring(0, 500));
    }
  });
}).on('error', e => console.error(e));

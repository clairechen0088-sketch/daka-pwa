// 启用 GitHub Pages (Actions 模式)
const { execSync } = require('child_process');
const https = require('https');

// 从 git credential helper 获取 token
const credInput = "protocol=https\nhost=github.com\n";
const tokenOutput = execSync('git credential fill', { input: credInput, encoding: 'utf8' });
const tokenMatch = tokenOutput.match(/^password=(.+)$/m);
const token = tokenMatch ? tokenMatch[1] : null;

if (!token) {
  console.error('无法获取 GitHub token');
  process.exit(1);
}

const data = JSON.stringify({ build_type: 'workflow' });

const req = https.request({
  hostname: 'api.github.com',
  path: '/repos/clairechen0088-sketch/daka-pwa/pages',
  method: 'POST',
  headers: {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'node',
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(body);
    if (res.statusCode === 201 || res.statusCode === 204) {
      console.log('\n✅ Pages 已启用！');
      console.log('📍 网址: https://clairechen0088-sketch.github.io/daka-pwa/');
    }
  });
});

req.on('error', e => console.error(e));
req.write(data);
req.end();

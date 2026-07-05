// 将 Pages 从 workflow 模式切换到分支部署模式
const { execSync } = require('child_process');
const https = require('https');

const credInput = "protocol=https\nhost=github.com\n";
const tokenOutput = execSync('git credential fill', { input: credInput, encoding: 'utf8' });
const token = tokenOutput.match(/^password=(.+)$/m)?.[1];

const data = JSON.stringify({
  build_type: 'legacy',
  source: {
    branch: 'master',
    path: '/'
  }
});

const req = https.request({
  hostname: 'api.github.com',
  path: '/repos/clairechen0088-sketch/daka-pwa/pages',
  method: 'PUT',
  headers: {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'node',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(body);
    if (res.statusCode === 200 || res.statusCode === 204) {
      console.log('\n✅ Pages 已切换到分支部署模式！');
      console.log('📍 网址: https://clairechen0088-sketch.github.io/daka-pwa/');
      console.log('\n每次推送到 master 分支会自动部署。');
    }
  });
});

req.on('error', e => console.error(e));
req.write(data);
req.end();

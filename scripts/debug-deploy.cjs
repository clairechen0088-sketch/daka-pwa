// 获取失败步骤的详细日志
const { execSync } = require('child_process');
const https = require('https');

const credInput = "protocol=https\nhost=github.com\n";
const tokenOutput = execSync('git credential fill', { input: credInput, encoding: 'utf8' });
const token = tokenOutput.match(/^password=(.+)$/m)?.[1];

function api(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.github.com', path,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'node'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    }).on('error', reject);
  });
}

// Get logs — follows redirect chain
function getLogs(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'node'
      }
    }, (res) => {
      // 302 redirect to raw log storage
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        https.get(loc, {
          headers: { 'User-Agent': 'node' }  // no auth needed for storage URL
        }, (res2) => {
          let body = '';
          res2.on('data', chunk => body += chunk);
          res2.on('end', () => resolve(body));
        }).on('error', reject);
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
  });
}

(async () => {
  // Get latest run
  const { body: { workflow_runs: runs } } = await api('/repos/clairechen0088-sketch/daka-pwa/actions/runs?per_page=1');
  const run = runs[0];

  // Get jobs
  const { body: { jobs } } = await api(`/repos/clairechen0088-sketch/daka-pwa/actions/runs/${run.id}/jobs`);

  for (const job of jobs) {
    if (job.conclusion !== 'failure') continue;

    console.log(`Job ID: ${job.id}`);
    console.log(`Job URL: ${job.html_url}\n`);
    console.log('Downloading logs...\n');

    const logs = await getLogs(job.url + '/logs');

    const lines = logs.split('\n');

    // Find "Deploy to GitHub Pages" section
    let inStep = false;
    let deployLines = [];

    for (const line of lines) {
      if (line.includes('Run actions/deploy-pages@v4') || line.includes('Deploy to GitHub Pages##[group]')) {
        inStep = true;
        deployLines = [];
      }
      if (inStep) {
        deployLines.push(line);
        // Stop at next step or end marker
        if ((line.includes('##[group]') || line.includes('##[endgroup]') && line.includes('Post')) && deployLines.length > 5) {
          break;
        }
        if (line.includes('##[error]') || line.includes('Error:') || line.includes('failed')) {
          // Keep going, collect full error
        }
        if (deployLines.length > 200) break; // safety limit
      }
    }

    if (deployLines.length === 0) {
      // Fallback: look for error lines
      console.log('=== Error lines in log ===\n');
      for (const line of lines) {
        if (line.includes('##[error]') || line.includes('Error:') || line.includes('error:') || line.includes('fail')) {
          console.log(line);
        }
      }
      console.log('\n=== Last 40 lines ===\n');
      for (const l of lines.slice(-40)) {
        console.log(l);
      }
    } else {
      for (const l of deployLines) {
        console.log(l);
      }
    }
  }
})();

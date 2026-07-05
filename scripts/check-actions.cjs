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
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

(async () => {
  // Get latest run
  const { workflow_runs: runs } = await api('/repos/clairechen0088-sketch/daka-pwa/actions/runs?per_page=1');
  if (!runs?.length) { console.log('No runs found'); return; }

  const run = runs[0];
  console.log(`Run #${run.run_number}: ${run.display_title} → ${run.conclusion}`);
  console.log(`URL: ${run.html_url}\n`);

  // Get jobs
  const { jobs } = await api(`/repos/clairechen0088-sketch/daka-pwa/actions/runs/${run.id}/jobs`);
  if (!jobs?.length) { console.log('No jobs found'); return; }

  for (const job of jobs) {
    console.log(`Job: ${job.name} → ${job.conclusion}`);
    // Get the last few steps
    if (job.steps) {
      for (const step of job.steps.slice(-6)) {
        if (step.conclusion === 'failure' || step.conclusion === 'success') {
          console.log(`  [${step.conclusion}] ${step.name}`);
        }
      }
    }
  }
})();

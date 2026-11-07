// Runs the end-to-end suites in order against `pnpm cf:preview` (http://127.0.0.1:8787).
// Before each suite: reset the local DB (fresh seed), clear Redis and the fake Gemini.
// Phase 5 runs last: it deliberately hits rate limits, which the running worker
// remembers in memory (restart the preview before running the suites again).
// See e2e/README.md for the one-time setup.
const { execFileSync, execSync } = require('node:child_process');
const path = require('node:path');

const suites = (process.argv.slice(2).length ? process.argv.slice(2) : ['phase2', 'phase3', 'phase4', 'phase5']);
let failed = false;
for (const suite of suites) {
  execSync('pnpm db:reset', { stdio: 'ignore' });
  try { execFileSync('docker', ['exec', 'kavach-redis', 'redis-cli', 'FLUSHALL'], { stdio: 'ignore' }); } catch {}
  fetch('http://127.0.0.1:9200/__reset', { method: 'POST' }).catch(() => {});
  console.log(`\n=== ${suite} ===`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, `${suite}.cjs`)], { stdio: 'inherit' });
  } catch {
    failed = true;
  }
}
execSync('pnpm db:reset', { stdio: 'ignore' }); // leave the seed data clean
process.exit(failed ? 1 : 0);

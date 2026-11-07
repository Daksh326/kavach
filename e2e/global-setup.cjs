// Runs once before the suites: checks prerequisites with clear messages and
// creates the emulator bucket that stands in for R2.
const { execFileSync } = require('node:child_process');

module.exports = async () => {
  const fail = (msg) => {
    throw new Error(`\n\nE2E setup: ${msg}\nSee e2e/README.md.\n`);
  };
  try {
    execFileSync('docker', ['exec', 'supabase_db_kavach', 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' });
  } catch {
    fail('the local database is not running. Start it with: pnpm db:start');
  }
  try {
    execFileSync('docker', ['exec', 'kavach-redis', 'redis-cli', 'PING'], { stdio: 'ignore' });
  } catch {
    fail('Redis is not running (container "kavach-redis"). Run: sh e2e/start-redis.sh');
  }
  const res = await fetch('http://127.0.0.1:9100/kavach-evidence', { method: 'PUT' }).catch(() => null);
  if (!res || res.status >= 500) fail('could not create the emulator bucket on http://127.0.0.1:9100');
};

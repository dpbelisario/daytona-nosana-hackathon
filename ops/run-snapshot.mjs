import { config } from 'dotenv';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, '.env'), quiet: true });
const token = process.env.GITHUB_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
const entry = resolve(root, 'factory/scripts/.build-snapshot.local.ts');
// The upstream builder enables shell tracing around clone credentials. Disable
// tracing in this ignored execution copy without editing Claude-owned files.
const source = readFileSync(resolve(root, 'factory/scripts/build-snapshot.ts'), 'utf8');
writeFileSync(entry, source.replace('set -euxo pipefail', 'set -euo pipefail'), { mode: 0o600 });
const secrets = [token, Buffer.from(`x-access-token:${token}`).toString('base64'), ...Object.entries(process.env).filter(([key]) => /TOKEN|KEY|PASSWORD|ENDPOINT|BASE_URL/.test(key)).map(([,value]) => value)].filter(value => value?.length > 8);
const redact = value => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), value);
const child = spawn(resolve(root, 'factory/node_modules/.bin/tsx'), [entry], {
  cwd: resolve(root, 'factory'),
  env: { ...process.env, GITHUB_TOKEN: token, KEEP_BUILDER: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
for (const stream of [child.stdout, child.stderr]) {
  let pending = '';
  stream.on('data', chunk => {
    pending += chunk.toString();
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) process.stdout.write(redact(line) + '\n');
  });
  stream.on('end', () => { if (pending) process.stdout.write(redact(pending) + '\n'); });
}
child.on('exit', code => { unlinkSync(entry); process.exitCode = code ?? 1; });

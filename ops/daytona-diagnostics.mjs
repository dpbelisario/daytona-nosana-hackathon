import 'dotenv/config';
import { Daytona } from '@daytona/sdk';
import { SandboxApi } from '@daytona/api-client';

const sandboxId = process.argv[2];
if (!sandboxId) {
  console.error('Usage: node ops/daytona-diagnostics.mjs <sandbox-id> [log-directory]');
  process.exit(1);
}
const logDirectory = process.argv[3] || '/home/daytona/app';
if (!/^\/[a-zA-Z0-9_./-]+$/.test(logDirectory) || logDirectory.includes('..')) throw new Error('Use an absolute sandbox log directory.');
const secrets = Object.entries(process.env).filter(([key, value]) => /KEY|TOKEN|PASSWORD|ENDPOINT|BASE_URL/.test(key) && value?.length > 8).map(([, value]) => value);
const redact = text => secrets.reduce((value, secret) => value.split(secret).join('[redacted]'), text).replace(/https:\/\/[^\s"']+\.node\.k8s\.prd\.nos\.ci\/?/gi, '[model endpoint redacted]');

async function main() {
  const client = new Daytona();
  const sandbox = await client.get(sandboxId);
  const report = { sandbox: { id: sandbox.id, state: sandbox.state, cpu: sandbox.cpu, memoryGiB: sandbox.memory, diskGiB: sandbox.disk, sandboxClass: sandbox.sandboxClass }, quota: null, logs: {} };
  const api = new SandboxApi(client.clientConfig);
  try {
    const { data: quota } = await api.getRegionQuotaBySandboxId(sandboxId);
    report.quota = Object.fromEntries(['totalCpuQuota', 'totalMemoryQuota', 'totalDiskQuota', 'maxCpuPerSandbox', 'maxMemoryPerSandbox', 'maxDiskPerSandbox', 'maxSandboxLifespan'].map(key => [key, quota[key]]));
  } catch (error) { report.quota = { error: redact(error.message) }; }
  if (sandbox.state === 'started') {
    for (const name of ['install.log', 'build.log', 'server.log', 'bootstrap.log']) {
      const response = await sandbox.process.executeCommand(`tail -60 '${logDirectory}/${name}'`, undefined, undefined, 20);
      report.logs[name] = { exitCode: response.exitCode, output: redact(response.result || response.artifacts?.stdout || '') };
    }
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });

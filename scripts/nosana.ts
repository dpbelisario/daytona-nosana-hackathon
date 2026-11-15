/**
 * Nosana: deploy a GPU container (Ollama serving a small LLM with an
 * OpenAI-compatible API) and print its public endpoint URL.
 *
 *   npm run nosana:markets          # list GPU markets (pick one → NOSANA_MARKET)
 *   npm run nosana:deploy           # create + start, waits for the endpoint
 *   npm run nosana:status [id]      # list deployments, or one deployment's endpoints
 *   npm run nosana:stop <id>        # stop a deployment (stop burning credits)
 */
import 'dotenv/config';
import { createNosanaClient, NosanaNetwork } from '@nosana/kit';

if (!process.env.NOSANA_API_KEY) {
  console.error('Missing NOSANA_API_KEY — copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = createNosanaClient(NosanaNetwork.MAINNET, {
  api: { apiKey: process.env.NOSANA_API_KEY },
});

const MODEL = process.env.MODEL ?? 'qwen3:0.6b'; // tiny + fast to pull; swap for a bigger one later

const jobDefinition = {
  version: '0.1',
  type: 'container',
  meta: { trigger: 'api' },
  ops: [
    {
      type: 'container/run',
      id: 'ollama',
      args: {
        image: 'docker.io/ollama/ollama:latest',
        gpu: true,
        entrypoint: ['/bin/sh', '-c'],
        cmd: [`ollama serve & sleep 5 && ollama pull ${MODEL} && wait`],
        env: { OLLAMA_HOST: '0.0.0.0:11434', OLLAMA_ORIGINS: '*' },
        expose: 11434,
      },
    },
  ],
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function markets() {
  const list = await client.api.markets.list();
  for (const m of list) {
    console.log(JSON.stringify(m));
  }
}

async function deploy() {
  const deployment = await client.api.deployments.create({
    name: `hackathon-${MODEL.replace(/[^a-z0-9]/gi, '-')}`,
    ...(process.env.NOSANA_MARKET ? { market: process.env.NOSANA_MARKET } : {}),
    replicas: 1,
    timeout: 60, // minutes — keep short while testing
    strategy: 'SIMPLE',
    job_definition: jobDefinition as any,
  });
  console.log(`Deployment ${deployment.id} created (status ${deployment.status}). Starting…`);
  await deployment.start();
  await waitForEndpoint(deployment.id);
}

async function waitForEndpoint(id: string) {
  for (let i = 0; i < 90; i++) {
    const d = await client.api.deployments.get(id);
    const online = d.endpoints.filter((e) => e.online);
    process.stdout.write(`\r[${i * 10}s] status=${d.status} endpoints=${d.endpoints.length} online=${online.length}   `);
    if (online.length) {
      console.log(`\n\n✅ Endpoint: ${online[0].url}`);
      console.log(`   Try: curl ${online[0].url}/v1/chat/completions -H 'Content-Type: application/json' \\`);
      console.log(`        -d '{"model":"${MODEL}","messages":[{"role":"user","content":"hi"}]}'`);
      return;
    }
    if (['ERROR', 'STOPPED', 'INSUFFICIENT_FUNDS'].includes(d.status)) {
      console.log(`\n❌ Deployment ended with status ${d.status}. Check logs at https://deploy.nosana.com`);
      return;
    }
    await sleep(10_000);
  }
  console.log('\nStill not online after 15 min — check https://deploy.nosana.com for logs.');
}

async function status() {
  const id = process.argv[3];
  if (id) {
    const d = await client.api.deployments.get(id);
    console.log(`${d.id}  ${d.status}  ${d.name}`);
    for (const e of d.endpoints) console.log(`  ${e.online ? '🟢' : '⚪'} ${e.url}`);
    return;
  }
  const res = await client.api.deployments.list();
  console.log(JSON.stringify(res, null, 2));
}

async function stop() {
  const id = process.argv[3];
  if (!id) throw new Error('Usage: npm run nosana:stop <deployment-id>');
  const d = await client.api.deployments.get(id);
  await d.stop();
  console.log(`Stopping ${id}`);
}

const cmd = process.argv[2] ?? 'deploy';
const fn = ({ markets, deploy, status, stop } as Record<string, () => Promise<void>>)[cmd];
if (!fn) {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}
await fn();

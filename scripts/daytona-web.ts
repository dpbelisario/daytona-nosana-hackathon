/**
 * Daytona smoke test: spin up a PUBLIC sandbox, upload web/index.html,
 * serve it on port 3000 and print a shareable preview URL.
 *
 *   npm run daytona:web     # create + serve, prints URL
 *   npm run daytona:list    # list your hackathon sandboxes
 *   npm run daytona:clean   # delete them (stop burning credits)
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Daytona } from '@daytona/sdk';

const LABEL = { project: 'daytona-nosana-hackathon' };
const PORT = 3000;

if (!process.env.DAYTONA_API_KEY) {
  console.error('Missing DAYTONA_API_KEY — copy .env.example to .env and fill it in.');
  process.exit(1);
}

const daytona = new Daytona(); // reads DAYTONA_API_KEY from env

async function up() {
  console.log('Creating sandbox…');
  const sandbox = await daytona.create({
    language: 'python',
    public: true, // preview URLs work without a token — fine for a demo page
    labels: LABEL,
    autoStopInterval: 30, // minutes idle before auto-stop (saves credits)
  });
  console.log(`Sandbox: ${sandbox.id}`);

  const html = await readFile(new URL('../web/index.html', import.meta.url));
  await sandbox.fs.uploadFile(html, 'site/index.html');

  // Long-running server → background session command
  await sandbox.process.createSession('web');
  await sandbox.process.executeSessionCommand('web', {
    command: `cd site && python3 -m http.server ${PORT}`,
    runAsync: true,
  });

  const preview = await sandbox.getPreviewLink(PORT);
  console.log(`\n✅ Your page: ${preview.url}\n`);
}

async function list() {
  for await (const s of daytona.list({ labels: LABEL })) {
    console.log(`${s.id}  ${s.state}`);
  }
}

async function clean() {
  for await (const s of daytona.list({ labels: LABEL })) {
    console.log(`Deleting ${s.id}…`);
    await daytona.delete(s);
  }
}

const cmd = process.argv[2] ?? 'up';
await ({ up, list, clean } as Record<string, () => Promise<void>>)[cmd]?.() ??
  console.error(`Unknown command: ${cmd}`);

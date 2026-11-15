// Builds the Daytona snapshot every airline demo starts from: Postgres, Redis,
// the belli-api binary and the belli frontend, already built in no-login demo
// mode, plus the sandbox/ runtime. See docs/factory-contract.md.
//
//   cd factory && npm i
//   DAYTONA_API_KEY=... GITHUB_TOKEN=... npm run snapshot
//
// Optional env:
//   SNAPSHOT_NAME   default belli-demo-stack-v1
//   API_REF         default claude/demo-profile-json (belli-ai/belli-api)
//   FE_REF          default release/demo            (belli-ai/belli)
//   BUILD_CPU / BUILD_MEMORY / BUILD_DISK   default 4 / 8 / 10 (10 GiB is the per-sandbox max)
//   FE_EXTRA_ENV    path to a file of extra KEY=VALUE lines for the FE build
//                   (e.g. NEXT_PUBLIC_POSTHOG_KEY / _HOST from the demo Vercel project)
//   API_EXTRA_ENV   path to a file of extra KEY=VALUE lines for belli-api
//   KEEP_BUILDER=1  keep the build sandbox afterwards (debugging)

import { Daytona, type Sandbox } from "@daytona/sdk"
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { DEMO_POSTPAID_AGENT_ID, DEMO_PREPAID_AGENT_ID } from "../lib/profile"

const here = dirname(fileURLToPath(import.meta.url))
const SANDBOX_DIR = join(here, "..", "..", "sandbox")

const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d
  if (v === undefined) throw new Error(`Missing ${k}`)
  return v
}

const SNAPSHOT_NAME = env("SNAPSHOT_NAME", "belli-demo-stack-v1")
const API_REF = env("API_REF", "claude/demo-profile-json")
const FE_REF = env("FE_REF", "release/demo")
const GITHUB_TOKEN = env("GITHUB_TOKEN")
env("DAYTONA_API_KEY")

export const ORG_ID = "org_belli_demo_factory"
const BYPASS_TOKEN = randomBytes(18).toString("hex")
const DB_PASSWORD = randomBytes(12).toString("hex")

const extra = (name: string) => {
  const path = process.env[name]
  return path && existsSync(path) ? readFileSync(path, "utf8").trim() + "\n" : ""
}

// FE build env: constants from the contract + placeholders that inject.mjs replaces at boot.
const feEnv =
  [
    "NODE_ENV=production",
    "NEXT_TELEMETRY_DISABLED=1",
    "NEXT_PUBLIC_APP_ENV=demo",
    "NEXT_PUBLIC_DEMO_NO_AUTH=true",
    `STRICT_ORG_ID=${ORG_ID}`,
    `NEXT_PUBLIC_BYPASS_TOKEN=${BYPASS_TOKEN}`,
    "NEXT_PUBLIC_API_URL=https://belli-demo-api.invalid/api",
    `NEXT_PUBLIC_TENANT_BRAND={"key":"belli-demo","displayName":"Belli Demo Airline Placeholder","primaryColorHex":"#fe01dc","logo":"/belli-demo-logo.svg"}`,
    `NEXT_PUBLIC_ALLOWED_HOSTS={"dashboard":["dashboard.belli-demo.internal"],"booking-portal":["portal.belli-demo.internal"]}`,
    `NEXT_PUBLIC_DEMO_PREPAID_AGENT_ID=${DEMO_PREPAID_AGENT_ID}`,
    `NEXT_PUBLIC_DEMO_POSTPAID_AGENT_ID=${DEMO_POSTPAID_AGENT_ID}`,
    // The production build throws without these; real values come from FE_EXTRA_ENV.
    "NEXT_PUBLIC_POSTHOG_KEY=phc_belli_demo_factory_disabled",
    "NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com",
  ].join("\n") +
  "\n" +
  extra("FE_EXTRA_ENV") // later lines win

const apiEnv =
  [
    "ENV=demo",
    "DB_HOST=127.0.0.1",
    "DB_PORT=5432",
    "DB_NAME=belli_demo",
    "DB_USER=belli",
    `DB_PASSWORD=${DB_PASSWORD}`,
    "REDIS_ADDR=127.0.0.1:6379",
    "REDIS_PASSWORD=",
    `BYPASS_TOKEN=${BYPASS_TOKEN}`,
    `BYPASS_ORG_ID=${ORG_ID}`,
    "BYPASS_USER_ID=user_demo",
    "BYPASS_ROLES=org:belli",
    "RBAC_ENABLED=false",
    "REQUEST_LOG_DISABLED=true",
    "BOOKING_DECISION_TRACE_ENABLED=false",
    "OUTBOX_EVENTS_ENABLED=false",
  ].join("\n") +
  "\n" +
  extra("API_EXTRA_ENV")

const BUILD = String.raw`#!/usr/bin/env bash
set -euo pipefail  # no -x: it would print the clone header and DB password
export DEBIAN_FRONTEND=noninteractive
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
as_postgres() { if [ "$(id -u)" -eq 0 ]; then runuser -u postgres -- "$@"; else sudo -u postgres "$@"; fi; }
H=/home/daytona
$SUDO mkdir -p $H/demo && $SUDO chown -R "$(id -u):$(id -g)" $H

echo "### packages"
$SUDO apt-get update -q
$SUDO apt-get install -y -q --no-install-recommends curl git ca-certificates postgresql postgresql-contrib redis-server build-essential xz-utils
$SUDO apt-get clean && $SUDO rm -rf /var/lib/apt/lists/*   # 10 GiB disk cap per sandbox
df -h / | tail -1

echo "### toolchains"
curl -fsSL https://go.dev/dl/go1.27.3.linux-amd64.tar.gz | $SUDO tar -C /usr/local -xz
curl -fsSL https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz | $SUDO tar -C /usr/local --strip-components=1 -xJ
$SUDO curl -fsSL https://release.ariga.io/atlas/atlas-linux-amd64-latest -o /usr/local/bin/atlas && $SUDO chmod +x /usr/local/bin/atlas
export PATH=/usr/local/go/bin:/usr/local/bin:$PATH
# Node 22.11's bundled Corepack has stale signing keys ("Cannot find matching keyid").
$SUDO npm install -g corepack@latest
$SUDO corepack enable

echo "### sources"
AUTH="Authorization: basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)"
rm -rf $H/belli-api $H/belli
git -c http.extraHeader="$AUTH" clone -q --depth 1 --branch "$API_REF" https://github.com/belli-ai/belli-api $H/belli-api
git -c http.extraHeader="$AUTH" clone -q --depth 1 --branch "$FE_REF" https://github.com/belli-ai/belli $H/belli
echo "api $(git -C $H/belli-api rev-parse --short HEAD) fe $(git -C $H/belli rev-parse --short HEAD)" > $H/demo/VERSION
rm -rf $H/belli-api/.git $H/belli/.git

echo "### belli-api"
cd $H/belli-api
GOFLAGS=-mod=mod go build -o api .
go clean -modcache -cache || true
df -h / | tail -1

echo "### belli frontend"
cd $H/belli
cp $H/demo/fe.env .env.production.local
corepack prepare --activate || true
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=6144 pnpm build
rm -rf .next/cache
pnpm store prune || true
rm -rf "$(pnpm store path 2>/dev/null)" ~/.cache || true
df -h / | tail -1

echo "### database"
$SUDO service postgresql start
for i in $(seq 1 30); do pg_isready -q && break; sleep 1; done
set -a; . $H/demo/api.env; set +a
as_postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'" -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
# The baseline migration creates these; do it as superuser so the app role never needs to.
as_postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public' -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public' 
$SUDO service postgresql stop
$SUDO service redis-server stop || true

chmod +x $H/demo/bootstrap.sh
echo "### done"
`

async function run(sandbox: Sandbox, label: string, command: string, envs: Record<string, string>, timeoutMin: number) {
  const session = `build-${Date.now()}`
  await sandbox.process.createSession(session)
  const prefix = Object.entries(envs)
    .map(([k, v]) => `${k}='${v.replace(/'/g, "'\\''")}'`)
    .join(" ")
  const { cmdId } = await sandbox.process.executeSessionCommand(session, { command: `${prefix} ${command}`, runAsync: true })
  const started = Date.now()
  let printed = 0
  for (;;) {
    await new Promise((r) => setTimeout(r, 15_000))
    const logs = await sandbox.process.getSessionCommandLogs(session, cmdId!)
    const out = logs.output ?? `${logs.stdout ?? ""}${logs.stderr ?? ""}`
    const lines = out.split("\n")
    const fresh = lines.slice(printed).filter((l) => l.startsWith("### ") || /error|fail/i.test(l))
    for (const l of fresh) console.log(`[${label}] ${l.slice(0, 300)}`)
    printed = lines.length
    const cmd = await sandbox.process.getSessionCommand(session, cmdId!)
    if (cmd.exitCode !== undefined && cmd.exitCode !== null) {
      if (cmd.exitCode !== 0) {
        console.error(lines.slice(-60).join("\n"))
        throw new Error(`${label} failed with exit code ${cmd.exitCode}`)
      }
      return
    }
    if (Date.now() - started > timeoutMin * 60_000) throw new Error(`${label} timed out after ${timeoutMin} min`)
    console.log(`[${label}] … ${Math.round((Date.now() - started) / 60_000)} min`)
  }
}

async function main() {
  const daytona = new Daytona()
  const resources = { cpu: Number(env("BUILD_CPU", "4")), memory: Number(env("BUILD_MEMORY", "8")), disk: Number(env("BUILD_DISK", "10")) }
  console.log(`Creating build sandbox (ubuntu:24.04, ${JSON.stringify(resources)})…`)
  const sandbox = await daytona.create(
    { image: "ubuntu:24.04", resources, labels: { kind: "belli-demo-builder" }, autoStopInterval: 120 },
    { timeout: 600 },
  )
  console.log(`Build sandbox: ${sandbox.id}`)
  try {
    await sandbox.process.executeCommand("mkdir -p /home/daytona/demo || sudo mkdir -p /home/daytona/demo && sudo chown -R $(id -u) /home/daytona")
    for (const f of ["bootstrap.sh", "edge.mjs", "inject.mjs"]) {
      await sandbox.fs.uploadFile(readFileSync(join(SANDBOX_DIR, f)), `/home/daytona/demo/${f}`)
    }
    await sandbox.fs.uploadFile(Buffer.from(feEnv), "/home/daytona/demo/fe.env")
    await sandbox.fs.uploadFile(Buffer.from(apiEnv), "/home/daytona/demo/api.env")
    await sandbox.fs.uploadFile(Buffer.from(BUILD), "/home/daytona/build.sh")

    await run(sandbox, "build", "bash /home/daytona/build.sh", { GITHUB_TOKEN, API_REF, FE_REF }, 60)
    await sandbox.process.executeCommand("rm -f /home/daytona/build.sh")

    console.log(`Creating snapshot ${SNAPSHOT_NAME}…`)
    await sandbox.createSnapshot(SNAPSHOT_NAME, 1800)
    console.log(`\nSnapshot ready: ${SNAPSHOT_NAME}`)
    console.log("Next: create a demo from it (factory /api/demo, or scripts/try-demo.ts).")
  } finally {
    if (!process.env.KEEP_BUILDER) await sandbox.delete().catch(() => {})
    else console.log(`Kept build sandbox ${sandbox.id}`)
  }
}

main().catch((e) => {
  console.error(`build-snapshot failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})

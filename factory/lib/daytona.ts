// Daytona side of the factory: one sandbox per airline, found by label,
// created from the prebuilt snapshot (docs/factory-contract.md).
import { Daytona, type Sandbox } from "@daytona/sdk"

import { RUNTIME_FILES } from "./runtime-files"

export const DASHBOARD_PORT = 3000
/**
 * Raw-preview fallback (no custom domain yet): edge.mjs serves the booking
 * portal on this port when no X-Demo-Public-Host header is present, and the
 * dashboard on DASHBOARD_PORT. Proposed to Claude A in issue #1.
 */
export const PORTAL_PORT = 4000 // edge.mjs serves the portal on :3001 and :4000
export const SNAPSHOT = process.env.DEMO_SNAPSHOT ?? "belli-demo-stack-v1"
const DEMO_DIR = "/home/daytona/demo"

export type DemoStatus = {
  state: "absent" | "waking" | "booting" | "seeding" | "starting" | "ready" | "error"
  step?: string
  error?: string
}

let client: Daytona | null = null
export function daytonaConfigured(): boolean {
  return Boolean(process.env.DAYTONA_API_KEY)
}
function daytona(): Daytona {
  client ??= new Daytona()
  return client
}

export async function findDemo(slug: string): Promise<Sandbox | null> {
  for await (const sandbox of daytona().list({ labels: { kind: "belli-demo", slug } })) {
    return sandbox
  }
  return null
}

export type DemoFiles = {
  profile: unknown
  brand: { displayName: string; primaryColorHex: string; iata: string }
  /** Custom-domain hosts; omit to use the sandbox's own preview hosts (v0). */
  hosts?: { dashboard: string; portal: string }
  logo?: Buffer
}

/** Create the airline's sandbox from the snapshot, upload its files, start bootstrap. */
export async function createDemo(slug: string, iata: string, files: DemoFiles): Promise<Sandbox> {
  const sandbox = await daytona().create({
    snapshot: SNAPSHOT,
    public: true,
    labels: { kind: "belli-demo", slug, airline: iata, snapshot: SNAPSHOT },
    autoStopInterval: 30,
  })
  // hosts.json must name the hosts the browser really uses: inject.mjs puts
  // https://<dashboard>/belli-api into the FE, and edge.mjs allows CORS for both.
  const hosts = files.hosts ?? {
    dashboard: new URL((await sandbox.getPreviewLink(DASHBOARD_PORT)).url).host,
    portal: new URL((await sandbox.getPreviewLink(PORTAL_PORT)).url).host,
  }
  const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2))
  await sandbox.fs.createFolder(DEMO_DIR, "755").catch(() => undefined)
  await sandbox.fs.uploadFiles([
    { source: json(files.profile), destination: `${DEMO_DIR}/profile.json` },
    { source: json(files.brand), destination: `${DEMO_DIR}/brand.json` },
    { source: json(hosts), destination: `${DEMO_DIR}/hosts.json` },
    ...(files.logo ? [{ source: files.logo, destination: `${DEMO_DIR}/logo.png` }] : []),
  ])
  await runBootstrap(sandbox)
  return sandbox
}

/** bootstrap.sh is idempotent: first run seeds, later runs only start services. */
export async function runBootstrap(sandbox: Sandbox): Promise<void> {
  // Latest runtime scripts on every run, so sandbox/ fixes need no snapshot rebuild.
  await sandbox.fs.uploadFiles(
    Object.entries(RUNTIME_FILES).map(([name, text]) => ({ source: Buffer.from(text), destination: `${DEMO_DIR}/${name}` })),
  )
  const session = `bootstrap-${Date.now()}`
  await sandbox.process.createSession(session)
  await sandbox.process.executeSessionCommand(session, {
    command: `bash ${DEMO_DIR}/bootstrap.sh`, // it appends to bootstrap.log itself
    runAsync: true,
  })
}

/** Start a stopped/archived sandbox and re-run bootstrap. Returns false if already running. */
export async function wakeDemo(sandbox: Sandbox): Promise<boolean> {
  if (sandbox.state === "started") return false
  await sandbox.start(120)
  await runBootstrap(sandbox)
  return true
}

export async function readStatus(sandbox: Sandbox): Promise<DemoStatus> {
  if (sandbox.state !== "started") return { state: "waking", step: sandbox.state }
  try {
    const raw = await sandbox.fs.downloadFile(`${DEMO_DIR}/status.json`, 10)
    return JSON.parse(raw.toString()) as DemoStatus
  } catch {
    return { state: "booting", step: "waiting for bootstrap" }
  }
}

const previewCache = new Map<string, { url: string; at: number }>()

/** Public preview origin of a sandbox port (cached; URLs are stable per sandbox). */
export async function previewOrigin(sandbox: Sandbox, port = DASHBOARD_PORT): Promise<string> {
  const key = `${sandbox.id}:${port}`
  const hit = previewCache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.url
  const { url } = await sandbox.getPreviewLink(port)
  const origin = new URL(url).origin
  previewCache.set(key, { url: origin, at: Date.now() })
  return origin
}

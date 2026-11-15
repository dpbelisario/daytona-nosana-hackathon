// Daytona side of the factory: one sandbox per airline, found by label,
// created from the prebuilt snapshot. Mirrors scripts/try-demo.ts.
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Daytona, type Sandbox } from "@daytona/sdk"

export const DASHBOARD_PORT = 3000
/** sandbox/edge.mjs serves the booking portal here (raw previews work as-is). */
export const PORTAL_PORT = 3001
export const SNAPSHOT = process.env.DEMO_SNAPSHOT ?? process.env.SNAPSHOT_NAME ?? "belli-demo-stack-v1"
const RUNTIME_FILES = ["bootstrap.sh", "edge.mjs", "inject.mjs"]
// next.config.mjs traces ../sandbox/* into the server bundle.
const SANDBOX_DIR = join(process.cwd(), "..", "sandbox")
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
  /** Public hosts; null = use the sandbox's raw Daytona preview hosts. */
  hosts: { dashboard: string; portal: string } | null
  logoUrls: string[]
}

/** Create the airline's sandbox from the snapshot, upload its files, start bootstrap. */
export async function createDemo(slug: string, iata: string, files: DemoFiles): Promise<Sandbox> {
  const sandbox = await daytona().create(
    {
      snapshot: SNAPSHOT,
      public: true,
      labels: { kind: "belli-demo", slug, airline: iata, snapshot: SNAPSHOT },
      autoStopInterval: 60,
    },
    { timeout: 280 },
  )
  if (process.env.DEMO_CPU) {
    const resources = {
      cpu: Number(process.env.DEMO_CPU),
      memory: Number(process.env.DEMO_MEMORY || 4),
      disk: Number(process.env.DEMO_DISK || 10),
    }
    await sandbox.resize(resources).catch((e: Error) => console.warn(`resize skipped: ${e.message}`))
  }
  const hosts = files.hosts ?? {
    dashboard: new URL((await sandbox.getPreviewLink(DASHBOARD_PORT)).url).host,
    portal: new URL((await sandbox.getPreviewLink(PORTAL_PORT)).url).host,
  }
  const json = (value: unknown) => Buffer.from(JSON.stringify(value))
  const logo = await fetchLogo(files.logoUrls)
  await sandbox.fs.createFolder(DEMO_DIR, "755").catch(() => undefined)
  await sandbox.fs.uploadFiles([
    { source: json(files.profile), destination: `${DEMO_DIR}/profile.json` },
    { source: json(files.brand), destination: `${DEMO_DIR}/brand.json` },
    { source: json(hosts), destination: `${DEMO_DIR}/hosts.json` },
    ...(logo ? [{ source: logo, destination: `${DEMO_DIR}/logo.png` }] : []),
  ])
  await runBootstrap(sandbox)
  return sandbox
}

/**
 * Upload the current sandbox runtime (fixes apply without a new snapshot),
 * then run bootstrap.sh. It is idempotent: first run seeds, later runs only
 * start services.
 */
export async function runBootstrap(sandbox: Sandbox): Promise<void> {
  await sandbox.fs.uploadFiles(
    RUNTIME_FILES.map((f) => ({ source: readFileSync(join(SANDBOX_DIR, f)), destination: `${DEMO_DIR}/${f}` })),
  )
  const session = `boot-${Date.now()}`
  await sandbox.process.createSession(session)
  await sandbox.process.executeSessionCommand(session, { command: `bash ${DEMO_DIR}/bootstrap.sh`, runAsync: true })
}

async function fetchLogo(urls: string[]): Promise<Buffer | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > 200) return buf
      }
    } catch {
      // try the next source
    }
  }
  return null
}

/** Start a stopped/archived sandbox and re-run bootstrap. Returns false if already running. */
export async function wakeDemo(sandbox: Sandbox): Promise<boolean> {
  if (sandbox.state === "started") return false
  await sandbox.start(240)
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

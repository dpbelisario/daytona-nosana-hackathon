// Daytona side of the factory: one sandbox per airline, found by label,
// created from the prebuilt snapshot. Mirrors scripts/try-demo.ts.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Daytona, type Sandbox } from "@daytona/sdk"

export const DASHBOARD_PORT = 3000
/** sandbox/edge.mjs serves the booking portal here (raw previews work as-is). */
export const PORTAL_PORT = 3001
export const SNAPSHOT = process.env.DEMO_SNAPSHOT ?? process.env.SNAPSHOT_NAME ?? "belli-demo-stack-v1"
const RUNTIME_FILES = ["bootstrap.sh", "edge.mjs", "inject.mjs", "hosts.mjs"]
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
/**
 * The account's total vCPU/memory cap (Tier 1: 10 GiB) fits one demo at a time,
 * since each inherits the snapshot's 8 GiB. When a create or start hits the cap,
 * stop the least recently used other demo and retry. It wakes again on its next visit.
 */
function isCapacityError(e: unknown): boolean {
  return /limit exceeded|Maximum allowed|concurrency limits/i.test(String((e as Error)?.message ?? e))
}

async function waitStopped(s: Sandbox, timeoutMs = 120_000): Promise<void> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    await s.refreshData().catch(() => {})
    if (s.state === "stopped" || s.state === "archived") return
    await new Promise((r) => setTimeout(r, 3000))
  }
}

/** Disk cap (30 GiB on Tier 1) counts stopped sandboxes too: archive the oldest stopped demo. */
async function freeDisk(keepSlug: string): Promise<boolean> {
  const stopped: Sandbox[] = []
  for await (const s of daytona().list({ labels: { kind: "belli-demo" } })) {
    if (s.labels?.slug !== keepSlug && s.state === "stopped") stopped.push(s)
  }
  if (stopped.length === 0) return false
  const at = (x: Sandbox) => String((x as { lastActivityAt?: string }).lastActivityAt ?? x.updatedAt ?? "")
  stopped.sort((a, b) => at(a).localeCompare(at(b)))
  const victim = stopped[0]
  console.log("disk full: archiving demo", victim.labels?.slug)
  await victim.archive().catch((e: Error) => console.warn("archive failed", victim.labels?.slug, e.message))
  const until = Date.now() + 240_000
  while (Date.now() < until) {
    await victim.refreshData().catch(() => {})
    if (victim.state === "archived") break
    await new Promise((r) => setTimeout(r, 4000))
  }
  return true
}

async function freeCapacity(keepSlug: string): Promise<boolean> {
  const running: Sandbox[] = []
  for await (const s of daytona().list({ labels: { kind: "belli-demo" } })) {
    if (s.labels?.slug === keepSlug) continue
    // Already on its way down: just wait for it to release its memory.
    if (s.state === "stopping") {
      await waitStopped(s)
      return true
    }
    if (s.state === "started") running.push(s)
  }
  if (running.length === 0) return false
  const at = (x: Sandbox) => String((x as { lastActivityAt?: string }).lastActivityAt ?? x.updatedAt ?? "")
  running.sort((a, b) => at(a).localeCompare(at(b)))
  const victim = running[0]
  console.log("capacity full: stopping demo", victim.labels?.slug)
  await victim.stop(120).catch((e: Error) => console.warn("stop failed", victim.labels?.slug, e.message))
  await waitStopped(victim)
  return true
}

async function withCapacity<T>(keepSlug: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= 3 || !isCapacityError(e)) throw e
      const freed = /disk/i.test(String((e as Error)?.message)) ? await freeDisk(keepSlug) : await freeCapacity(keepSlug)
      if (!freed) throw e
    }
  }
}

export async function createDemo(slug: string, iata: string, files: DemoFiles): Promise<Sandbox> {
  // Daytona rejects resources together with a snapshot; the snapshot's size applies.
  const sandbox = await withCapacity(slug, () =>
    daytona().create(
      {
        snapshot: SNAPSHOT,
        public: true,
        labels: { kind: "belli-demo", slug, airline: iata, snapshot: SNAPSHOT },
        autoStopInterval: 60,
      },
      { timeout: 280 },
    ),
  )
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
  await sandbox.fs.uploadFiles([
    ...RUNTIME_FILES.map((f) => ({ source: readFileSync(join(SANDBOX_DIR, f)), destination: `${DEMO_DIR}/${f}` })),
    { source: Buffer.from(runtimeVersion()), destination: `${DEMO_DIR}/runtime.version` },
  ])
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
  await withCapacity(String(sandbox.labels?.slug ?? ""), () => sandbox.start(240))
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

function runtimeVersion(): string {
  const h = createHash("sha256")
  for (const f of RUNTIME_FILES) h.update(readFileSync(join(SANDBOX_DIR, f)))
  return h.digest("hex").slice(0, 16)
}

/**
 * Re-run bootstrap when a running sandbox has an older sandbox/ runtime than
 * this deployment (fixes reach existing demos without recreating them).
 * Returns true when a re-run was started.
 */
export async function ensureRuntime(sandbox: Sandbox): Promise<boolean> {
  const current = await sandbox.fs
    .downloadFile(`${DEMO_DIR}/runtime.version`, 10)
    .then((b) => b.toString().trim())
    .catch(() => "")
  if (current === runtimeVersion()) return false
  await runBootstrap(sandbox)
  return true
}

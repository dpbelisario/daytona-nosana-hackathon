// Creates (or reuses) one airline demo from the snapshot and prints its links.
// The fastest path to a test link, without the web layer.
//
//   cd factory && DAYTONA_API_KEY=... npm run try -- "Etihad"
//
// Optional: SNAPSHOT_NAME (default belli-demo-stack-v1), LLM_BASE_URL (Nosana),
// AEROAPI_KEY (real schedules), DEMO_CPU/DEMO_MEMORY/DEMO_DISK.

import { Daytona, type Sandbox } from "@daytona/sdk"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { fetchLogo } from "../lib/logo"
import { generateProfile } from "../lib/profile"

// Runtime scripts are uploaded on every run, so fixes to sandbox/ apply
// without rebuilding the snapshot.
const SANDBOX_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sandbox")
async function uploadRuntime(sandbox: Sandbox) {
  for (const f of ["bootstrap.sh", "edge.mjs", "inject.mjs", "hosts.mjs"]) {
    await sandbox.fs.uploadFile(readFileSync(join(SANDBOX_DIR, f)), `/home/daytona/demo/${f}`)
  }
}

const SNAPSHOT = process.env.SNAPSHOT_NAME || "belli-demo-stack-v1"

async function publicHost(sandbox: Sandbox, port: number): Promise<string> {
  const link = await sandbox.getPreviewLink(port)
  return new URL(link.url).host
}

async function main() {
  const query = process.argv.slice(2).join(" ") || "Etihad"
  const daytona = new Daytona(process.env.DAYTONA_API_KEY ? undefined : { apiKey: "via-network-secret" })

  console.log(`Generating profile for "${query}"…`)
  const g = await generateProfile(query)
  console.log(`  ${g.airline.name} (${g.airline.iata}, AWB ${g.airline.awbPrefix}) slug=${g.slug} sources=${JSON.stringify(g.sources)}`)

  const labels = { kind: "belli-demo", slug: g.slug }
  let sandbox: Sandbox | undefined
  for await (const s of daytona.list({ labels })) {
    sandbox = s
    break
  }

  if (sandbox) {
    console.log(`Reusing sandbox ${sandbox.id} (${sandbox.state})`)
    if (sandbox.state !== "started") await sandbox.start(300)
  } else {
    console.log(`Creating sandbox from snapshot ${SNAPSHOT}…`)
    sandbox = await daytona.create(
      {
        snapshot: SNAPSHOT,
        public: true,
        labels: { ...labels, airline: g.airline.iata, snapshot: SNAPSHOT },
        autoStopInterval: 60,
      },
      { timeout: 600 },
    )

  }

  // Upload the airline files unless this sandbox was already seeded.
  const seeded = await sandbox.process.executeCommand("test -f /home/daytona/demo/.seeded && echo yes || echo no")
  if (!seeded.result.includes("yes")) {
    const dashboard = await publicHost(sandbox, 3000)
    const portal = await publicHost(sandbox, 3001)
    const files: [string, Buffer][] = [
      ["profile.json", Buffer.from(JSON.stringify(g.profile))],
      ["brand.json", Buffer.from(JSON.stringify({ displayName: g.brand.displayName, primaryColorHex: g.brand.primaryColorHex, iata: g.brand.iata }))],
      ["hosts.json", Buffer.from(JSON.stringify({ dashboard, portal }))],
    ]
    const logo = await fetchLogo(g.brand.logoUrls)
    if (logo) files.push(["logo.png", logo])
    for (const [name, data] of files) await sandbox.fs.uploadFile(data, `/home/daytona/demo/${name}`)
    console.log(`  uploaded ${files.map((f) => f[0]).join(", ")}${logo ? "" : " (no logo found; monogram will be used)"}`)

  }

  await uploadRuntime(sandbox)
  // Idempotent: seeds on first run, only starts services afterwards.
  await sandbox.process.createSession("boot").catch(() => {})
  await sandbox.process.executeSessionCommand("boot", { command: "bash /home/daytona/demo/bootstrap.sh", runAsync: true })

  const dashboardUrl = (await sandbox.getPreviewLink(3000)).url
  const portalUrl = (await sandbox.getPreviewLink(3001)).url
  console.log(`\nDashboard:      ${dashboardUrl}`)
  console.log(`Booking portal: ${portalUrl}`)
  console.log(`Progress:       ${dashboardUrl.replace(/\/$/, "")}/__demo/status\n`)

  const started = Date.now()
  let last = ""
  while (Date.now() - started < 20 * 60_000) {
    await new Promise((r) => setTimeout(r, 10_000))
    try {
      const res = await fetch(`${dashboardUrl.replace(/\/$/, "")}/__demo/status`, { headers: { "X-Daytona-Skip-Preview-Warning": "true" } })
      const s = (await res.json()) as { state: string; step: string; error?: string }
      const line = `${s.state}: ${s.step}`
      if (line !== last) console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${line}`)
      last = line
      if (s.state === "ready") return console.log("\n✅ Demo is ready. Open the links above.")
      if (s.state === "error") {
        console.error(`\n❌ ${s.step}\n${s.error ?? ""}\nLogs: /home/daytona/demo/{bootstrap,api,fe,edge}.log in sandbox ${sandbox.id}`)
        process.exit(1)
      }
    } catch {
      /* edge not up yet */
    }
  }
  console.log("Still not ready after 20 min; check /home/daytona/demo/bootstrap.log in the sandbox.")
}

main().catch((e) => {
  console.error(`try-demo failed: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})

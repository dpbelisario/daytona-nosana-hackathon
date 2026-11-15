// Runs on every boot (idempotent). Patches the prebuilt frontend for this sandbox:
// 1. Adds the public hosts to the inlined NEXT_PUBLIC_ALLOWED_HOSTS. The browser
//    resolves dashboard vs booking portal from window.location.host; without its
//    real host there it never sends X-Agent-ID and the portal lands on /unauthorized.
// 2. Puts the airline's logo and name in the dashboard's top-left identity row
//    (demo mode hardcodes /logos/belli-logo.png and "Demo User").
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const DIR = process.env.DEMO_DIR || "/home/daytona/demo"
const FE = process.env.FE_DIR || "/home/daytona/belli"
const readJson = (f) => { try { return JSON.parse(readFileSync(join(DIR, f), "utf8")) } catch { return {} } }
const hosts = readJson("hosts.json")
const brand = readJson("brand.json")
const clean = (s) => String(s ?? "").replace(/["'`\\<>{}$]/g, "").trim()
const name = clean(brand.displayName)

const rules = [] // [needle, replacement, skipIfPresent]
// Raw preview hosts: register the portal on both :3001 and :4000 (edge serves both).
const siblings = (h, ports) => { const m = /^\d+-(.+)$/.exec(h || ""); return m ? ports.map((p) => `${p}-${m[1]}`) : [h] }
const pairs = [
  ...siblings(clean(hosts.dashboard), ["3000"]).map((h) => ["dashboard.belli-demo.internal", h]),
  ...siblings(clean(hosts.portal), ["3001", "4000"]).map((h) => ["portal.belli-demo.internal", h]),
]
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const listRules = [] // [regex, host, plainPresent, escapedPresent]
for (const [internal, pub] of pairs) {
  if (!pub) continue
  // Append to the end of the inlined list, e.g. ["portal.belli-demo.internal","h1"] → […,"h2"].
  listRules.push([new RegExp(`(${esc(internal)}"(?:,"[^"\\]]*")*)\\]`, "g"), `$1,"${pub}"]`, `"${pub}"`])
  listRules.push([new RegExp(`(${esc(internal)}\\\\"(?:,\\\\"[^"\\\\\\]]*\\\\")*)\\]`, "g"), `$1,\\"${pub}\\"]`, `\\"${pub}\\"`])
}
rules.push(['"/logos/belli-logo.png"', '"/belli-demo-logo.svg"', null])
if (name) rules.push(["Demo User", name, null])

const TEXT = /\.(js|mjs|cjs|json|html|rsc|body|meta|txt)$/
let changed = 0
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "cache") continue
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (TEXT.test(entry) && st.size < 50_000_000) {
      const before = readFileSync(p, "utf8")
      let after = before
      for (const [re, repl, present] of listRules) {
        if (!after.includes(present)) after = after.replace(re, repl)
      }
      for (const [needle, repl, present] of rules) {
        if (present && after.includes(present)) continue
        after = after.split(needle).join(repl)
      }
      if (after !== before) { writeFileSync(p, after); changed++ }
    }
  }
}
walk(join(FE, ".next"))
console.log(`hosts: ${changed} files updated (dashboard=${hosts.dashboard}, portal=${hosts.portal}, name=${name || "-"})`)

// Puts the airline's brand and API address into the prebuilt Belli frontend.
// The snapshot's `next build` used placeholders (see docs/factory-contract.md);
// this replaces them in the build output once, before `next start`.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const DIR = process.env.DEMO_DIR || "/home/daytona/demo"
const FE = process.env.FE_DIR || "/home/daytona/belli"
const brand = JSON.parse(readFileSync(`${DIR}/brand.json`, "utf8"))
const hosts = JSON.parse(readFileSync(`${DIR}/hosts.json`, "utf8"))

const clean = (s) => String(s).replace(/["'`\\<>{}$]/g, "").trim()
const name = clean(brand.displayName) || "Demo Airline"
const color = /^#[0-9a-fA-F]{6}$/.test(brand.primaryColorHex ?? "") ? brand.primaryColorHex.toLowerCase() : "#1f4e79"
const apiUrl = `https://${clean(hosts.dashboard)}/belli-api`

const replacements = [
  ["https://belli-demo-api.invalid/api", apiUrl],
  ["Belli Demo Airline Placeholder", name],
  ["#fe01dc", color],
  ["#FE01DC", color],
]

// Snapshots built before the fe.env quoting fix inlined a TRUNCATED brand:
// dotenv cut the unquoted value at "#", leaving ..."primaryColorHex":"  and
// the dashboard 500s on the invalid JSON. Complete it in both escape styles.
const tail = `#${color.slice(1)}","logo":"/belli-demo-logo.svg"}`
replacements.push(
  ['\\"primaryColorHex\\":\\""', '\\"primaryColorHex\\":\\"' + tail.replace(/"/g, '\\"') + '"'],
  [`"primaryColorHex":"'`, `"primaryColorHex":"${tail}'`],
  [`"primaryColorHex":"\``, `"primaryColorHex":"${tail}\``],
)

const TEXT = /\.(js|mjs|cjs|json|html|rsc|body|meta|txt|css|map)$/
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
      for (const [from, to] of replacements) after = after.split(from).join(to)
      if (after !== before) {
        writeFileSync(p, after)
        changed++
      }
    }
  }
}
walk(join(FE, ".next"))
// next start also loads the env file at runtime; keep it consistent with the build output.
for (const envFile of [".env.production.local", ".env.production", ".env"]) {
  const p = join(FE, envFile)
  if (!existsSync(p)) continue
  let text = readFileSync(p, "utf8")
  for (const [from, to] of replacements) text = text.split(from).join(to)
  // Quote JSON values: an unquoted "#" starts a comment in dotenv.
  text = text.replace(/^(NEXT_PUBLIC_TENANT_BRAND|NEXT_PUBLIC_ALLOWED_HOSTS)=(\{.*\})\s*$/gm, (_, k, v) => `${k}='${v}'`)
  text = text.replace(/^NEXT_PUBLIC_TENANT_BRAND='?\{[^\n]*$/m, `NEXT_PUBLIC_TENANT_BRAND='${JSON.stringify({ key: "belli-demo", displayName: name, primaryColorHex: color, logo: "/belli-demo-logo.svg" })}'`)
  writeFileSync(p, text)
}

// Logo: the brand's logo path is /belli-demo-logo.svg. Wrap a PNG if one was
// uploaded, else draw a monogram, so a logo always exists.
const iata = clean(brand.iata || name.slice(0, 2)).slice(0, 3).toUpperCase()
let svg
if (existsSync(`${DIR}/logo.png`) && statSync(`${DIR}/logo.png`).size > 100) {
  const b64 = readFileSync(`${DIR}/logo.png`).toString("base64")
  svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><image href="data:image/png;base64,${b64}" width="128" height="128" preserveAspectRatio="xMidYMid meet"/></svg>`
} else {
  svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="${color}"/><text x="64" y="80" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="700" text-anchor="middle" fill="#ffffff">${iata}</text></svg>`
}
writeFileSync(join(FE, "public", "belli-demo-logo.svg"), svg)
console.log(`inject: ${changed} files updated, api=${apiUrl}, name=${name}, color=${color}`)

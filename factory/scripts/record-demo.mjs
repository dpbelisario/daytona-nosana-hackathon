// Screen-records the real demo flow: belli.ai → Demo → email + airline →
// status → airline dashboard → booking portal. Plain clicks with smooth
// zoom-ins on what is being clicked; no voice-over, no generated graphics.
//
//   cd factory && npm i --no-save playwright && npx playwright install chromium
//   node scripts/record-demo.mjs [factoryUrl] [airline]
//     factoryUrl default https://belli-demo-factory.vercel.app
//     airline    default "Etihad"
//   DRY=1 records the homepage + form only and creates no sandbox.
//
// Output: out/demo-video/{1-request,2-dashboard,3-portal}.webm and, when
// ffmpeg is on PATH, out/demo-video/belli-demo.mp4 (the three joined).
// The wait while the sandbox boots is not recorded.

import { execFileSync } from "node:child_process"
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright"

const FACTORY = (process.argv[2] || "https://belli-demo-factory.vercel.app").replace(/\/$/, "")
const AIRLINE = process.argv[3] || "Etihad"
const OUT = join(process.cwd(), "out", "demo-video")
const SIZE = { width: 1440, height: 900 }
mkdirSync(OUT, { recursive: true })

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

/** Smoothly zoom the page toward an element, hold, then zoom back out. */
async function zoomOn(page, selector, { scale = 1.8, hold = 1200 } = {}) {
  const box = await page.locator(selector).first().boundingBox().catch(() => null)
  if (!box) return
  const ox = box.x + box.width / 2
  const oy = box.y + box.height / 2
  await page.evaluate(({ ox, oy, scale }) => {
    const el = document.documentElement
    el.style.transition = "transform 700ms ease-in-out"
    el.style.transformOrigin = `${ox}px ${oy + window.scrollY}px`
    el.style.transform = `scale(${scale})`
  }, { ox, oy, scale })
  await pause(700 + hold)
  await page.evaluate(() => (document.documentElement.style.transform = "scale(1)"))
  await pause(750)
}

async function clickWithZoom(page, selector, opts) {
  await zoomOn(page, selector, opts)
  await page.locator(selector).first().click()
}

async function clip(browser, name, fn) {
  const dir = join(OUT, `tmp-${name}`)
  const ctx = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir, size: SIZE },
    extraHTTPHeaders: { "X-Daytona-Skip-Preview-Warning": "true" },
  })
  const page = await ctx.newPage()
  try {
    return await fn(page)
  } finally {
    await ctx.close()
    const file = readdirSync(dir).find((f) => f.endsWith(".webm"))
    if (file) renameSync(join(dir, file), join(OUT, `${name}.webm`))
  }
}

async function tryClick(page, selectors, opts) {
  for (const s of selectors) {
    if (await page.locator(s).first().isVisible().catch(() => false)) {
      await clickWithZoom(page, s, opts)
      return true
    }
  }
  return false
}

const browser = await chromium.launch()

// 1. Request a demo on the belli.ai homepage.
const slug = await clip(browser, "1-request", async (page) => {
  await page.goto(FACTORY, { waitUntil: "networkidle" })
  await page.locator("button:has-text('Decline')").first().click({ timeout: 3000 }).catch(() => {})
  await pause(2500)
  await clickWithZoom(page, "[data-belli-demo]", { scale: 2.2 })
  await page.waitForSelector("#bd-card")
  await pause(800)
  await page.locator("#bd-email").pressSequentially("ops@airline-demo.example", { delay: 45 })
  await page.locator("#bd-airline").pressSequentially(AIRLINE, { delay: 90 })
  await page.waitForSelector("#bd-list div")
  await pause(600)
  await clickWithZoom(page, "#bd-list div", { scale: 1.6, hold: 600 })
  if (process.env.DRY) return null // DRY=1: record the form only, create nothing
  await clickWithZoom(page, "#bd-card button[type=submit]", { scale: 1.6, hold: 500 })
  await page.waitForURL(/\/demo\//, { timeout: 300_000 })
  await pause(4000) // show the "preparing" screen briefly
  return page.url().split("/demo/")[1]
})
if (!slug) {
  await browser.close()
  console.log(`dry run: ${join(OUT, "1-request.webm")}`)
  process.exit(0)
}
console.log(`demo slug: ${slug}; waiting for ready (not recorded)…`)

// 2. Wait for the sandbox, unrecorded.
let links
for (let i = 0; i < 120 && !links; i++) {
  const s = await (await fetch(`${FACTORY}/api/status/${slug}`)).json()
  if (s.state === "error") throw new Error(`demo failed: ${s.step} ${s.error ?? ""}`)
  if (s.state === "ready") links = s.links
  else await pause(10_000)
}
if (!links) throw new Error("demo not ready after 20 minutes")
console.log("ready:", links)

// 3. Airline dashboard: flights, AWBs.
await clip(browser, "2-dashboard", async (page) => {
  await page.goto(links.dashboard, { waitUntil: "networkidle" })
  await pause(3000)
  for (const path of ["/dashboards/flights", "/dashboards/air-waybills"]) {
    await page.goto(links.dashboard.replace(/\/$/, "") + path, { waitUntil: "networkidle" }).catch(() => {})
    await pause(2500)
    await zoomOn(page, "table tbody tr", { scale: 1.6, hold: 1800 })
    await tryClick(page, ["table tbody tr >> nth=0"], { scale: 1.5, hold: 600 })
    await pause(3000)
    await page.keyboard.press("Escape").catch(() => {})
  }
})

// 4. Booking portal: pick the demo agent, see bookings, start a booking.
await clip(browser, "3-portal", async (page) => {
  await page.goto(links.portal, { waitUntil: "networkidle" })
  await pause(2500)
  await tryClick(page, ["text=/prepaid/i", "button:has-text('Continue')", "[role=radio] >> nth=0"], { scale: 1.8 })
  await tryClick(page, ["button:has-text('Continue')", "button[type=submit]"], { scale: 1.6, hold: 500 })
  await page.waitForLoadState("networkidle").catch(() => {})
  await pause(3000)
  await zoomOn(page, "table tbody tr, main", { scale: 1.5, hold: 1800 })
  await tryClick(page, ["a:has-text('New booking')", "button:has-text('New booking')", "a[href*='/bookings/new']"], { scale: 1.8 })
  await pause(4000)
})

await browser.close()

const clips = ["1-request", "2-dashboard", "3-portal"].map((n) => join(OUT, `${n}.webm`))
try {
  const list = join(OUT, "clips.txt")
  writeFileSync(list, clips.map((c) => `file '${c}'`).join("\n"))
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(OUT, "belli-demo.mp4")])
  console.log(`video: ${join(OUT, "belli-demo.mp4")}`)
} catch {
  console.log(`clips: ${clips.join(", ")} (install ffmpeg to join them into one mp4)`)
}

// Records a click-through video of the demo factory: belli.ai → Demo →
// email + airline → status → airline dashboard → booking portal.
// Real screen only: smooth zooms and a visible cursor, no voice or AI graphics.
//
//   node video/record.mjs
// Env:
//   FACTORY_URL   default https://belli-demo-factory.vercel.app/
//   AIRLINE       default Etihad
//   SUBMIT=1      actually submit the form (creates/reuses the airline's sandbox)
//   DASHBOARD_URL / PORTAL_URL  open these directly (skip waiting on the status page)
//   OUT           default video/out/belli-demo.mp4
import { execFileSync } from "node:child_process"
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
const { chromium } = createRequire(import.meta.url)("playwright") // preinstalled globally

const FACTORY = process.env.FACTORY_URL || "https://belli-demo-factory.vercel.app/"
const AIRLINE = process.env.AIRLINE || "Etihad"
const OUT = process.env.OUT || "video/out/belli-demo.mp4"
const RAW = "video/out/raw"
const W = 1440
const H = 900

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Visible cursor + click ripple (headless video has no cursor).
const CURSOR = () => {
  const add = () => {
    if (document.getElementById("__cur")) return
    const c = document.createElement("div")
    c.id = "__cur"
    c.style.cssText =
      "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,90,31,.85);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none;transition:transform .12s"
    document.documentElement.appendChild(c)
    addEventListener("mousemove", (e) => (c.style.left = e.clientX + "px", c.style.top = e.clientY + "px"), true)
    addEventListener("mousedown", () => (c.style.transform = "scale(.7)"), true)
    addEventListener("mouseup", () => (c.style.transform = "scale(1)"), true)
  }
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", add) : add()
}

async function zoom(page, locator, scale = 1.8, hold = 1600) {
  const box = await locator.boundingBox().catch(() => null)
  if (!box) return
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.evaluate(
    ([x, y, s]) => {
      const el = document.documentElement
      el.style.transition = "transform .9s cubic-bezier(.2,.8,.2,1)"
      el.style.transformOrigin = `${x}px ${y + scrollY}px`
      el.style.transform = `scale(${s})`
    },
    [x, y, scale],
  )
  await sleep(900 + hold)
  await page.evaluate(() => (document.documentElement.style.transform = "scale(1)"))
  await sleep(900)
}

async function glideClick(page, locator) {
  const box = await locator.boundingBox()
  if (!box) return locator.click()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 })
  await sleep(250)
  await page.mouse.down()
  await page.mouse.up()
}

async function typeSlow(page, locator, text) {
  await glideClick(page, locator)
  await locator.pressSequentially(text, { delay: 70 })
}

async function tour(page, label, paths) {
  for (const p of paths) {
    console.log(`  ${label}: ${p}`)
    await page.goto(p, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => {})
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
    await sleep(2500)
    const table = page.locator("table, [role=grid]").first()
    if (await table.count()) await zoom(page, table, 1.4, 1800)
    await page.mouse.wheel(0, 500)
    await sleep(1500)
    await page.mouse.wheel(0, -500)
    await sleep(800)
  }
}

async function main() {
  rmSync(RAW, { recursive: true, force: true })
  mkdirSync(RAW, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: RAW, size: { width: W, height: H } },
    extraHTTPHeaders: { "X-Daytona-Skip-Preview-Warning": "true" },
  })
  await context.addInitScript(CURSOR)
  const page = await context.newPage()

  console.log("1. belli.ai home")
  await page.goto(FACTORY, { waitUntil: "domcontentloaded", timeout: 60_000 })
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
  await page.mouse.move(W / 2, H / 2)
  await sleep(2500)

  console.log("2. Demo → form")
  const demo = page.locator("[data-belli-demo]").first()
  await demo.scrollIntoViewIfNeeded().catch(() => {})
  await zoom(page, demo, 1.7, 900)
  await glideClick(page, demo)
  await page.locator("#bd-card").waitFor({ timeout: 10_000 })
  await sleep(800)
  await typeSlow(page, page.locator("#bd-email"), "ops@etihad.example")
  await typeSlow(page, page.locator("#bd-airline"), AIRLINE)
  const option = page.locator("#bd-list div").first()
  await option.waitFor({ timeout: 10_000 }).catch(() => {})
  await zoom(page, page.locator("#bd-card"), 1.5, 900)
  if (await option.count()) await glideClick(page, option)
  await sleep(800)

  let dashboard = process.env.DASHBOARD_URL
  let portal = process.env.PORTAL_URL
  if (process.env.SUBMIT === "1") {
    console.log("3. submit → status page")
    await glideClick(page, page.locator("#bd-card button[type=submit]"))
    await page.waitForURL(/\/demo\//, { timeout: 120_000 })
    await sleep(3000)
    if (!dashboard) {
      const link = page.locator("a", { hasText: /dashboard/i }).first()
      await link.waitFor({ timeout: 20 * 60_000 })
      dashboard = await link.getAttribute("href")
      portal = await page.locator("a", { hasText: /booking portal/i }).first().getAttribute("href")
      await zoom(page, link, 1.6, 1500)
    }
  }

  if (dashboard) {
    console.log("4. airline dashboard")
    const d = dashboard.replace(/\/$/, "")
    await tour(page, "dashboard", [`${d}/dashboards/air-waybills`, `${d}/flights`, `${d}/operations/aircraft`])
  }
  if (portal) {
    console.log("5. booking portal")
    const p = portal.replace(/\/$/, "")
    await tour(page, "portal", [`${p}/`, `${p}/bookings`])
  }

  await sleep(1500)
  await context.close()
  await browser.close()

  const webm = readdirSync(RAW).find((f) => f.endsWith(".webm"))
  if (!webm) throw new Error("no video recorded")
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(RAW, webm), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", OUT])
  console.log(`\nVideo: ${OUT}`)
}

main().catch((e) => {
  console.error(`record failed: ${e.message}`)
  process.exit(1)
})

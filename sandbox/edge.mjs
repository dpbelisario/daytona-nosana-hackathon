// Front door of a demo sandbox. See docs/factory-contract.md.
//  :3000 = internal dashboard, :3001 and :4000 = booking portal (raw Daytona preview
//  URLs work as-is). Behind the factory router, X-Demo-Public-Host decides.
//  /__demo/status → status.json (public; the factory polls it)
//  /belli-api/*   → belli-api on 127.0.0.1:1323 as /api/* (CORS for both public hosts)
//  everything else → Next on 127.0.0.1:3100, with Host set to the internal name
//                   for the dashboard or the booking portal.
// Until bootstrap reports "ready", app requests get a "preparing" page.
import { readFileSync } from "node:fs"
import http from "node:http"

const DIR = process.env.DEMO_DIR || "/home/daytona/demo"
const INTERNAL = { dashboard: "dashboard.belli-demo.internal", portal: "portal.belli-demo.internal" }

const readJson = (name, fallback) => {
  try {
    return JSON.parse(readFileSync(`${DIR}/${name}`, "utf8"))
  } catch {
    return fallback
  }
}
let hosts = readJson("hosts.json", {})
setInterval(() => (hosts = readJson("hosts.json", hosts)), 30_000).unref()

const publicHost = (req) =>
  String(req.headers["x-demo-public-host"] || req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase()

const contextOf = (host, fallback) => {
  if (hosts.portal && host === hosts.portal.toLowerCase()) return "portal"
  if (hosts.dashboard && host === hosts.dashboard.toLowerCase()) return "dashboard"
  return fallback
}

// The public hosts plus their sibling preview ports (3000/3001/4000-<sandbox>…).
const allowedOrigins = () => {
  const set = new Set([hosts.dashboard, hosts.portal].filter(Boolean).map((h) => `https://${h}`))
  for (const h of [hosts.dashboard, hosts.portal].filter(Boolean)) {
    const m = /^(\d+)-(.+)$/.exec(h)
    if (m) for (const port of ["3000", "3001", "4000"]) set.add(`https://${port}-${m[2]}`)
  }
  return set
}

function preparing(res, status) {
  res.writeHead(503, { "content-type": "text/html; charset=utf-8", "retry-after": "5", "cache-control": "no-store" })
  const step = status?.state === "error" ? `Something went wrong: ${String(status.error ?? "").slice(0, 300)}` : `Preparing your demo (${status?.step ?? "starting"})…`
  res.end(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Preparing demo</title>
<body style="font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0">
<div style="text-align:center"><p style="font-size:20px">${step.replace(/[<>&]/g, "")}</p><p style="opacity:.6">This page refreshes by itself.</p></div></body>`)
}

function forward(req, res, { port, path, headers, onHeaders }) {
  const upstream = http.request(
    { host: "127.0.0.1", port, method: req.method, path, headers },
    (up) => {
      const out = { ...up.headers }
      onHeaders?.(out)
      res.writeHead(up.statusCode ?? 502, out)
      up.pipe(res)
    },
  )
  upstream.on("error", () => {
    if (!res.headersSent) preparing(res, { state: "starting", step: "services" })
    else res.destroy()
  })
  req.pipe(upstream)
}

const handler = (portContext) => (req, res) => {
  const url = req.url || "/"
  const host = publicHost(req)

  if (url.startsWith("/__demo/status")) {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" })
    res.end(JSON.stringify(readJson("status.json", { state: "booting", step: "starting" })))
    return
  }

  const status = readJson("status.json", { state: "booting" })
  if (status.state !== "ready") return preparing(res, status)

  if (url === "/belli-api" || url.startsWith("/belli-api/")) {
    // Daytona's preview proxy already answers preflights and adds CORS headers
    // for the requesting origin; adding ours too sends the header twice and the
    // browser rejects it. So strip the API's CORS headers and add none.
    const cors = {}
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors)
      res.end()
      return
    }
    const headers = { ...req.headers, host: "127.0.0.1:1323", "x-forwarded-host": host, "x-forwarded-proto": "https" }
    return forward(req, res, {
      port: 1323,
      path: "/api" + url.slice("/belli-api".length),
      headers,
      onHeaders: (h) => {
        for (const k of Object.keys(h)) if (k.startsWith("access-control-")) delete h[k]
        Object.assign(h, cors)
      },
    })
  }

  const ctx = contextOf(host, portContext)
  const headers = { ...req.headers, host: INTERNAL[ctx], "x-forwarded-host": host, "x-forwarded-proto": "https" }
  forward(req, res, {
    port: 3100,
    path: url,
    headers,
    onHeaders: (h) => {
      if (typeof h.location === "string") {
        h.location = h.location
          .replace(/^https?:\/\/dashboard\.belli-demo\.internal/, hosts.dashboard ? `https://${hosts.dashboard}` : "")
          .replace(/^https?:\/\/portal\.belli-demo\.internal/, hosts.portal ? `https://${hosts.portal}` : "")
      }
    },
  })
}

http.createServer(handler("dashboard")).listen(3000, "0.0.0.0", () => console.log("edge: dashboard on :3000"))
// Portal on :3001 and :4000 (the factory web layer links :4000).
http.createServer(handler("portal")).listen(3001, "0.0.0.0", () => console.log("edge: booking portal on :3001"))
http.createServer(handler("portal")).listen(4000, "0.0.0.0", () => console.log("edge: booking portal on :4000"))

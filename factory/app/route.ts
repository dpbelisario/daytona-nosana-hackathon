// Landing page: the live https://www.belli.ai/ homepage, unchanged, except
// its "Demo" links open the per-airline demo form (public/demo-gate.js).
// Proxying instead of copying keeps it identical as marketing edits the site.

const SOURCE = process.env.DEMO_LANDING_SOURCE ?? "https://www.belli.ai/"
const DEMO_LINK = /href="https:\/\/demo\.getbelli\.ai[^"]*"/g

export const revalidate = 300

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  const res = await fetch(SOURCE, { headers: { "User-Agent": "belli-demo-factory" } })
  if (!res.ok) return new Response(`Landing source returned ${res.status}`, { status: 502 })
  let html = await res.text()
  html = html
    // Relative assets keep loading from the marketing site.
    .replace(/<head([^>]*)>/i, `<head$1><base href="${SOURCE}">`)
    // Absolute factory URL: <base> would otherwise resolve "#..." against the
    // marketing site if demo-gate.js has not loaded yet.
    .replace(DEMO_LINK, `href="${origin}/#belli-demo" data-belli-demo`)
    .replace(/<\/body>/i, `<script src="${origin}/demo-gate.js" defer></script></body>`)
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}

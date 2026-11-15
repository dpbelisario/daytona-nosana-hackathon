// Landing page: the live https://www.belli.ai/ homepage, unchanged, except
// its "Demo" links open the per-airline demo form (public/demo-gate.js).
// Proxying instead of copying keeps it identical as marketing edits the site.

const SOURCE = process.env.DEMO_LANDING_SOURCE ?? "https://www.belli.ai/"
const DEMO_LINK = /href="https:\/\/demo\.getbelli\.ai[^"]*"/g

export const revalidate = 300

export async function GET() {
  const res = await fetch(SOURCE, { headers: { "User-Agent": "belli-demo-factory" } })
  if (!res.ok) return new Response(`Landing source returned ${res.status}`, { status: 502 })
  let html = await res.text()
  html = html
    // Root-relative assets resolve against this origin and are proxied to the
    // marketing site by the fallback rewrite in next.config.mjs (no <base>,
    // which made fonts and Astro modules cross-origin and broke hydration).
    .replace(/https:\/\/www\.belli\.ai\//g, "/")
    .replace(DEMO_LINK, 'href="/#belli-demo" data-belli-demo')
    .replace(/<\/body>/i, `<script src="/demo-gate.js" defer></script></body>`)
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}

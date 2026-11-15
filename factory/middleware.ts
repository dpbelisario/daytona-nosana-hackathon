// <slug>.belli.ai → that airline's sandbox (dashboard);
// <slug>-booking.belli.ai → the same sandbox (booking portal).
// Rewrites to the sandbox's public preview URL with the two headers from
// docs/factory-contract.md. Any other host (the factory itself) passes through.
import { NextResponse, type NextRequest } from "next/server"

import { daytonaConfigured, DASHBOARD_PORT, findDemo, PORTAL_PORT, previewOrigin, wakeDemo } from "@/lib/daytona"
import { ROOT_DOMAIN } from "@/lib/domains"

export const config = { runtime: "nodejs", matcher: "/:path*" }

const FACTORY_URL = process.env.DEMO_FACTORY_URL

function slugFromHost(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase()
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null
  const label = hostname.slice(0, -(ROOT_DOMAIN.length + 1))
  if (label.includes(".") || label === "www" || label === "demo") return null
  return label.replace(/-booking$/, "")
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? ""
  const slug = slugFromHost(host)
  if (!slug || !daytonaConfigured()) return NextResponse.next()

  const sandbox = await findDemo(slug)
  const factory = FACTORY_URL ?? `https://www.${ROOT_DOMAIN}`
  if (!sandbox) return NextResponse.redirect(`${factory}/#belli-demo`)
  if (sandbox.state !== "started") {
    // Stopped after idle: wake it and show the progress page meanwhile.
    void wakeDemo(sandbox).catch((e) => console.error("wake failed", slug, e))
    return FACTORY_URL ? NextResponse.redirect(`${FACTORY_URL}/demo/${slug}`) : new NextResponse("Waking up your demo… refresh in a minute.", { status: 503 })
  }

  const port = host.split(":")[0].split(".")[0].endsWith("-booking") ? PORTAL_PORT : DASHBOARD_PORT
  const target = new URL(req.nextUrl.pathname + req.nextUrl.search, await previewOrigin(sandbox, port))
  const headers = new Headers(req.headers)
  headers.set("X-Demo-Public-Host", host)
  headers.set("X-Daytona-Skip-Preview-Warning", "true")
  return NextResponse.rewrite(target, { request: { headers } })
}

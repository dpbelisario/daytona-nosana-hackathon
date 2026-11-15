// POST {email, airline} → reuse the airline's demo sandbox, or create one
// from the snapshot. Returns at once; the browser polls /api/status/<slug>.
import { createDemo, daytonaConfigured, findDemo, wakeDemo } from "@/lib/daytona"
import { attachDemoDomains, domainsConfigured } from "@/lib/domains"
import { recordLead } from "@/lib/leads"
import { fetchLogo } from "@/lib/logo"
import { generateProfile, slugFor } from "@/lib/profile"
import { findAirline } from "@/lib/reference"

export const runtime = "nodejs"
export const maxDuration = 300

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const inFlight = new Map<string, Promise<void>>()

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; airline?: string }
  const email = body.email?.trim() ?? ""
  const query = body.airline?.trim() ?? ""
  if (!EMAIL.test(email)) return Response.json({ error: "Enter a valid work email." }, { status: 400 })
  const airline = query ? findAirline(query) : null
  if (!airline) return Response.json({ error: "Pick an airline from the list." }, { status: 400 })
  if (!daytonaConfigured()) return Response.json({ error: "Demo factory is not configured (DAYTONA_API_KEY)." }, { status: 503 })

  const slug = slugFor(airline)
  const statusUrl = `${new URL(req.url).origin}/demo/${slug}`

  const existing = await findDemo(slug)
  if (existing) {
    await wakeDemo(existing)
    await recordLead(email, airline.name, slug, statusUrl)
    return Response.json({ slug, reused: true, statusUrl })
  }

  // Two clicks for the same airline share one build.
  if (!inFlight.has(slug)) {
    const job = (async () => {
      const generated = await generateProfile(airline.iata)
      // Without custom domains, createDemo uses the sandbox's own preview hosts.
      const hosts = domainsConfigured() ? await attachDemoDomains(slug) : undefined
      await createDemo(slug, airline.iata, {
        profile: generated.profile,
        brand: {
          displayName: generated.brand.displayName,
          primaryColorHex: generated.brand.primaryColorHex,
          iata: airline.iata,
        },
        hosts: hosts ? { dashboard: hosts.dashboard, portal: hosts.portal } : undefined,
        logo: (await fetchLogo(generated.brand.logoUrls)) ?? undefined,
      })
    })().finally(() => inFlight.delete(slug))
    inFlight.set(slug, job)
  }
  try {
    // Wait until the sandbox exists so /api/status can find it; bootstrap keeps running.
    await inFlight.get(slug)
  } catch (error) {
    console.error("demo create failed", slug, error)
    return Response.json({ error: `Could not create the demo: ${(error as Error).message}` }, { status: 500 })
  }
  await recordLead(email, airline.name, slug, statusUrl)
  return Response.json({ slug, reused: false, statusUrl })
}

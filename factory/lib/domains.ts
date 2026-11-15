// Attach <slug>.belli.ai and <slug>-booking.belli.ai to the factory Vercel
// project. An explicit project domain wins over the existing *.belli.ai
// wildcard, and Vercel issues the certificate. Skipped when VERCEL_TOKEN is unset.

const API = "https://api.vercel.com"
export const ROOT_DOMAIN = process.env.DEMO_ROOT_DOMAIN ?? "belli.ai"

export function demoHosts(slug: string) {
  return { dashboard: `${slug}.${ROOT_DOMAIN}`, portal: `${slug}-booking.${ROOT_DOMAIN}` }
}

export function domainsConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID)
}

/** Returns "attached" | "taken" (409: a real tenant or another project owns it). */
async function attach(name: string): Promise<"attached" | "taken"> {
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : ""
  const res = await fetch(`${API}/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains${team}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (res.ok) return "attached"
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } }
  // Already on this project is fine.
  if (body.error?.code === "domain_already_in_use_by_project" || res.status === 409) {
    return body.error?.code === "domain_already_in_use_by_project" ? "attached" : "taken"
  }
  throw new Error(`Vercel domain attach failed for ${name}: ${res.status} ${JSON.stringify(body)}`)
}

/** Attach both hosts; on a clash retry once with a -demo suffix. Returns the hosts in use. */
export async function attachDemoDomains(slug: string): Promise<{ dashboard: string; portal: string; slug: string }> {
  for (const candidate of [slug, `${slug}-demo`]) {
    const hosts = demoHosts(candidate)
    if ((await attach(hosts.dashboard)) === "taken") continue
    if ((await attach(hosts.portal)) === "taken") continue
    return { ...hosts, slug: candidate }
  }
  throw new Error(`No free demo domain for ${slug}`)
}

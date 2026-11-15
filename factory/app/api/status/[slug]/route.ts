import { DASHBOARD_PORT, findDemo, PORTAL_PORT, previewOrigin, readStatus } from "@/lib/daytona"
import { demoHosts, domainsConfigured } from "@/lib/domains"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sandbox = await findDemo(slug)
  if (!sandbox) return Response.json({ state: "absent" })
  const status = await readStatus(sandbox)
  if (status.state !== "ready") return Response.json(status)

  const links = domainsConfigured()
    ? (() => {
        const h = demoHosts(slug)
        return { dashboard: `https://${h.dashboard}`, portal: `https://${h.portal}` }
      })()
    : {
        dashboard: await previewOrigin(sandbox, DASHBOARD_PORT),
        portal: await previewOrigin(sandbox, PORTAL_PORT),
      }
  return Response.json({ ...status, links })
}

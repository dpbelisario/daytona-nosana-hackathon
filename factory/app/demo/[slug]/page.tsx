import { StatusPoller } from "./status-poller"

export default async function DemoStatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <main style={{ maxWidth: 560, margin: "12vh auto", padding: "0 16px" }}>
      <p style={{ color: "#ff5a1f", fontWeight: 600, letterSpacing: 1, fontSize: 12 }}>BELLI DEMO</p>
      <h1 style={{ fontSize: 32, margin: "8px 0 24px" }}>Preparing your demo</h1>
      <StatusPoller slug={slug} />
    </main>
  )
}

import { StatusPoller } from "./status-poller"

export default async function DemoStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ queued?: string }>
}) {
  const { slug } = await params
  if ((await searchParams).queued) {
    return (
      <main style={{ maxWidth: 1040, margin: "6vh auto", padding: "0 16px" }}>
        <p style={{ color: "#ff5a1f", fontWeight: 600, letterSpacing: 1, fontSize: 12 }}>BELLI DEMO</p>
        <h1 style={{ fontSize: 30, margin: "8px 0 8px" }}>Your demo is queued</h1>
        <p style={{ color: "#bbb", margin: "0 0 20px" }}>
          We are preparing your airline&apos;s sandbox and will email you the link. Meanwhile, here is a recorded
          walkthrough of a generated demo (Etihad): airline dashboard and booking portal.
        </p>
        <video src="/belli-demo.mp4" controls autoPlay muted playsInline style={{ width: "100%", borderRadius: 8, border: "1px solid #333" }} />
      </main>
    )
  }
  return (
    <main style={{ maxWidth: 560, margin: "12vh auto", padding: "0 16px" }}>
      <p style={{ color: "#ff5a1f", fontWeight: 600, letterSpacing: 1, fontSize: 12 }}>BELLI DEMO</p>
      <h1 style={{ fontSize: 32, margin: "8px 0 24px" }}>Preparing your demo</h1>
      <StatusPoller slug={slug} />
    </main>
  )
}

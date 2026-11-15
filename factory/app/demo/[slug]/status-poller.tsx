"use client"

import { useEffect, useState } from "react"

type Status = {
  state: string
  step?: string
  error?: string
  links?: { dashboard: string; portal: string }
}

const STEPS: Record<string, string> = {
  absent: "Looking for your demo…",
  waking: "Waking up your demo…",
  booting: "Starting the Belli platform…",
  seeding: "Loading your airline's network, fleet and sample shipments…",
  starting: "Starting the dashboard and booking portal…",
}

export function StatusPoller({ slug }: { slug: string }) {
  const [status, setStatus] = useState<Status>({ state: "absent" })

  useEffect(() => {
    let stop = false
    async function poll() {
      while (!stop) {
        try {
          const res = await fetch(`/api/status/${slug}`, { cache: "no-store" })
          const next = (await res.json()) as Status
          setStatus(next)
          if (next.state === "ready" || next.state === "error") return
        } catch {
          // keep polling through transient errors
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
    poll()
    return () => {
      stop = true
    }
  }, [slug])

  if (status.state === "ready" && status.links) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ color: "#bbb" }}>Your demo is ready. The data is realistic but fake.</p>
        <a style={button} href={status.links.dashboard} target="_blank" rel="noreferrer">
          Open the airline dashboard →
        </a>
        <a style={{ ...button, background: "transparent", border: "1px solid #444" }} href={status.links.portal} target="_blank" rel="noreferrer">
          Open the booking portal →
        </a>
      </div>
    )
  }
  if (status.state === "error") {
    return <p style={{ color: "#ff6b6b" }}>Something went wrong: {status.error ?? status.step}. We have been notified.</p>
  }
  return (
    <div>
      <p style={{ color: "#bbb" }}>{STEPS[status.state] ?? status.step ?? "Working…"}</p>
      <p style={{ color: "#777", fontSize: 13 }}>The first visit takes about two minutes. You can keep this tab open.</p>
    </div>
  )
}

const button = {
  display: "block",
  padding: "14px 18px",
  background: "#ff5a1f",
  color: "white",
  textDecoration: "none",
  borderRadius: 6,
  fontWeight: 600,
} as const

// Record who asked for a demo and email them the link. The email is never
// stored in Daytona labels; logs keep only a hash.
import { createHash } from "node:crypto"

export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16)
}

export async function recordLead(email: string, airline: string, slug: string, link: string): Promise<void> {
  console.log(JSON.stringify({ event: "demo_requested", emailHash: emailHash(email), airline, slug }))
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const from = process.env.DEMO_EMAIL_FROM ?? "Belli <demo@belli.ai>"
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Your Belli demo for ${airline}`,
      html: `<p>Your Belli demo for <b>${escapeHtml(airline)}</b> is being prepared.</p><p><a href="${link}">Open your demo</a> (it can take a couple of minutes the first time).</p>`,
    }),
  })
  if (!res.ok) console.error("resend failed", res.status, await res.text().catch(() => ""))
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
}

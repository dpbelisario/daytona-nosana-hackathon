import type { ReactNode } from "react"

export const metadata = { title: "Belli demo", robots: { index: false } }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, sans-serif", background: "#0b0b0c", color: "#f5f5f5" }}>
        {children}
      </body>
    </html>
  )
}

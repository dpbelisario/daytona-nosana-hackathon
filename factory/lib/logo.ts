// Fetch the airline's public logo (first source that answers with an image).
// Returns null if none does; the sandbox then draws a monogram.
export async function fetchLogo(urls: string[]): Promise<Buffer | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      const type = res.headers.get("content-type") ?? ""
      if (res.ok && type.startsWith("image/")) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > 200) return buf
      }
    } catch {
      /* try the next source */
    }
  }
  return null
}

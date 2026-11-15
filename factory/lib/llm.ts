// OpenAI-compatible chat call (Nosana Ollama endpoint, or any other provider).
// Every caller treats a failure as "no answer" and falls back to known data.

export async function askJson<T>(system: string, user: string, timeoutMs = 90_000): Promise<T | null> {
  const base = process.env.LLM_BASE_URL?.replace(/\/$/, "")
  if (!base) return null
  const model = process.env.LLM_MODEL || "qwen3:8b"
  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          // qwen3: skip the long "thinking" phase; other models ignore this tag.
          { role: "user", content: `${user}\n/no_think` },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = (body.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "")
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start < 0 || end <= start) return null
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

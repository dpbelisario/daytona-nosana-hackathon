import { searchAirlines } from "@/lib/reference"

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) return Response.json([])
  return Response.json(searchAirlines(q, 8))
}

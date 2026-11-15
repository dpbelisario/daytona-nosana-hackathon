// Public reference data (IATA airline codes with AWB prefixes, airports with
// coordinates), extracted from belli-api/data. Used to ground every generated
// profile in real codes so the seeder never sees an unknown airport.
import airlinesRaw from "../data/airlines.json"
import airportsRaw from "../data/airports.json"

export type Airline = { iata: string; name: string; icao: string; awbPrefix: string }
export type Airport = { code: string; city: string; country: string; countryCode: string; lat: number; lon: number; tz: string }

// Display names where the reference file uses an abbreviation.
const NAME_FIX: Record<string, string> = {
  SIA: "Singapore Airlines",
  "THY - Turkish Airlines": "Turkish Airlines",
}
const airlines: Airline[] = (airlinesRaw as string[][])
  .map(([iata, name, icao, awbPrefix]) => ({ iata, name: NAME_FIX[name] ?? name, icao, awbPrefix }))
  // Same IATA code twice (e.g. Lufthansa and Lufthansa Cargo): passenger carrier first.
  .sort((a, b) => Number(/cargo/i.test(a.name)) - Number(/cargo/i.test(b.name)))
const airports = new Map<string, Airport>(
  (airportsRaw as [string, string, string, string, number, number, string][]).map(([code, city, country, countryCode, lat, lon, tz]) => [
    code,
    { code, city, country, countryCode, lat, lon, tz },
  ]),
)

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Resolve "EY", "ETD", "607", "Etihad" or "Etihad Airways" to an airline. */
export function findAirline(query: string): Airline | null {
  const q = query.trim()
  if (!q) return null
  const upper = q.toUpperCase()
  const exact =
    airlines.find((a) => a.iata === upper) ??
    airlines.find((a) => a.icao === upper) ??
    airlines.find((a) => a.awbPrefix === q) ??
    airlines.find((a) => norm(a.name) === norm(q))
  if (exact) return exact
  const n = norm(q)
  if (n.length < 3) return null
  // Prefer passenger/combination carriers over "X Cargo" entries on a tie.
  const matches = airlines.filter((a) => norm(a.name).includes(n))
  matches.sort((a, b) => Number(/cargo/i.test(a.name)) - Number(/cargo/i.test(b.name)) || a.name.length - b.name.length)
  return matches[0] ?? null
}

export function searchAirlines(query: string, limit = 8): Airline[] {
  const n = norm(query)
  if (!n) return []
  return airlines
    .filter((a) => norm(a.name).includes(n) || a.iata.toLowerCase() === n || a.icao.toLowerCase() === n)
    .slice(0, limit)
}

export function airport(code: string): Airport | undefined {
  return airports.get(code.trim().toUpperCase())
}

export function isAirport(code: string): boolean {
  return airports.has(code.trim().toUpperCase())
}

/** Great-circle distance in km. */
export function distanceKm(a: string, b: string): number {
  const x = airport(a)
  const y = airport(b)
  if (!x || !y) return 3000
  const r = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(y.lat - x.lat)
  const dLon = rad(y.lon - x.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(x.lat)) * Math.cos(rad(y.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

/** Block time: cruise ~830 km/h plus 35 min taxi/climb/descent, rounded to 5 min. */
export function blockMinutes(a: string, b: string): number {
  const minutes = (distanceKm(a, b) / 830) * 60 + 35
  return Math.max(45, Math.round(minutes / 5) * 5)
}

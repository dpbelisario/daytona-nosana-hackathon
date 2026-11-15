// Builds a Belli demo airline profile (the JSON that
// `belli-api seed:demo --profile-file` reads) for any airline.
//
// Real, public facts: airline name, IATA/ICAO codes, AWB prefix, hub, network,
// aircraft types, published flights (AeroAPI when a key is set). Everything
// else (agents, rates, shipments, AWB serials) is fake. Each source is
// optional: the LLM on Nosana fills gaps, and built-in fallbacks fill the rest,
// so generation never stops on missing information.

import { scheduledFlights, type ScheduledFlight } from "./aeroapi"
import { CURRENCY, HUBS, ICAO_TYPE_FAMILY, REG_PREFIX, SEEDER_FAMILIES, TOP_CARGO, USD_PER_UNIT } from "./known"
import { askJson } from "./llm"
import { airport, blockMinutes, distanceKm, findAirline, isAirport, type Airline } from "./reference"

export type Brand = { iata: string; displayName: string; primaryColorHex: string; logoUrls: string[] }
export type Generated = {
  slug: string
  airline: Airline
  brand: Brand
  profile: Record<string, unknown>
  sources: { network: "aeroapi" | "llm" | "fallback"; fleet: "aeroapi" | "llm" | "fallback"; llm: boolean }
}

type LlmFacts = {
  hub?: string
  destinations?: string[]
  fleetFamilies?: string[]
  primaryColorHex?: string
  forwarders?: { name?: string; city?: string }[]
}

const RESERVED = new Set(["www", "api", "app", "lion", "demo", "belli", "booking", "admin", "mail", "docs", "status", "dashboard", "auth"])
const GENERIC_WORDS = new Set(["air", "airlines", "airline", "airways", "aviation", "cargo", "the", "international", "lines", "group"])

/** Words that do not identify an airline on their own ("Royal Jordanian" → keep both). */
const WEAK_LEAD = new Set(["air", "royal", "china", "fly", "jet", "sky", "sun", "star", "blue", "new", "united", "global", "aero"])

/**
 * Subdomain for an airline: "Etihad Airways" → "etihad", "Air France" →
 * "airfrance", "Royal Jordanian" → "royaljordanian". The booking portal of
 * the same demo is "<slug>-booking".
 */
export function slugFor(airline: Airline): string {
  const words = airline.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
  while (words.length > 1 && GENERIC_WORDS.has(words[words.length - 1])) words.pop()
  let slug = words.join("")
  if (slug.length > 16 && words.length > 1) slug = WEAK_LEAD.has(words[0]) ? words.slice(0, 2).join("") : words[0]
  slug = slug.slice(0, 30) || airline.iata.toLowerCase()
  return RESERVED.has(slug) ? `${slug}-demo` : slug
}

/**
 * Booking-portal demo agents. The same IDs in every demo sandbox (each has its
 * own database), so the frontend snapshot can bake them in as
 * NEXT_PUBLIC_DEMO_PREPAID_AGENT_ID / NEXT_PUBLIC_DEMO_POSTPAID_AGENT_ID.
 */
export const DEMO_PREPAID_AGENT_ID = "b1f0c0a1-0000-4a00-8000-00000000d001"
export const DEMO_POSTPAID_AGENT_ID = "b1f0c0a1-0000-4a00-8000-00000000d002"

function hash(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

function localHourMinute(date: Date, tz: string | undefined): [number, number] {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz || "UTC", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date)
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
    return [h, m]
  } catch {
    return [date.getUTCHours(), date.getUTCMinutes()]
  }
}

function flightNo(iata: string, n: number): string {
  return `${iata}${String(n).padStart(4, "0")}`
}

function money(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toFixed(2)
}

const LLM_SYSTEM = `You are an air cargo network analyst. Answer with one JSON object only. Use only real, publicly known facts about the airline. If unsure about a field, omit it. Never invent airport codes.`

function llmPrompt(a: Airline): string {
  return `Airline: ${a.name} (IATA ${a.iata}, ICAO ${a.icao}).
Return JSON with:
- "hub": main hub airport, 3-letter IATA code
- "destinations": up to 24 real destinations it currently serves from the hub, 3-letter IATA codes, most cargo-relevant first
- "fleetFamilies": aircraft families it operates, chosen ONLY from ${JSON.stringify(SEEDER_FAMILIES)}
- "primaryColorHex": the airline's main brand colour as #RRGGBB
- "forwarders": 6 FICTIONAL freight forwarder company names, each with a "city" from its network (must not be real companies)`
}

export async function generateProfile(airlineQuery: string): Promise<Generated> {
  const airline = findAirline(airlineQuery)
  if (!airline) throw new Error(`Unknown airline "${airlineQuery}". Use its name, 2-letter IATA code or 3-digit AWB prefix.`)
  const iata = airline.iata

  // 1. Gather public facts in parallel; each may come back empty.
  const [real, llm] = await Promise.all([scheduledFlights(airline.icao), askJson<LlmFacts>(LLM_SYSTEM, llmPrompt(airline))])

  // 2. Network: published schedule > LLM > known hub + busiest cargo airports.
  const realFlights = real.filter((f) => isAirport(f.origin) && isAirport(f.destination) && f.flightNumber.startsWith(iata))
  const llmHub = llm?.hub?.toUpperCase()
  const hub =
    mostCommon(realFlights.map((f) => f.origin)) ??
    (llmHub && isAirport(llmHub) ? llmHub : undefined) ??
    HUBS[iata] ??
    "SIN"
  let network: Generated["sources"]["network"] = realFlights.length >= 4 ? "aeroapi" : "fallback"

  let destinations: string[]
  if (network === "aeroapi") {
    destinations = unique(realFlights.flatMap((f) => [f.origin, f.destination])).filter((c) => c !== hub)
  } else {
    const fromLlm = unique((llm?.destinations ?? []).map((c) => String(c).toUpperCase())).filter((c) => c !== hub && isAirport(c))
    if (fromLlm.length >= 4) network = "llm"
    destinations = fromLlm
  }
  for (const c of TOP_CARGO) {
    if (destinations.length >= 8) break
    if (c !== hub && !destinations.includes(c)) destinations.push(c)
  }
  destinations = destinations.slice(0, 30)
  const airports = [hub, ...destinations]

  // 3. Flights: real published flights, else a hub-and-spoke schedule.
  const routes = network === "aeroapi" ? realRoutes(realFlights, airports) : generatedRoutes(iata, hub, destinations.slice(0, 20))

  // 4. Fleet: types seen in the schedule > LLM > by network range.
  const realFamilies = unique(realFlights.map((f) => ICAO_TYPE_FAMILY[f.aircraftType]).filter(Boolean) as string[])
  const llmFamilies = unique((llm?.fleetFamilies ?? []).map(String)).filter((f) => SEEDER_FAMILIES.includes(f))
  const longHaul = destinations.some((d) => distanceKm(hub, d) > 5000)
  const families =
    realFamilies.length > 0 ? realFamilies : llmFamilies.length > 0 ? llmFamilies : longHaul ? ["787", "777", "A350", "A321"] : ["737", "A320", "A321"]
  const fleetSource: Generated["sources"]["fleet"] = realFamilies.length > 0 ? "aeroapi" : llmFamilies.length > 0 ? "llm" : "fallback"

  // 5. Money, agents, brand.
  const hubInfo = airport(hub)
  const country = hubInfo?.countryCode ?? "US"
  const currency = CURRENCY[country] ?? "USD"
  const usdPerUnit = USD_PER_UNIT[currency] ?? 1
  const local = (usd: number) => usd / usdPerUnit

  const pairs = new Map<string, { OriginCode: string; DestinationCode: string }>()
  const addPair = (o: string, d: string) => o !== d && pairs.set(`${o}-${d}`, { OriginCode: o, DestinationCode: d })
  for (const d of destinations) {
    addPair(hub, d)
    addPair(d, hub)
  }
  for (const r of routes) addPair(r.OriginCode, r.DestinationCode)

  const spokes = destinations.slice(0, 12)
  const chains: string[][] = []
  for (let i = 0; i + 1 < spokes.length && chains.length < 8; i += 2) chains.push([spokes[i], hub, spokes[i + 1]])
  const via =
    spokes.length >= 4
      ? [
          { FlightNumberSuffix: "VIA1", OriginCode: spokes[0], TransitCodes: [hub], FinalCode: spokes[1] },
          { FlightNumberSuffix: "VIA2", OriginCode: spokes[2], TransitCodes: [hub], FinalCode: spokes[3] },
        ]
      : []

  const regPrefix = REG_PREFIX[country] ?? `${iata}-`
  const tails = Array.from({ length: 20 }, (_, i) => {
    const letters = String.fromCharCode(65 + Math.floor(i / 26) + (hash(iata) % 20), 65 + (i % 26))
    return regPrefix === "N" ? `N${100 + i}${iata}` : `${regPrefix}${iata[0]}${letters}`.replace(/[^A-Z0-9-]/g, "X")
  })

  const forwarders = fakeForwarders(llm?.forwarders, airports, hub)
  const agents = forwarders.map((f, i) => ({
    ShortName: f.name.split(" ")[0].slice(0, 10).toUpperCase(),
    Name: f.name,
    CountryCode: airport(f.city)?.countryCode ?? country,
    City: airport(f.city)?.city ?? hubInfo?.city ?? "",
    Address: `${10 + i * 7} Cargo Village Road, ${airport(f.city)?.city ?? hubInfo?.city ?? ""}`,
    AccountNumber: `${iata}${String(100001 + i * 37)}`,
    Currency: currency,
    SalesOrigins: [f.city],
    AllowAllStations: i === 0,
  }))

  const ratePlan = (name: string, usdPerKg: number) => {
    const per = local(usdPerKg)
    return {
      Name: `${airline.name} ${name}`,
      MinimumPrice: money(per * 25),
      Tiers: [
        { FirstKg: "0", LastKg: "45", PricePerKg: money(per) },
        { FirstKg: "46", LastKg: "100", PricePerKg: money(per * 0.93) },
        { FirstKg: "101", LastKg: "300", PricePerKg: money(per * 0.85) },
        { FirstKg: "301", LastKg: null, PricePerKg: money(per * 0.78) },
      ],
    }
  }
  const baseUsd = longHaul ? 5.4 : 3.1

  const profile = {
    Name: `gen-${iata.toLowerCase()}`,
    OrgAirlines: [{ IATA: iata, Name: airline.name, CurrencyCode: currency }],
    DefaultAWBPrefix: airline.awbPrefix,
    AWBPrefixes: [airline.awbPrefix],
    CommodityCodeCSVPath: "data/united_commodity_codes.csv",
    DefaultCommodityCode: "GCR",
    AircraftGenerationLimit: 20,
    Airports: airports,
    ULDLocations: airports,
    DefaultFleetTypeFamilies: families,
    FleetTypeFamiliesByIATA: { [iata]: families },
    TailNumbersByIATA: { [iata]: tails },
    RouteAirportChains: chains,
    RoutePairs: [...pairs.values()],
    RatePlans: [ratePlan("General Cargo", baseUsd), ratePlan("Perishables", baseUsd * 1.35), ratePlan("Express", baseUsd * 1.55)],
    ULDTypes: [
      { Name: "AKE", TareWeightKg: 70, MaxWeightKg: 1588, MaxVolumeM3: 4.3 },
      { Name: "PMC", TareWeightKg: 120, MaxWeightKg: 6804, MaxVolumeM3: 11.5 },
      { Name: "PAG", TareWeightKg: 105, MaxWeightKg: 6804, MaxVolumeM3: 10.8 },
      { Name: "PLA", TareWeightKg: 130, MaxWeightKg: 6804, MaxVolumeM3: 14.0 },
      { Name: "RKN", TareWeightKg: 210, MaxWeightKg: 1588, MaxVolumeM3: 3.9 },
    ],
    ULDGenerationLimit: 24,
    RecurringFlightRoutes: routes,
    ViaFlightRoutes: via,
    Agents: agents,
    // Allotment agents double as the booking-portal demo agents (ids fixed above).
    AllotmentAgents: forwarders.map((f, i) => ({
      ID: i === 0 ? DEMO_PREPAID_AGENT_ID : i === 1 ? DEMO_POSTPAID_AGENT_ID : `b1f0c0a1-0000-4a00-8000-00000000d00${i + 1}`,
      Name: f.name,
      AccountID: `${iata}ALT-A0${i + 1}`,
      IataNumber: String(3412001 + i),
      CassNumber: i % 2 === 0 ? `${3412001 + i}000${i + 1}` : "",
      Prepaid: i === 0 || i % 2 === 0,
    })),
    PrepaidWalletMinimum: Math.round(local(15_000)),
    PrepaidAllotmentRules: routes
      .filter((r) => r.OriginCode === hub)
      .slice(0, 3)
      .map((r, i) => ({ FlightNumber: r.FlightNumber, OriginIATA: r.OriginCode, DestIATA: r.DestinationCode, WeightLimitKg: [5000, 8000, 4000][i], VolumeLimitCbm: [35, 50, 28][i], Type: "FIXED", Mandatory: true, ValidityEndMonthsFromNow: i + 1 })),
    RandomAllotmentRules: routes
      .filter((r) => r.DestinationCode === hub)
      .slice(0, 3)
      .map((r, i) => ({ FlightNumber: r.FlightNumber, OriginIATA: r.OriginCode, DestIATA: r.DestinationCode, WeightLimitKg: [3000, 4500, 5500][i], VolumeLimitCbm: [20, 30, 38][i], Type: i % 2 ? "FIXED" : "SOFTBLOCK", Mandatory: false, ValidityEndMonthsFromNow: i + 1 })),
    DefaultAgent: {
      Name: forwarders[0].name,
      Email: `bookings@${forwarders[0].name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 20)}.example`,
      Phone: "+1 555 0100",
      CurrencyCode: currency,
      Country: hubInfo?.country ?? "",
      Region: hubInfo?.city ?? "",
      City: hubInfo?.city ?? "",
      District: "Cargo Village",
      PostalCode: "00000",
      Address: `1 Cargo Village Road, ${hubInfo?.city ?? ""}`,
    },
  }

  const color = /^#[0-9a-fA-F]{6}$/.test(llm?.primaryColorHex ?? "") ? llm!.primaryColorHex! : colorFromHash(iata)
  return {
    slug: slugFor(airline),
    airline,
    brand: {
      iata,
      displayName: airline.name,
      primaryColorHex: color,
      logoUrls: [`https://images.kiwi.com/airlines/128/${iata}.png`, `https://pics.avs.io/200/200/${iata}.png`],
    },
    profile,
    sources: { network, fleet: fleetSource, llm: llm !== null },
  }
}

type Route = {
  FlightNumber: string
  OriginCode: string
  DestinationCode: string
  DepartureHour: number
  DepartureMinute: number
  DurationHour: number
  DurationMinute: number
}

function realRoutes(flights: ScheduledFlight[], airports: string[]): Route[] {
  const seen = new Set<string>()
  const routes: Route[] = []
  for (const f of flights) {
    const number = f.flightNumber.replace(/^([A-Z0-9]{2})(\d+)/, (_, c, n) => flightNo(c, Number(n)))
    if (seen.has(number) || !airports.includes(f.origin) || !airports.includes(f.destination)) continue
    if (f.blockMinutes <= 0 || f.blockMinutes > 20 * 60) continue
    seen.add(number)
    const [h, m] = localHourMinute(f.departureUtc, airport(f.origin)?.tz)
    routes.push({
      FlightNumber: number,
      OriginCode: f.origin,
      DestinationCode: f.destination,
      DepartureHour: h,
      DepartureMinute: m,
      DurationHour: Math.floor(f.blockMinutes / 60),
      DurationMinute: f.blockMinutes % 60,
    })
    if (routes.length >= 40) break
  }
  return routes
}

function generatedRoutes(iata: string, hub: string, spokes: string[]): Route[] {
  const routes: Route[] = []
  spokes.forEach((spoke, i) => {
    const minutes = blockMinutes(hub, spoke)
    const h = hash(iata + spoke)
    const outHour = [1, 2, 8, 9, 10, 14, 15, 20, 21, 22][h % 10]
    const outMinute = [0, 5, 15, 25, 30, 40, 45, 55][(h >> 4) % 8]
    // Return leaves about 2.5 h after arrival, in the spoke's local time (approximate).
    const backTotal = outHour * 60 + outMinute + minutes + 150
    routes.push(
      {
        FlightNumber: flightNo(iata, 1 + i * 2),
        OriginCode: hub,
        DestinationCode: spoke,
        DepartureHour: outHour,
        DepartureMinute: outMinute,
        DurationHour: Math.floor(minutes / 60),
        DurationMinute: minutes % 60,
      },
      {
        FlightNumber: flightNo(iata, 2 + i * 2),
        OriginCode: spoke,
        DestinationCode: hub,
        DepartureHour: Math.floor(backTotal / 60) % 24,
        DepartureMinute: (Math.round((backTotal % 60) / 5) * 5) % 60,
        DurationHour: Math.floor(minutes / 60),
        DurationMinute: minutes % 60,
      },
    )
  })
  return routes
}

const FORWARDER_PATTERNS = [
  (c: string) => `${c} Air Freight Services`,
  (c: string) => `Skyline Cargo ${c}`,
  (c: string) => `Meridian Logistics ${c}`,
  (c: string) => `${c} Express Forwarding`,
  (c: string) => `Northstar Freight ${c}`,
  (c: string) => `Bluewave Cargo ${c}`,
]

function fakeForwarders(fromLlm: LlmFacts["forwarders"], airports: string[], hub: string): { name: string; city: string }[] {
  const out: { name: string; city: string }[] = []
  for (const f of fromLlm ?? []) {
    const name = String(f?.name ?? "").replace(/[^\p{L}\p{N} &.-]/gu, "").trim()
    const city = airports.find((a) => airport(a)?.city?.toLowerCase() === String(f?.city ?? "").toLowerCase()) ?? hub
    if (name.length >= 4 && name.length <= 60) out.push({ name, city })
    if (out.length >= 6) break
  }
  for (let i = 0; out.length < 6; i++) {
    const city = airports[i % airports.length]
    out.push({ name: FORWARDER_PATTERNS[i % FORWARDER_PATTERNS.length](airport(city)?.city ?? city), city })
  }
  return out
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

function mostCommon(xs: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function colorFromHash(s: string): string {
  const palette = ["#0B3D91", "#7A1F3D", "#00594F", "#8C1D18", "#1F4E79", "#5B2C83", "#0E6E6E", "#9C5B00"]
  return palette[hash(s) % palette.length]
}

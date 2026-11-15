// Usage: npm run profile -- "Etihad"   (prints the generated profile summary
// and writes out/<slug>.profile.json). Set LLM_BASE_URL to use Nosana,
// AEROAPI_KEY for real schedules; without them the fallbacks are used.
import { mkdirSync, writeFileSync } from "node:fs"
import { generateProfile } from "../lib/profile"

const query = process.argv.slice(2).join(" ") || "Etihad"
const g = await generateProfile(query)
mkdirSync("out", { recursive: true })
writeFileSync(`out/${g.slug}.profile.json`, JSON.stringify(g.profile, null, 2))
writeFileSync(`out/${g.slug}.brand.json`, JSON.stringify(g.brand, null, 2))
const p = g.profile as { Airports: string[]; RecurringFlightRoutes: { FlightNumber: string; OriginCode: string; DestinationCode: string }[]; DefaultFleetTypeFamilies: string[]; OrgAirlines: { CurrencyCode: string }[] }
console.log(JSON.stringify({ slug: g.slug, airline: g.airline, sources: g.sources, airports: p.Airports, fleet: p.DefaultFleetTypeFamilies, currency: p.OrgAirlines[0].CurrencyCode, flights: p.RecurringFlightRoutes.slice(0, 4) }, null, 2))

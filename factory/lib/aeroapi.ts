// Optional: real published schedules from FlightAware AeroAPI (Belli already
// has a key for flight status). Without AEROAPI_KEY this returns [].

export type ScheduledFlight = {
  flightNumber: string // IATA, e.g. EY11
  origin: string
  destination: string
  departureUtc: Date
  blockMinutes: number
  aircraftType: string // ICAO designator, e.g. B789
}

export async function scheduledFlights(airlineIcao: string): Promise<ScheduledFlight[]> {
  const key = process.env.AEROAPI_KEY
  if (!key || !airlineIcao) return []
  const start = new Date(Date.now() + 24 * 3600_000)
  const end = new Date(start.getTime() + 24 * 3600_000)
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const url = `https://aeroapi.flightaware.com/aeroapi/schedules/${day(start)}/${day(end)}?airline=${encodeURIComponent(airlineIcao)}&max_pages=3`
  try {
    const res = await fetch(url, { headers: { "x-apikey": key }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return []
    const body = (await res.json()) as { scheduled?: Record<string, string | null>[] }
    const flights: ScheduledFlight[] = []
    for (const f of body.scheduled ?? []) {
      const ident = f.ident_iata || ""
      const origin = f.origin_iata || ""
      const destination = f.destination_iata || ""
      const out = f.scheduled_out ? new Date(f.scheduled_out) : null
      const inn = f.scheduled_in ? new Date(f.scheduled_in) : null
      if (!ident || !origin || !destination || !out || !inn) continue
      if (f.actual_ident && f.actual_ident !== f.ident) continue // skip codeshares
      flights.push({
        flightNumber: ident,
        origin,
        destination,
        departureUtc: out,
        blockMinutes: Math.round((inn.getTime() - out.getTime()) / 60_000),
        aircraftType: f.aircraft_type || "",
      })
    }
    return flights
  } catch {
    return []
  }
}

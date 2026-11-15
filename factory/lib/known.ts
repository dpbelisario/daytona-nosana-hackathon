// Small, well-known public facts used when the LLM is unavailable, so a demo
// never blocks on missing information. Everything here is public.

/** Main hub per IATA airline code. */
export const HUBS: Record<string, string> = {
  EY: "AUH", EK: "DXB", QR: "DOH", SQ: "SIN", CX: "HKG", LH: "FRA", AF: "CDG", KL: "AMS", BA: "LHR",
  TK: "IST", UA: "ORD", AA: "DFW", DL: "ATL", GA: "CGK", JT: "CGK", ID: "CGK", IW: "CGK", MH: "KUL",
  OD: "KUL", TG: "BKK", PR: "MNL", "5J": "MNL", SV: "JED", GF: "BAH", WY: "MCT", RJ: "AMM", MS: "CAI",
  ET: "ADD", KQ: "NBO", SA: "JNB", AI: "DEL", "6E": "DEL", NH: "NRT", JL: "HND", KE: "ICN", OZ: "ICN",
  CI: "TPE", BR: "TPE", CA: "PEK", MU: "PVG", CZ: "CAN", QF: "SYD", NZ: "AKL", LA: "SCL", AV: "BOG",
  CM: "PTY", AC: "YYZ", IB: "MAD", AZ: "FCO", LX: "ZRH", OS: "VIE", SK: "CPH", AY: "HEL", LO: "WAW",
  BT: "RIX", FX: "MEM", "5X": "SDF", CV: "LUX", KZ: "NRT", QY: "LEJ", B6: "JFK", AS: "SEA", WN: "DAL",
  VN: "SGN", VJ: "SGN", PG: "BKK", UL: "CMB", PK: "KHI", BG: "DAC", KU: "KWI", "3K": "SIN", TR: "SIN",
  AK: "KUL", FZ: "DXB", G9: "SHJ", XY: "RUH", J9: "KWI", AT: "CMN", AH: "ALG", TU: "TUN", WB: "KGL",
  RW: "KGL", TC: "DAR", KP: "LFW", HY: "TAS", KC: "ALA", J2: "GYD", A3: "ATH", TP: "LIS", EI: "DUB",
  B2: "MSQ", PS: "KBP", OK: "PRG", RO: "OTP", JU: "BEG", FB: "SOF", LG: "LUX", SN: "BRU", "4Y": "FRA",
  CO: "IAH", HA: "HNL", AM: "MEX", "3S": "MIA", M3: "GRU", G3: "GRU", AD: "VCP", AR: "EZE", H2: "SCL",
  "8V": "MNL", BX: "PUS", "7C": "CJU", "9W": "BOM", SG: "DEL", UK: "DEL", IX: "DEL", NK: "FLL",
  S7: "OVB", SU: "SVO", HU: "HAK", ZH: "SZX", "3U": "CTU", MF: "XMN", FM: "SHA", HX: "HKG", NX: "MFM",
  BI: "BWN", B3: "PBH", KB: "PBH", PX: "POM", FJ: "NAN", VA: "BNE", JQ: "MEL", TN: "PPT", SB: "NOU", MK: "MRU", HM: "SEZ",
}

/** Busiest cargo airports: used to fill a network when nothing else is known. */
export const TOP_CARGO = [
  "HKG", "PVG", "ICN", "DXB", "TPE", "NRT", "SIN", "DOH", "FRA", "CDG",
  "LHR", "AMS", "ORD", "LAX", "MIA", "JFK", "CAN", "BKK", "IST", "DEL",
]

/** Currency per country code (fallback USD). */
export const CURRENCY: Record<string, string> = {
  AE: "AED", QA: "QAR", SA: "SAR", BH: "BHD", OM: "OMR", KW: "KWD", JO: "JOD", EG: "EGP", MA: "MAD",
  ID: "IDR", MY: "MYR", SG: "SGD", TH: "THB", PH: "PHP", VN: "VND", IN: "INR", PK: "PKR", BD: "BDT",
  LK: "LKR", JP: "JPY", KR: "KRW", CN: "CNY", HK: "HKD", TW: "TWD", AU: "AUD", NZ: "NZD", GB: "GBP",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", TR: "TRY", ZA: "ZAR", KE: "KES",
  ET: "ETB", NG: "NGN", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  US: "USD", DE: "EUR", FR: "EUR", NL: "EUR", IT: "EUR", ES: "EUR", PT: "EUR", IE: "EUR", AT: "EUR",
  BE: "EUR", FI: "EUR", GR: "EUR", LU: "EUR", LV: "EUR", LT: "EUR", EE: "EUR", BT: "BTN", MV: "MVR",
}

/** Rough USD value of one unit, to scale demo rate cards into local currency. */
export const USD_PER_UNIT: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, AED: 0.272, QAR: 0.275, SAR: 0.267, BHD: 2.65, OMR: 2.6, KWD: 3.25,
  JOD: 1.41, SGD: 0.74, MYR: 0.21, THB: 0.028, IDR: 0.000063, PHP: 0.018, INR: 0.012, JPY: 0.0067,
  KRW: 0.00073, CNY: 0.14, HKD: 0.128, TWD: 0.031, AUD: 0.66, NZD: 0.6, CHF: 1.12, CAD: 0.73, ZAR: 0.054,
  TRY: 0.03, EGP: 0.02, MAD: 0.1, KES: 0.0077, BRL: 0.18, MXN: 0.055, BTN: 0.012, VND: 0.00004,
}

/** Aircraft type families the Belli seeder knows (data/aircraft_types.csv). */
export const SEEDER_FAMILIES = [
  "A220", "A300", "A318", "A319", "A320", "A321", "A330", "A340", "A350", "A380",
  "737", "747", "757", "767", "777", "777X", "787", "E1", "E2", "ATR 72",
]

/** ICAO aircraft type designator → seeder family (for AeroAPI schedules). */
export const ICAO_TYPE_FAMILY: Record<string, string> = {
  B77W: "777", B77L: "777", B772: "777", B773: "777", B778: "777X", B779: "777X",
  B788: "787", B789: "787", B78X: "787", A359: "A350", A35K: "A350", A388: "A380",
  A320: "A320", A20N: "A320", A321: "A321", A21N: "A321", A319: "A319", A19N: "A319",
  A332: "A330", A333: "A330", A339: "A330", A338: "A330", A343: "A340", A346: "A340",
  B737: "737", B738: "737", B739: "737", B38M: "737", B39M: "737", B744: "747", B748: "747",
  B752: "757", B753: "757", B763: "767", B764: "767", BCS1: "A220", BCS3: "A220", A306: "A300",
  E190: "E1", E195: "E1", E290: "E2", E295: "E2", AT72: "ATR 72", AT76: "ATR 72",
}

/** Aircraft registration prefix per country code. */
export const REG_PREFIX: Record<string, string> = {
  AE: "A6-", QA: "A7-", SA: "HZ-", BH: "A9C-", OM: "A4O-", KW: "9K-", JO: "JY-", EG: "SU-", ID: "PK-",
  MY: "9M-", SG: "9V-", TH: "HS-", PH: "RP-C", VN: "VN-", IN: "VT-", PK: "AP-", BD: "S2-", LK: "4R-",
  JP: "JA", KR: "HL", CN: "B-", HK: "B-H", TW: "B-", AU: "VH-", NZ: "ZK-", GB: "G-", DE: "D-", FR: "F-",
  NL: "PH-", CH: "HB-", TR: "TC-", US: "N", CA: "C-", MX: "XA-", BR: "PR-", ZA: "ZS-", KE: "5Y-",
  ET: "ET-", IE: "EI-", ES: "EC-", IT: "I-", PT: "CS-", LU: "LX-", BT: "A5-", MV: "8Q-",
}

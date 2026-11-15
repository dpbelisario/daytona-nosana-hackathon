# Demo factory: contract between the parts

One code version for every airline. An airline is data. Each airline gets **one Daytona
sandbox** that runs the full Belli demo stack (`belli-api` + Postgres + Redis + the `belli` FE in
no-login demo mode) and serves **both** the internal dashboard and the booking portal.

## Hosts

| Host | App context | Who uses it |
|---|---|---|
| `<slug>.belli.ai` | `dashboard` (internal airline staff) | the airline's ops/sales people |
| `<slug>-booking.belli.ai` | `booking-portal` (agents / forwarders) | the airline's customers |

`slug` comes from `slugFor()` in `factory/lib/profile.ts` (`etihad`, `airfrance`,
`royaljordanian`; reserved names get `-demo`). Both hosts are single-label under `belli.ai`, so
the existing wildcard certificate and DNS (Vercel DNS) cover them.

## Request path

```
browser ─▶ Vercel "factory" (middleware: host → slug → sandbox) ─rewrite─▶ https://3000-<sandboxId>.<daytona-proxy>/...
             headers added: X-Demo-Public-Host: <host the browser used>
                            X-Daytona-Skip-Preview-Warning: true
sandbox :3000  edge.mjs
   ├─ /belli-api/*  → 127.0.0.1:1323/api/*     (backend; CORS for both public hosts)
   └─ everything else → 127.0.0.1:3001 (next start), Host set to
        dashboard.belli-demo.internal       when X-Demo-Public-Host = <slug>.belli.ai
        portal.belli-demo.internal          when X-Demo-Public-Host = <slug>-booking.belli.ai
      Location headers are mapped back to the public host.
```

The FE is built once (snapshot) with constant values, so nothing per-airline is compiled in:

| FE build env | Value (constant in the snapshot) |
|---|---|
| `NEXT_PUBLIC_APP_ENV` | `demo` |
| `NEXT_PUBLIC_DEMO_NO_AUTH` | `true` (Clerk replaced by stand-ins; no login) |
| `STRICT_ORG_ID` | `org_belli_demo_factory` (= seed org = API `BYPASS_ORG_ID`) |
| `NEXT_PUBLIC_BYPASS_TOKEN` | random per snapshot build, = API `BYPASS_TOKEN` |
| `NEXT_PUBLIC_ALLOWED_HOSTS` | `{"dashboard":["dashboard.belli-demo.internal"],"booking-portal":["portal.belli-demo.internal"]}` |
| `NEXT_PUBLIC_DEMO_PREPAID_AGENT_ID` / `_POSTPAID_` | `b1f0c0a1-0000-4a00-8000-00000000d001` / `…d002` (seeded by every generated profile) |
| `NEXT_PUBLIC_API_URL` | placeholder `https://belli-demo-api.invalid/api`, replaced at boot by `https://<slug>.belli.ai/belli-api` |
| `NEXT_PUBLIC_TENANT_BRAND` | placeholder brand; `displayName` and `primaryColorHex` replaced at boot; `logo` = `/belli-demo-logo.png`, a file overwritten at boot |

## Files in the sandbox (`/home/daytona/demo/`)

The orchestrator uploads these, then runs `bash /home/daytona/demo/bootstrap.sh` in a background
session (`runAsync: true`):

| File | Written by | Content |
|---|---|---|
| `profile.json` | orchestrator | `generateProfile(...).profile` |
| `brand.json` | orchestrator | `{ "displayName", "primaryColorHex", "iata" }` |
| `hosts.json` | orchestrator | `{ "dashboard": "<slug>.belli.ai", "portal": "<slug>-booking.belli.ai" }` |
| `logo.png` | orchestrator (optional) | logo bytes; bootstrap makes an SVG monogram if absent |
| `status.json` | bootstrap | `{ "state": "booting"\|"seeding"\|"starting"\|"ready"\|"error", "step", "error"?, "updatedAt" }` |

`bootstrap.sh` is idempotent: first run = DB init + migrate + `seed:default` + `seed:demo
--profile-file profile.json` + brand injection + start; later runs (after the sandbox was
stopped/started) only start the services. Run it again after every `sandbox.start()`.

## Sandbox labels

`{ "kind": "belli-demo", "slug": "<slug>", "airline": "<IATA>", "snapshot": "<snapshot name>" }`.
Lookup = `daytona.list({ labels: { kind: "belli-demo", slug } })`. Never store the prospect's
email in labels; store a hash if needed.

## Snapshot

`factory/scripts/build-snapshot.ts` (needs `DAYTONA_API_KEY`, `GITHUB_TOKEN` with read access to
belli-ai/belli-api + belli-ai/belli). Name `belli-demo-stack-v<N>`. Built from belli-api
`claude/demo-profile-json` (until merged to `release/demo`) and belli `release/demo`.

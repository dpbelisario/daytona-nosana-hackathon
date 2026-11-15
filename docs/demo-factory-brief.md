# Brief for the coding agent: per-airline demo factory

**Goal.** An airline visits belli.ai and clicks **Demo**. It enters a work email and an airline. In
under about 2 minutes it gets its own demo: the airline's name, codes, hub, stations and fleet types, with
fake but realistic cargo data. The link goes by email. Today each demo means a new deploy, domain
and seed. This removes that work.

Sources: Belli's wiki `belli-ai/cargo-knowledge` (each claim below names the page `id`;
`gh repo clone belli-ai/cargo-knowledge`), plus the Daytona and Nosana SDK types in this repo's
`node_modules`.

---

## 1. Recommended hackathon architecture (build this)

```
belli.ai "Demo" button
  → POST /api/demo {email, airline}          (Next route in the demo app, or a tiny always-on service)
     1. resolve airline profile   — public facts: IATA/ICAO, AWB prefix, hub, stations, fleet types
     2. generate dataset          — Nosana LLM (OpenAI-compatible) → zod validate → fallback generator
     3. create Daytona sandbox    — FROM A PREBUILT SNAPSHOT (seconds, no npm install per demo)
     4. upload dataset JSON, start server (0.0.0.0:3000, background session)
     5. signed preview URL (≤ 24 h) or public sandbox
     6. email the link (Resend) + show a status page that polls job state
  → stretch: {airline}.demo.belli.ai → wildcard DNS → proxy → that sandbox
```

Rules:

- **Use `belli-ai/air-cargo-breakdown` as the demo app.** It already reads fictional data from
  `lib/flight-data.ts`. Change it to read the same shape from a JSON file at startup, so a sandbox
  only needs a new data file. Do not try to make the real `belli` and `belli-api` multi-tenant per
  prospect in this hackathon (see §3 for why).
- **Do not block on Nosana.** Put the LLM behind an OpenAI-compatible `LLM_BASE_URL` and
  `LLM_MODEL`. If the call fails or the output fails validation, use a deterministic generator
  seeded by the airline code. The demo must work while the GPU is down.
- **Real airline facts must be public facts only:** name, IATA/ICAO codes, 3-digit AWB prefix, hub,
  destinations and fleet types. **Everything else is fake:** agents/forwarders, shippers, AWB
  serials, weights and ULD contents. Never use a real forwarder or customer name.
- **AWB numbers must be valid:** 3-digit airline prefix + 8 digits, where digit 8 = (first 7
  digits of the serial) mod 7. For example, Etihad's prefix is `607`. Airline staff spot an invalid check digit at once.
- Ground the LLM with reference data, not memory: give it the airline's hub and destination list
  (OpenFlights `airlines.dat`/`routes.dat` is public) and ask only for plausible cargo content.
  Validate every IATA airport code against the list.

### Daytona specifics (from the SDK types, `@daytona/sdk` 0.231)

- **Build once, snapshot, then clone.** Create one sandbox, clone the app, run `bun install` and
  `bun run build`, then `sandbox.createSnapshot('belli-demo-v1')`. Create each prospect demo with
  `daytona.create({ snapshot: 'belli-demo-v1', public: true, labels: {...}, autoStopInterval: 60 })`.
  Installing per demo is the slow part, and it is the most likely cause of the failed `daytona:up`.
- **Default sandbox resources are 1 vCPU / 1 GB RAM / 3 GiB disk.** A Next build can run out of
  memory or disk with them. Give the *build* sandbox more `resources` (cpu / memory / disk; this
  needs an `image`, not the default snapshot), for example `image: 'node:22'`.
- Start the server with `sandbox.process.createSession()` + `executeSessionCommand({ command:
  'next start -H 0.0.0.0 -p 3000', runAsync: true })`. Bind to 0.0.0.0.
- For links, use `sandbox.getSignedPreviewUrl(3000, 86400)` (max 24 h, no headers needed) or
  `public: true`. Never share the standard preview token: it opens every port, including the
  terminal (22222) and the toolbox API (2280).
- Use `sandbox.git.clone(url, path, branch, commit, username, token)` for the private repo. Use a
  short-lived token. **Never upload `.env` files with real secrets into a prospect's sandbox.**
- Lifecycle: `autoStopInterval` defaults to 15 min idle. Use 60 for demos.
  `autoArchiveInterval` defaults to 7 days. Add a cleanup job that deletes demos older than N days
  by label.
- Labels: `{ kind: 'prospect-demo', airline: 'EY', created: '<iso>' }`. Store a **hash** of the
  email, not the email itself.

### Nosana specifics

- An API key is **not** needed. The user created the deployment in the dashboard. Only the
  endpoint URL is needed (`https://<id>.node.k8s.prd.nos.ci`); it is OpenAI-compatible
  (`/v1/models`, `/v1/chat/completions`).
- **Current fault:** the Ollama quickstart deployment tries to write model metadata into a
  read-only cache folder, so it stays at `x-frp-service-state: loading` for ever. Fix: stop it and
  create a new deployment from the job definition in `scripts/nosana.ts` (`ollama/ollama`, no
  cached `resources`, a writable default model dir, `expose: 11434`, `OLLAMA_ORIGINS=*`) with
  `qwen3:8b`. Or keep the template and set `OLLAMA_MODELS` to a writable path such as
  `/tmp/ollama`.
- A 12 GB card (RTX 3060) fits `qwen3:8b`, but not the 125B "flash-next" model. Credits are about
  $9. Use `strategy: SIMPLE` with a short timeout while testing.
- Call Nosana **server-side** from the demo app, as Codex already does. That removes CORS problems.

---

## 2. Belli facts that matter (from the wiki)

| Fact | Where |
|---|---|
| An official generic demo already exists: branches `release/demo` (api + fe) → Hetzner app `demo` at **demo.getbelli.ai**. `release/demo-etihad` is the most invested RFP demo (real allotment code, plus Etihad seed). | `product.architecture.branch-environments` |
| `task deploy app=demo` = pull → **reset DB** → migrate → seed (`seed-demo`) → restart. Slack `/hetzner reset demo` (hookbridge) dispatches launchpad's `reset-demo.yml`. | `product.architecture.launchpad`, `product.architecture.hookbridge` |
| Demo seeders live in belli-api `pkg/demo/` (for example `org_airline.go`, `rate_plan.go`). Demo entitlements: `pkg/tenantconfig/tenants/demo.yaml` (has `ai_assistant` and `partners.account_managers` on). | `product.architecture.org-airlines`, `product.architecture.tenant-entitlements` |
| **Demo-mode FE skips Clerk:** `NEXT_PUBLIC_APP_ENV=demo` + `NEXT_PUBLIC_BYPASS_TOKEN` replaces the Clerk bearer. The BE accepts header `X-Test-Bypass: $BYPASS_TOKEN`, and the `X-Org-ID` / `X-User-ID` / `X-Test-Roles` headers let the caller act as **any org**. | `product.architecture.auth-rbac` |
| Account provisioning without Clerk exists: `POST /api/v1/e2e/fixtures/provision` (+ purge). It works only with `E2E_FIXTURES_ENABLED=true` + the bypass token. Accounts use `@test.belli.com`. | `product.architecture.auth-rbac` |
| Data isolation = an `org_id` column (the Clerk org id) on almost every table. Hookbridge `/restore` rewrites `org_id` on every table that has the column (found via `information_schema`), one worker because of FK deadlocks. | `product.architecture.multi-tenancy`, `product.architecture.hookbridge` |
| **Airline scope is deny-by-default:** a user with no `user_org_airlines` rows and `is_allowed_all_airlines=false` sees empty screens. The org's airlines are in `org_airlines`. | `product.architecture.org-airlines` |
| Core data entities: Order (AWB), Flight, RecurringFlight, FlightSegment, Location, RatePlan, EmbargoRule, ULD, FlightBuildUp (manifest), AWBStock, User/Partner(agent). | `product.data-model` index |
| Launchpad can create Cloudflare DNS + Caddy routes per app (`bootstrap-test-app` → `api-<app>.bellie.ai`). This can be reused for per-airline hosts on Hetzner. | `product.architecture.launchpad` |
| Belli already sends email with **Resend** (booking portal, `RESEND_API_KEY`). | `product.architecture.frontend-env-contract` |

## 3. Why not per-prospect tenants on the real Belli stack (yet)

- The real FE locks one deployment to one Clerk org: `STRICT_ORG_ID` is required, and the app will not boot
  without it. Host routing (`NEXT_PUBLIC_ALLOWED_HOSTS`) is an **exact match with no wildcards**.
  `{airline}.belli.ai` on the real FE therefore needs FE code changes, not configuration.
- Clerk dev keys shared across subdomains freeze the JWT `azp` to the first subdomain, which gives
  401s on the next one (`product.architecture.frontend-app-contexts`).
- The **"v2" path after the hackathon:** one shared demo backend (`release/demo`) + one fake org per
  prospect. Create the org (new `org_id`), seed `pkg/demo/*` into it with the airline's profile, and
  add `org_airlines` + a user with `is_allowed_all_airlines`. Serve it with the demo FE using bypass headers.
  **Security:** the bypass token is in the browser bundle, so anyone with the demo URL can read
  every org on that backend. That is acceptable only on a backend that holds fake data and nothing
  else, and never on a backend shared with a real tenant.

## 4. Done when

1. Enter `ops@etihad.example` + `EY` → status page → working demo link in < 2 min.
2. The demo shows Etihad name/codes, AUH hub, real destinations, Etihad fleet types,
   AWBs `607-xxxxxxxx` with valid check digits, fake agents.
3. With the Nosana endpoint switched off, the same flow still works (fallback generator).
4. A second airline (for example `RJ`, `PR`, `GF`) gives a different, consistent dataset.
5. Sandboxes carry labels; a cleanup command deletes old demos; no secrets are inside prospect
   sandboxes.

---

## 5. Domains: `{airline}.belli.ai` (checked live 2026-11-15)

- **belli.ai DNS is on Vercel** (`ns1/ns2.vercel-dns.com`). Cloudflare and GoDaddy are not needed.
  Do not change the nameservers.
- `*.belli.ai` is **already a wildcard to an existing Vercel project** (any unknown subdomain →
  308 to `/dashboards/air-waybills`). Do not remove it. Explicit names already in use: `www`
  (runploy), `api` (AWS), `app`, `lion`, `demo` (→ demo.getbelli.ai).
- **Router:** a new Vercel project `demo-router` (Next.js). Its middleware reads the subdomain,
  finds the sandbox (Daytona label `subdomain=<name>`, or Upstash/Edge Config), and
  `NextResponse.rewrite()`s to `https://3000-<sandboxId>.<daytona-proxy>` with request header
  `X-Daytona-Skip-Preview-Warning: true`. Sandboxes are `public: true`.
- **Per-demo domain (exact `{airline}.belli.ai`):** when a demo is created, add the name to the
  router project. An explicit project domain wins over the wildcard. Vercel issues the cert itself:
  `POST https://api.vercel.com/v10/projects/{project}/domains?teamId={team}` body `{"name":"etihad.belli.ai"}`.
  When a demo is deleted: `DELETE https://api.vercel.com/v9/projects/{project}/domains/{domain}?teamId={team}`.
  A 409 means the name is taken (for example a real tenant), so retry with `<name>-demo`.
  Env: `VERCEL_TOKEN` (team-scoped), `VERCEL_TEAM_ID`, `VERCEL_ROUTER_PROJECT_ID`.
- **Alternative with no per-demo API calls:** add `*.demo.belli.ai` once to the router project.
  Demos are then `etihad.demo.belli.ai`.

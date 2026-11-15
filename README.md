# Link here: https://belli-demo-factory.vercel.app/

# Daytona × Nosana Hackathon Starter

Bare-minimum setup to prove both credits work, end to end:

- **Daytona** — cloud sandboxes for running code (CPU). We use it to host a webpage and get a public URL.
- **Nosana** — decentralized **GPU** compute. We use it to run an LLM (Ollama, OpenAI-compatible API) and get a public endpoint.

```
browser ──▶ Daytona sandbox (web/index.html on :3000, public preview URL)
                 │
                 └──fetch──▶ Nosana GPU deployment (Ollama on :11434, public endpoint)
```

## 0. One-time UI setup (5 min)

### Daytona — https://app.daytona.io
1. Sign up / log in and **redeem your hackathon credits** (Billing / Wallet page, or the code from the organisers).
2. **API Keys** (left sidebar) → **Create Key** → copy it into `.env` as `DAYTONA_API_KEY`.
3. That's it. You do **not** need to create a volume, snapshot or project to start —
   the script creates a sandbox for you. (Optional: **Sandboxes → Create Sandbox** to click around a web terminal.)

### Nosana — https://deploy.nosana.com
1. Sign up / log in and **check your credit balance** (redeem the hackathon code if you got one).
2. **Account → API Keys → Create Key** → name it, set an expiry, keep the default permissions →
   copy it (starts with `nos_`) into `.env` as `NOSANA_API_KEY`. You only see it once.
3. Optional sanity check without code: **Deploy** (sidebar) → pick a template → pick a GPU →
   **Create Deployment** → click the endpoint link when it's running → stop it afterwards.

## 1. Run it

```bash
cp .env.example .env   # paste both keys
npm install
```

```bash
npm run daytona:web      # → prints https://3000-<sandbox>.<proxy> serving web/index.html
```

```bash
npm run nosana:deploy    # → creates + starts a GPU deployment, waits, prints the endpoint URL
```

Paste the Nosana endpoint into the webpage's first box, ask something. Done.

## 2. Don't burn credits

```bash
npm run daytona:list
npm run daytona:clean            # deletes this project's sandboxes (they also auto-stop after 30 min idle)
npm run nosana:status            # list deployments
npm run nosana:stop <deployment-id>
```

Nosana deployments here use `strategy: SIMPLE` with a **60-minute timeout**, so they end on their own.

## Knobs

| Where | What |
|---|---|
| `MODEL=qwen3:8b npm run nosana:deploy` | bigger Ollama model (needs a bigger GPU market) |
| `NOSANA_MARKET` in `.env` | pin a GPU market (`npm run nosana:markets`, or browse https://explore.nosana.com) |
| `scripts/nosana.ts` → `jobDefinition` | any Docker image: change `image`, `cmd`, `expose` port |
| `scripts/daytona-web.ts` | swap the static server for your real app (Node, FastAPI, …) |

## Docs
- Daytona: https://www.daytona.io/docs — sandboxes, preview URLs, volumes (persistent storage, only if you need it)
- Nosana: https://learn.nosana.com — deployments, job definitions, API keys, GPU markets, LLM inference API

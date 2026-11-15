# Codex service checks

These commands use the local `.env`. They do not change the Daytona API key,
create GPU deployments, or publish endpoint addresses.

```sh
node ops/nosana-ready.mjs
node ops/daytona-diagnostics.mjs <sandbox-id>
BUILD_CPU=4 BUILD_MEMORY=8 BUILD_DISK=10 node ops/run-snapshot.mjs
```

The Nosana check polls every 20 seconds, waits for the configured model, then
runs one small inference request. Set `NOSANA_POLL_SECONDS` (5–60) and
`NOSANA_WAIT_MINUTES` (1–120) to change the limits. It uses `LLM_BASE_URL` or
`NOSANA_ENDPOINT`, `LLM_MODEL`, and an optional `LLM_API_KEY`.

The Daytona check reports actual sandbox resources, region quota, and the last
60 lines of install/build/server/bootstrap logs. Its optional second argument
is the absolute directory containing those logs. Review logs before sharing;
the script redacts configured secret values and model endpoint addresses.

The snapshot runner executes the upstream builder with the existing local
Daytona key and obtains a GitHub token from the authenticated CLI without
printing it. It disables shell tracing in an ignored local execution copy,
redacts output, and keeps the builder sandbox for diagnosis. Set BUILD_CPU,
BUILD_MEMORY, and BUILD_DISK to fit the account's limits; the observed disk
limit for this account is 10 GB. The runner does not edit factory or sandbox
source files. Snapshot builds can take several minutes.

Factory implementation ownership and live handoffs are in
[issue #1](https://github.com/dpbelisario/daytona-nosana-hackathon/issues/1).

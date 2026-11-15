#!/usr/bin/env bash
# Boots one airline demo. Idempotent: the first run seeds; later runs (after a
# stop/start) only start the services. See docs/factory-contract.md.
set -uo pipefail
D=/home/daytona/demo
API=/home/daytona/belli-api
FE=/home/daytona/belli
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
exec >>"$D/bootstrap.log" 2>&1
echo "=== bootstrap $(date -u +%FT%TZ)"

status() { # state step [error]
  local err="null"
  [ -n "${3:-}" ] && err=$(printf '%s' "$3" | tail -c 600 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(s)))')
  printf '{"state":"%s","step":"%s","error":%s,"updatedAt":"%s"}\n' "$1" "$2" "$err" "$(date -u +%FT%TZ)" > "$D/status.json.tmp" && mv "$D/status.json.tmp" "$D/status.json"
}
fail() { status error "$1" "$(tail -n 30 "$D/bootstrap.log")"; echo "FAILED: $1"; exit 1; }
wait_http() { # url seconds
  for _ in $(seq 1 "$2"); do curl -fsS -o /dev/null "$1" 2>/dev/null && return 0; sleep 1; done; return 1
}

status booting "starting"
pkill -f "$D/edge.mjs" 2>/dev/null; nohup node "$D/edge.mjs" >>"$D/edge.log" 2>&1 &

status booting "database"
$SUDO service postgresql start || fail "postgres"
$SUDO service redis-server start || redis-server --daemonize yes || fail "redis"
for _ in $(seq 1 60); do pg_isready -h 127.0.0.1 -q && break; sleep 1; done

set -a; source "$D/api.env"; set +a

if [ ! -f "$D/.seeded" ]; then
  [ -f "$D/profile.json" ] || fail "profile.json missing"
  status seeding "schema"
  atlas migrate apply --dir "file://$API/db/migrations" --revisions-schema public \
    --url "postgres://$DB_USER:$DB_PASSWORD@127.0.0.1:$DB_PORT/$DB_NAME?sslmode=disable" || fail "migrations"
  cd "$API" || fail "api dir"
  status seeding "reference data"; ./api seed:default || fail "seed:default"
  status seeding "organisation";   ./api seed:org-bootstrap --org "$BYPASS_ORG_ID" || fail "seed:org-bootstrap"
  status seeding "airline data (flights, aircraft, AWBs)"
  ./api seed:demo --org "$BYPASS_ORG_ID" --profile-file "$D/profile.json" || fail "seed:demo"
  status seeding "branding"; node "$D/inject.mjs" || fail "branding"
  touch "$D/.seeded"
fi

status starting "api"
pkill -f "$API/api server" 2>/dev/null
(cd "$API" && nohup ./api server >>"$D/api.log" 2>&1 &)
status starting "web"
pkill -f "next start" 2>/dev/null
(cd "$FE" && nohup ./node_modules/.bin/next start -p 3100 -H 127.0.0.1 >>"$D/fe.log" 2>&1 &)

wait_http "http://127.0.0.1:1323/health" 150 || fail "api did not start (see api.log)"
wait_http "http://127.0.0.1:3100/" 180 || fail "web did not start (see fe.log)"
status ready "ok"
echo "=== ready $(date -u +%FT%TZ)"

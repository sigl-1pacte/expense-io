#!/usr/bin/env bash
# Benchmark des endpoints d'Expense.io — voir docs/audit/baseline.md.
#
# Prérequis : `make up` (Postgres + LocalStack) et `npm install`.
# Prépare une base et un bucket dédiés, build et démarre l'application en
# production sur $PORT, mesure chaque endpoint avec k6 (via Docker), puis
# produit le tableau de résultats dans bench/results/<horodatage>/.
#
# Variables : PORT (3001), SKIP_BUILD=1, ONLY="case1 case2" (sous-ensemble).
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=${PORT:-3001}
BENCH_DB=expense_io_bench
K6_IMAGE=grafana/k6:1.3.0
LOAD_VUS=20
RESULTS=bench/results/$(date +%Y%m%d-%H%M%S)

export DATABASE_URL="postgres://expense:expense@localhost:5433/$BENCH_DB"
export MIGRATION_DATABASE_URL="$DATABASE_URL"
export S3_BUCKET=receipts-bench
export AUTH_TRUST_HOST=true
export NODE_ENV=production

# "case vus [VAR=valeur...]" — les décisions consomment une note par appel,
# elles sont donc mesurées sur un nombre fixe d'itérations.
CASES=(
  "login 1"                     "login $LOAD_VUS"
  "employee-list 1"             "employee-list $LOAD_VUS"
  "employee-create 1"           "employee-create $LOAD_VUS"
  "employee-receipt-url 1"      "employee-receipt-url $LOAD_VUS"
  "employee-ocr 1 DURATION=60s" "employee-ocr 4 DURATION=60s"
  "manager-list 1"              "manager-list $LOAD_VUS"
  "manager-receipt-url 1"       "manager-receipt-url $LOAD_VUS"
  "manager-approve 1 ITERATIONS=2000" "manager-approve $LOAD_VUS ITERATIONS=2000"
  "manager-reject 1 ITERATIONS=2000"  "manager-reject $LOAD_VUS ITERATIONS=2000"
  "hr-list 1"                   "hr-list $LOAD_VUS"
  "hr-receipt-url 1"            "hr-receipt-url $LOAD_VUS"
  "hr-approve 1 ITERATIONS=2000"      "hr-approve $LOAD_VUS ITERATIONS=2000"
  "hr-reject 1 ITERATIONS=2000"       "hr-reject $LOAD_VUS ITERATIONS=2000"
  "hr-users 1"                  "hr-users $LOAD_VUS"
  "hr-assign-manager 1"         "hr-assign-manager $LOAD_VUS"
)

mkdir -p "$RESULTS"
echo "Résultats : $RESULTS"

echo "== Base $BENCH_DB et bucket $S3_BUCKET"
node bench/create-db.mjs
./node_modules/.bin/node-pg-migrate up --migrations-dir migrations > /dev/null
node scripts/ensure-bucket.mjs

if [ "${SKIP_BUILD:-0}" != 1 ]; then
  echo "== Build de production"
  npm run build > "$RESULTS/build.log" 2>&1
fi

echo "== Démarrage de l'application sur le port $PORT"
setsid ./node_modules/.bin/next start -p "$PORT" > "$RESULTS/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill -- -"$SERVER_PID" 2> /dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$PORT/api/auth/csrf" && break
  sleep 1
done
curl -sf -o /dev/null "http://localhost:$PORT/api/auth/csrf"

{
  echo "date: $(date -Iseconds)"
  echo "commit: $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- src migrations package.json || echo ' (modifié)')"
  echo "cpu: $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs) ($(nproc) threads)"
  echo "ram: $(free -h | awk '/^Mem:/ {print $2}')"
  echo "os: $(uname -sr)"
  echo "node: $(node --version)"
  echo "k6: $K6_IMAGE"
} > "$RESULTS/environment.txt"

for entry in "${CASES[@]}"; do
  read -r case vus extra <<< "$entry"
  if [ -n "${ONLY:-}" ] && [[ " $ONLY " != *" $case "* ]]; then continue; fi
  node bench/seed.mjs > /dev/null
  env_args=()
  for assignment in $extra; do env_args+=(-e "$assignment"); done
  docker run --rm --network host --user "$(id -u):$(id -g)" \
    -v "$PWD/bench:/bench" \
    -e BASE_URL="http://localhost:$PORT" -e CASE="$case" -e VUS="$vus" \
    -e OUT="/$RESULTS/$case-$vus.json" "${env_args[@]}" \
    "$K6_IMAGE" run --quiet --no-usage-report /bench/k6/endpoints.js \
    2> "$RESULTS/$case-$vus.log"
done

node bench/report.mjs "$RESULTS" > "$RESULTS/report.md"
echo "== Tableau : $RESULTS/report.md"

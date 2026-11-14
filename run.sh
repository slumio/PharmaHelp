#!/usr/bin/env bash
# Pharmacy Copilot — one command to run everything.
#
#   ./run.sh          start the dev server on http://localhost:3000 (same as dev)
#   ./run.sh dev      start the dev server with hot reload
#   ./run.sh test     unit tests + browser e2e tests
#   ./run.sh seed     reset the demo database (truncate + reseed)
#   ./run.sh build    production build
#   ./run.sh start    production build, then serve on http://localhost:$PORT
#
# Needs Postgres on localhost:5432 (defaults to user ubuntu / db app — see
# .env.example to point elsewhere). OPENAI_API_KEY is optional: without it the
# agent answers from SQL via the rule-router.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3000}"

ensure_db() {
  if ! pg_isready -q -h localhost 2>/dev/null; then
    echo "Postgres is not running on localhost:5432 — start it first."
    exit 1
  fi
  npm run --silent db:migrate
  npm run --silent db:seed
}

case "${1:-dev}" in
  dev)
    ensure_db
    echo
    echo "  Pharmacy Copilot  →  http://localhost:$PORT"
    echo
    exec npx next dev -p "$PORT"
    ;;
  test)
    npm run --silent test
    if curl -sf -o /dev/null "http://localhost:$PORT"; then
      npx playwright test
    else
      npm run --silent build
      npx playwright test
    fi
    ;;
  seed)
    ensure_db
    echo "Database reset and seeded."
    ;;
  build)
    npm run build
    ;;
  start)
    ensure_db
    npm run --silent build
    echo
    echo "  Pharmacy Copilot  →  http://localhost:$PORT"
    echo
    exec npx next start -p "$PORT"
    ;;
  *)
    echo "Usage: ./run.sh [dev|test|seed|build|start]"
    exit 1
    ;;
esac

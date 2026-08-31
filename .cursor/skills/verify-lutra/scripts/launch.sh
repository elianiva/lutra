#!/usr/bin/env bash
# Launch Lutra for verification: ensure deps, then start the Vite dev server
# on a fixed port and wait until it answers. Idempotent — a second run reuses
# an already-running server. Prints the URL on success.
#
# We run Vite directly rather than `pnpm dev`: the repo's dev script uses
# portless, which needs a privileged local proxy that doesn't fit a headless
# VM. Vite on a fixed port is reachable and predictable.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PORT="${LUTRA_PORT:-5173}"
URL="http://localhost:${PORT}/"
cd "$REPO_ROOT"

# A bare 200 is not enough — some other app could own the port. Require the
# response to look like Lutra (its index.html sets the app title / manifest).
is_lutra() {
  local body
  body="$(curl -fsS "$URL" 2>/dev/null)" || return 1
  printf '%s' "$body" | grep -qiE 'lutra|/src/entry\.ts|manifest\.webmanifest'
}

if curl -fsS -o /dev/null "$URL" 2>/dev/null; then
  if is_lutra; then
    echo "Dev server already up (Lutra) at $URL"
    exit 0
  fi
  echo "Port ${PORT} is owned by another service (response is not Lutra)." >&2
  echo "Set LUTRA_PORT to a free port and retry." >&2
  exit 1
fi

# bun is needed by the build/icon/sw scripts; the dev server itself doesn't
# need it, but install it if missing so the environment is complete.
if ! command -v bun >/dev/null 2>&1 && [ -x "$HOME/.bun/bin/bun" ]; then
  export PATH="$HOME/.bun/bin:$PATH"
fi

if [ ! -d node_modules ] || [ ! -d packages/frontend/node_modules ]; then
  echo "Installing dependencies (pnpm install)…"
  corepack enable >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile
fi

echo "Starting Vite dev server on :${PORT}…"
LOG="$(mktemp /tmp/lutra-dev.XXXXXX.log)"
( cd packages/frontend && exec ./node_modules/.bin/vite --host 0.0.0.0 --port "$PORT" --strictPort ) >"$LOG" 2>&1 &
SERVER_PID=$!
echo "  pid=$SERVER_PID  log=$LOG"

for _ in $(seq 1 60); do
  if is_lutra; then
    echo "Dev server ready (Lutra) at $URL"
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Dev server exited early; log follows:" >&2
    tail -20 "$LOG" >&2
    exit 1
  fi
  sleep 1
done
echo "Dev server did not become ready within 60s; log follows:" >&2
tail -20 "$LOG" >&2
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
rm -f "$LOG"
exit 1

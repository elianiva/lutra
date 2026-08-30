#!/usr/bin/env bash
# Read-only health check: is this checkout worth driving?
# Reports the dev server, a WebGPU-capable Chrome, an X display, and a
# resolvable "ws" module. Exits non-zero if any prerequisite is missing.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PORT="${LUTRA_PORT:-5173}"
URL="http://localhost:${PORT}/"
fail=0
ok()   { echo "  ok   $1"; }
bad()  { echo "  BAD  $1"; fail=1; }

echo "Lutra verification doctor"

# 1. Dev server
if curl -fsS -o /dev/null "$URL" 2>/dev/null; then ok "dev server answering at $URL"
else bad "dev server not answering at $URL  (run scripts/launch.sh)"; fi

# 2. Chrome
CHROME_BIN="$(command -v google-chrome || command -v google-chrome-stable || true)"
if [ -n "$CHROME_BIN" ]; then ok "chrome: $CHROME_BIN ($("$CHROME_BIN" --version 2>/dev/null))"
else bad "no google-chrome / google-chrome-stable on PATH"; fi

# 3. X display (harness runs Chrome headful on the VNC display)
if [ -n "${DISPLAY:-}" ] && [ -S "/tmp/.X11-unix/X${DISPLAY##*:}" ]; then ok "X display ${DISPLAY}"
else bad "no usable X display (set DISPLAY, e.g. :1)"; fi

# 4. ws module resolvable from the repo
if node -e 'require("module").createRequire(process.cwd()+"/x.js")("ws")' 2>/dev/null; then ok "ws module resolvable"
elif ls "$REPO_ROOT"/node_modules/.pnpm/ws@* >/dev/null 2>&1; then ok "ws module present in pnpm store"
else bad "ws module not found (run pnpm install)"; fi

# 5. fixture
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../fixtures/sample.png" ]; then ok "fixture image present"
else bad "fixtures/sample.png missing"; fi

echo
if [ "$fail" -eq 0 ]; then echo "doctor: READY"; else echo "doctor: NOT READY"; fi
exit "$fail"

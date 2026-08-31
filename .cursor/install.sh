#!/usr/bin/env bash
# Idempotent repository bootstrap for the Lutra Cloud Agent environment.
# The base image already provides Node 22 and the pinned pnpm, so this only
# needs to add bun (used by the frontend build/icon/service-worker scripts and
# the LUT/RAW tooling) and refresh workspace dependencies.
set -euo pipefail

if ! command -v bun >/dev/null 2>&1 && [ ! -x "$HOME/.bun/bin/bun" ]; then
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
bun --version

corepack enable
pnpm install --frozen-lockfile

#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Sharjeel Baig
#
# Build and run openFoundry from a Termux shell on Android.
#
#   bash scripts/termux-server.sh          # localhost only (PWA on this phone)
#   bash scripts/termux-server.sh --lan    # reachable from another device
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v pkg >/dev/null 2>&1; then
  echo "This script must run inside Termux on Android." >&2
  exit 1
fi

pkg update -y
pkg install -y nodejs-lts git

node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  console.error(`Node ${process.versions.node} is too old. Next 16 needs Node 20.9 or newer.`);
  process.exit(1);
}
console.log(`Node ${process.versions.node} is ready.`);
'

if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund
fi

if [ "${OPENFOUNDRY_SKIP_BUILD:-0}" != "1" ]; then
  npm run build
fi

if [ "${1:-}" = "--lan" ]; then
  export BIND=0.0.0.0
  echo "LAN mode: open http://<this-phone-ip>:${PORT:-3000} from another device."
else
  export BIND=127.0.0.1
  echo "Local mode: open http://127.0.0.1:${PORT:-3000} on this phone."
fi

exec bash scripts/serve-standalone.sh

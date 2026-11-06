#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Sharjeel Baig
#
# Serve the Next.js standalone build with the static assets and public files
# that Next leaves outside .next/standalone. Works on macOS, Linux and Termux.
#
#   BIND=127.0.0.1 PORT=3000 scripts/serve-standalone.sh
#   BIND=0.0.0.0  PORT=3000 scripts/serve-standalone.sh   # LAN access
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVER=".next/standalone/server.js"
if [ ! -f "$SERVER" ]; then
  echo "Missing $SERVER. Run 'npm run build' first." >&2
  exit 1
fi

rm -rf .next/standalone/.next/static .next/standalone/public
cp -R .next/static .next/standalone/.next/static
if [ -d public ]; then
  cp -R public .next/standalone/public
fi
# Next 16's standalone tracer omits some server lib modules. Copy the runtime
# lib directory the same way the desktop packager does.
rm -rf .next/standalone/node_modules/next/dist/lib
cp -R node_modules/next/dist/lib .next/standalone/node_modules/next/dist/lib

export NODE_ENV=production
export PORT="${PORT:-3000}"
export HOSTNAME="${BIND:-127.0.0.1}"
export OPENFOUNDRY_DATA_DIR="${OPENFOUNDRY_DATA_DIR:-$HOME/.openfoundry/data}"
mkdir -p "$OPENFOUNDRY_DATA_DIR"

echo "openFoundry server: http://${HOSTNAME}:${PORT}"
echo "Workspace data: $OPENFOUNDRY_DATA_DIR"
exec node "$SERVER"

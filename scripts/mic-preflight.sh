#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Sharjeel Baig
#
# Checks whether this macOS session can capture the physical microphone.
# A real acoustic-room AEC validation needs a non-empty PCM capture.
#
# Usage: scripts/mic-preflight.sh [device-index]
# Exit 0: microphone produced samples.
# Exit 1: no samples; prints the exact unlock / permission step.

set -u
DEVICE="${1:-0}"
OUT_BASE="$(mktemp -t openfoundry-mic-XXXXXX)"
LOG_BASE="$(mktemp -t openfoundry-mic-XXXXXX)"
OUT="$OUT_BASE.pcm"
LOG="$LOG_BASE.log"

cleanup() {
  rm -f "$OUT_BASE" "$OUT" "$LOG_BASE" "$LOG"
}
trap cleanup EXIT

echo "Microphone preflight: device index $DEVICE"
echo "Command: ffmpeg -f avfoundation -i :$DEVICE -t 2 -ar 16000 -ac 1 -f s16le <file>"

ffmpeg -hide_banner -loglevel error \
  -f avfoundation -i ":$DEVICE" -t 2 \
  -ar 16000 -ac 1 -f s16le "$OUT" -y >"$LOG" 2>&1 &
PID=$!

# ffmpeg blocks indefinitely when the session is locked or permission is
# missing. Bound the wait instead of hanging the caller.
for _ in $(seq 1 8); do
  if ! kill -0 "$PID" 2>/dev/null; then
    break
  fi
  sleep 1
done
if kill -0 "$PID" 2>/dev/null; then
  kill -9 "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
fi

SIZE=0
if [ -f "$OUT" ]; then
  SIZE=$(stat -f%z "$OUT" 2>/dev/null || echo 0)
fi

if [ "$SIZE" -gt 0 ]; then
  echo "PASS: captured $SIZE bytes from audio device $DEVICE."
  exit 0
fi

echo "BLOCKED: captured 0 bytes from audio device $DEVICE."
if [ -s "$LOG" ]; then
  echo "ffmpeg said:"
  sed -n '1,6p' "$LOG"
fi
cat <<'EOF'

To fix this, a person must:
  1. Unlock the Mac and keep the GUI session active (not the lock screen).
  2. Open System Settings -> Privacy & Security -> Microphone.
  3. Enable Microphone for the terminal app that runs this harness
     (Terminal, iTerm, Warp, or the agent host app), then quit and reopen it.
  4. Re-run: scripts/mic-preflight.sh 0
  5. Then run the acoustic harness:
     OPENFOUNDRY_PHYSICAL_MIC=1 npx vitest run tests/aec-physical.test.ts
EOF
exit 1

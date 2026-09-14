#!/usr/bin/env bash
# Start the Django API detached with LiveKit dev credentials.
# Mirrors dev-stack.sh's subshell-detach pattern (plain setsid+& dies with the tool shell).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-/home/z/.venv/bin/python3}"
[ -x "$PYTHON" ] || PYTHON=python3

export LIVEKIT_URL="${LIVEKIT_URL:-ws://127.0.0.1:7880}"
export LIVEKIT_API_KEY="${LIVEKIT_API_KEY:-ethiohire-dev}"
export LIVEKIT_API_SECRET="${LIVEKIT_API_SECRET:-ethiohire-dev-secret-0123456789abcdef}"

if (exec 3<>"/dev/tcp/127.0.0.1/8000") 2>/dev/null; then
  echo "[backend] already on :8000"
  exit 0
fi
cd "$ROOT/backend" || exit 1
(nohup "$PYTHON" manage.py runserver 127.0.0.1:8000 --noreload >> /tmp/backend.log 2>&1 &)
for _ in $(seq 1 20); do
  (exec 3<>"/dev/tcp/127.0.0.1/8000") 2>/dev/null && { echo "[backend] up"; exit 0; }
  sleep 1
done
echo "[backend] FAILED to start"; exit 1

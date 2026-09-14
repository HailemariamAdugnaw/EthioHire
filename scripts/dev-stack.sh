#!/usr/bin/env bash
#
# EthioHire dev stack launcher
#   1. PostgreSQL 16 (pgserver binaries, TCP :5432)  — scripts/start_postgres.py
#   2. Django REST Framework API (:8000)             — backend/  (migrate + seed idempotent)
#   3. Interview signaling mini-service (:3031)      — mini-services/interview-signaling (bun)
#   4. React SPA (Vite, :3000, foreground)           — frontend/ (proxies /api -> :8000)
#
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-/home/z/.venv/bin/python3}"
[ -x "$PYTHON" ] || PYTHON=python3

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
}

# ---------- 1. PostgreSQL ----------
if ! port_open 5432; then
  echo "[stack] starting PostgreSQL ..."
  "$PYTHON" "$ROOT/scripts/start_postgres.py" || exit 1
else
  echo "[stack] PostgreSQL already on :5432"
fi

# ---------- 2. Django API ----------
if ! port_open 8000; then
  echo "[stack] starting Django API on :8000 ..."
  (cd "$ROOT/backend" && "$PYTHON" manage.py migrate --noinput) >> "$ROOT/backend/django.log" 2>&1
  (cd "$ROOT/backend" && "$PYTHON" manage.py seed) >> "$ROOT/backend/django.log" 2>&1
  (cd "$ROOT/backend" && nohup "$PYTHON" manage.py runserver 127.0.0.1:8000 --noreload >> "$ROOT/backend/django.log" 2>&1 &)
  for _ in $(seq 1 30); do
    port_open 8000 && break
    sleep 1
  done
else
  echo "[stack] Django already on :8000"
fi

# ---------- 3. Interview signaling (socket.io / WebRTC) ----------
SIGNALING_DIR="$ROOT/mini-services/interview-signaling"
if [ -d "$SIGNALING_DIR" ] && ! port_open 3031; then
  echo "[stack] starting interview signaling on :3031 ..."
  if [ ! -d "$SIGNALING_DIR/node_modules" ]; then
    (cd "$SIGNALING_DIR" && bun install --silent) >> "$SIGNALING_DIR/signal.log" 2>&1
  fi
  (cd "$SIGNALING_DIR" && nohup bun run dev >> "$SIGNALING_DIR/signal.log" 2>&1 &)
fi

# ---------- 4. React frontend (Vite) on :3000 ----------
echo "[stack] starting React frontend (Vite) on :3000 ..."
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  bun install
fi
exec ./node_modules/.bin/vite --host 0.0.0.0 --port 3000 --strictPort

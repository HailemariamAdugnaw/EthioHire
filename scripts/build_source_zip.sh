#!/usr/bin/env bash
# Rebuild download/EthioHire-source-code.zip — source-only bundle.
# Include policy: backend .py + requirements, frontend src/public/configs/lockfiles,
# docs, docker deliverables, signaling service source, scripts (minus
# fix-backtick.py / ui-shots), and the project .env (user-requested so the
# bundle runs with their credentials out of the box).
# NEVER includes: node_modules, __pycache__, *.log, ui-shots, pgdata, dist.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/download/EthioHire-source-code.zip"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
STAGE="$TMP/EthioHire"
mkdir -p "$STAGE"

# ---- backend (ALL python packages: config + eh incl. migrations/management) ----
mkdir -p "$STAGE/backend"
cp "$ROOT/backend/requirements.txt" "$STAGE/backend/" 2>/dev/null || true
cp "$ROOT/backend/manage.py" "$STAGE/backend/" 2>/dev/null || true
# walk the whole backend tree — every .py file, excluding __pycache__
find "$ROOT/backend" -name '*.py' -not -path '*__pycache__*' | while read -r f; do
  rel="${f#$ROOT/backend/}"
  mkdir -p "$STAGE/backend/$(dirname "$rel")"
  cp "$f" "$STAGE/backend/$rel"
done

# ---- frontend ----
mkdir -p "$STAGE/frontend"
for item in src public index.html package.json bun.lock tsconfig.json vite.config.ts nginx.conf Dockerfile postcss.config.mjs tailwind.config.ts components.json eslint.config.mjs; do
  [ -e "$ROOT/frontend/$item" ] && cp -r "$ROOT/frontend/$item" "$STAGE/frontend/" || true
done

# ---- signaling mini-service source ----
if [ -d "$ROOT/mini-services/interview-signaling" ]; then
  mkdir -p "$STAGE/mini-services"
  rsync -a --exclude node_modules --exclude '*.log' \
    "$ROOT/mini-services/interview-signaling" "$STAGE/mini-services/" 2>/dev/null || {
    mkdir -p "$STAGE/mini-services/interview-signaling"
    find "$ROOT/mini-services/interview-signaling" -type f -not -path '*node_modules*' -not -name '*.log' \
      | while read -r f; do rel="${f#$ROOT/mini-services/}"; mkdir -p "$STAGE/mini-services/$(dirname "$rel")"; cp "$f" "$STAGE/mini-services/$rel"; done
  }
fi

# ---- docs / docker deliverables / root configs ----
mkdir -p "$STAGE/docs" "$STAGE/scripts"
for f in README.md Dockerfile docker-compose.yml docker-entrypoint.sh .env.example .dockerignore .gitignore .env; do
  [ -f "$ROOT/$f" ] && cp "$ROOT/$f" "$STAGE/" || true
done
[ -d "$ROOT/docs" ] && { find "$ROOT/docs" -type f | while read -r f; do rel="${f#$ROOT/}"; mkdir -p "$STAGE/$(dirname "$rel")"; cp "$f" "$STAGE/$rel"; done; }
[ -d "$ROOT/docker" ] && { find "$ROOT/docker" -type f | while read -r f; do rel="${f#$ROOT/}"; mkdir -p "$STAGE/$(dirname "$rel")"; cp "$f" "$STAGE/$rel"; done; }

# ---- scripts (generation/dev/test helpers, minus junk) ----
find "$ROOT/scripts" -maxdepth 1 -type f \
  ! -name 'fix-backtick.py' \
  ! -name 'livekit-server' \
  ! -name '*.log' \
  | while read -r f; do cp "$f" "$STAGE/scripts/"; done

# ---- zip it ----
mkdir -p "$ROOT/download"
rm -f "$OUT"
(cd "$TMP" && zip -qr "$OUT" EthioHire)
echo "== zip rebuilt =="
unzip -t "$OUT" >/dev/null && echo "integrity: OK"
echo "files: $(unzip -l "$OUT" | tail -1 | awk '{print $2}')  size: $(du -h "$OUT" | cut -f1)"
# leak checks (.env is intentionally INCLUDED per user request)
BAD=$(unzip -l "$OUT" | rg -c "node_modules|__pycache__|\.log$|ui-shots|pgdata|/dist/" || true)
echo "leak-check (expect 0): ${BAD:-0}"
unzip -l "$OUT" | rg -q " EthioHire/\.env$" && echo ".env: included" || echo ".env: MISSING"

#!/usr/bin/env bash
# Docker entrypoint for the EthioHire Django API:
# wait for PostgreSQL -> migrate -> seed (idempotent) -> gunicorn
set -e

echo "[entrypoint] waiting for database..."
python - << 'PYEOF'
import os
import time
import psycopg2

for attempt in range(60):
    try:
        conn = psycopg2.connect(
            host=os.environ.get("PGHOST", "db"),
            port=os.environ.get("PGPORT", "5432"),
            dbname=os.environ.get("PGDATABASE", "ethiohire"),
            user=os.environ.get("PGUSER", "ethiohire"),
            password=os.environ.get("PGPASSWORD", "ethiohire"),
            connect_timeout=3,
        )
        conn.close()
        print("[entrypoint] database is up")
        break
    except Exception as exc:  # noqa: BLE001
        print(f"[entrypoint] db not ready ({attempt + 1}/60): {exc.__class__.__name__}")
        time.sleep(1)
else:
    raise SystemExit("[entrypoint] database never became ready")
PYEOF

echo "[entrypoint] applying migrations..."
python manage.py migrate --noinput

echo "[entrypoint] seeding demo data (skips if already seeded)..."
python manage.py seed

echo "[entrypoint] starting gunicorn on :8000"
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout 120 \
    --access-logfile -

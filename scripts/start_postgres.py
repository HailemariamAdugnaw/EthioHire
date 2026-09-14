#!/usr/bin/env python3
"""
EthioHire — local PostgreSQL bootstrap (no root required).

Uses the PostgreSQL binaries bundled with the `pgserver` pip package, but
starts postmaster directly via pg_ctl so it listens on TCP 127.0.0.1:5432
(production-like for Django). Idempotent: safe to call on every boot.

  data dir : /home/z/my-project/db/pgdata
  database : $PGDATABASE (default ethiohire, owner: $PGUSER / $PGPASSWORD)
  port     : $PGPORT (TCP on 127.0.0.1)

The app role/database are taken from the standard PG* environment variables
(loaded from the repo-root .env when present), matching config/settings.py —
e.g. PGUSER=postgre / PGPASSWORD=... creates that role with the same
superuser privileges the Docker image gives POSTGRES_USER.
"""
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import psycopg2

import pgserver


def _load_env_file(path: Path) -> None:
    """Same semantics as config.settings._load_env_file (no overrides)."""
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(Path(__file__).resolve().parent.parent / ".env")

PGDATA = os.environ.get("EH_PGDATA", "/home/z/my-project/db/pgdata")
DB_NAME = os.environ.get("PGDATABASE", "ethiohire")
DB_USER = os.environ.get("PGUSER", "ethiohire")
DB_PASS = os.environ.get("PGPASSWORD", "ethiohire")
PG_PORT = int(os.environ.get("EH_PGPORT", os.environ.get("PGPORT", "5432")))
PGHOST = os.environ.get("PGHOST", "127.0.0.1")


def pg_bin() -> str:
    """Directory of the postgres binaries shipped inside pgserver."""
    return os.path.join(os.path.dirname(pgserver.__file__), "pginstall", "bin")


def tcp_alive() -> bool:
    try:
        with socket.create_connection((PGHOST, PG_PORT), timeout=1):
            return True
    except OSError:
        return False


def postmaster_running() -> bool:
    pidfile = os.path.join(PGDATA, "postmaster.pid")
    if not os.path.exists(pidfile):
        return False
    try:
        pid = int(open(pidfile).readline().strip())
        os.kill(pid, 0)
        return True
    except (ValueError, OSError):
        return False


def stop_socket_only_instance() -> None:
    """Stop an instance previously started by pgserver (socket-only, -h '')."""
    if not postmaster_running():
        return
    print("[pg] stopping socket-only instance to relaunch with TCP ...")
    subprocess.run(
        [os.path.join(pg_bin(), "pg_ctl"), "-D", PGDATA, "-m", "fast", "stop"],
        check=False,
        capture_output=True,
    )
    time.sleep(1)


HEAL_DIRS = (
    "pg_notify",
    "pg_stat",
    "pg_tblspc",
    "pg_replslot",
    "pg_snapshots",
    "pg_twophase",
    "pg_commit_ts",
    "pg_dynshmem",
    "pg_serial",
    "pg_stat_tmp",
    "pg_logical",
    "pg_logical/snapshots",
    "pg_logical/mappings",
)


def heal_pgdata(data_dir: str) -> None:
    """Self-heal a pgdata dir broken by sync/copy tools: file syncs drop empty
    subdirectories and can widen permissions, which makes postmaster refuse to
    start. Re-create the expected empty dirs and tighten the data dir mode."""
    if not os.path.isdir(data_dir):
        return
    os.chmod(data_dir, 0o700)
    for rel in HEAL_DIRS:
        path = os.path.join(data_dir, rel)
        if not os.path.isdir(path):
            os.makedirs(path, mode=0o700)
            print(f"[pg] healed missing directory {rel}")


def start_tcp_instance() -> None:
    logfile = os.path.join(PGDATA, "eh-postgres.log")
    # -l is critical: without it the daemonized postmaster inherits our stdout
    # pipe and subprocess.run() waits for EOF forever.
    subprocess.run(
        [
            os.path.join(pg_bin(), "pg_ctl"),
            "-D", PGDATA,
            "-l", logfile,
            "-o", f'-h {PGHOST} -p {PG_PORT} -k "{PGDATA}"',
            "-w", "-t", "60",
            "start",
        ],
        check=True,
        capture_output=True,
        timeout=90,
    )


def ensure_role_and_db() -> None:
    conn = psycopg2.connect(
        host=PGHOST, port=PG_PORT, dbname="postgres", user="postgres"
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (DB_USER,))
    if cur.fetchone() is None:
        # SUPERUSER mirrors what the postgres Docker image does for POSTGRES_USER
        # and keeps migrations/seed simple when re-pointing the app at new creds.
        cur.execute(f'CREATE USER "{DB_USER}" WITH SUPERUSER PASSWORD %s', (DB_PASS,))
        print(f"[pg] created superuser role {DB_USER}")
    else:
        cur.execute(f'ALTER USER "{DB_USER}" WITH SUPERUSER PASSWORD %s', (DB_PASS,))
    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
    if cur.fetchone() is None:
        cur.execute(f'CREATE DATABASE "{DB_NAME}" OWNER "{DB_USER}"')
        print(f"[pg] created database {DB_NAME}")
    else:
        cur.execute(f'ALTER DATABASE "{DB_NAME}" OWNER TO "{DB_USER}"')
    cur.close()
    conn.close()


def main() -> int:
    os.makedirs(PGDATA, exist_ok=True)

    if not tcp_alive():
        # pgserver may have left a socket-only instance running — replace it
        stop_socket_only_instance()
        print(f"[pg] starting PostgreSQL on {PGHOST}:{PG_PORT} ...")
        heal_pgdata(PGDATA)
        start_tcp_instance()
        for _ in range(60):
            if tcp_alive():
                break
            time.sleep(0.5)
    else:
        print("[pg] PostgreSQL already running on TCP")

    if not tcp_alive():
        print("[pg] FAILED: TCP listener did not come up", file=sys.stderr)
        log = os.path.join(PGDATA, "pgserver.log")
        if os.path.exists(log):
            print(open(log).read()[-2000:], file=sys.stderr)
        return 1

    ensure_role_and_db()

    app_conn = psycopg2.connect(
        host=PGHOST, port=PG_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASS
    )
    with app_conn.cursor() as cur:
        cur.execute("SELECT version()")
        print("[pg] connected:", cur.fetchone()[0].split(",")[0])
    app_conn.close()

    print(f"[pg] READY  port={PG_PORT}  data={PGDATA}")
    print(f"[pg] URL    postgres://{DB_USER}:{DB_PASS}@{PGHOST}:{PG_PORT}/{DB_NAME}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/bin/sh
# EthioHire container entrypoint:
# 1. wait for PostgreSQL   2. push Prisma schema   3. seed if empty   4. start the server
set -e

echo "[EthioHire] entrypoint started"

# ---------------------------------------------------------------------------
# 1) Wait for the database (DATABASE_URL points at the compose `db` service)
# ---------------------------------------------------------------------------
node - <<'EOF'
const url = process.env.DATABASE_URL || "";
if (!url.startsWith("postgresql")) {
  console.log("[EthioHire] non-postgres DATABASE_URL — skipping wait-for-db");
  process.exit(0);
}
const { Client } = require("pg");
const attempts = parseInt(process.env.DB_WAIT_ATTEMPTS || "30", 10);
(async function wait() {
  for (let i = 1; i <= attempts; i++) {
    try {
      const c = new Client({ connectionString: url });
      await c.connect();
      await c.end();
      console.log("[EthioHire] database is reachable");
      process.exit(0);
    } catch (e) {
      console.log(`[EthioHire] waiting for database… (${i}/${attempts})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error("[EthioHire] database never became reachable");
  process.exit(1);
})();
EOF

# ---------------------------------------------------------------------------
# 2) Create/patch the schema (idempotent — safe on every boot)
# ---------------------------------------------------------------------------
echo "[EthioHire] applying Prisma schema (prisma db push)"
npx --yes prisma@6 db push --schema prisma/schema.prisma --skip-generate --accept-data-loss

# ---------------------------------------------------------------------------
# 3) Seed demo data exactly once (skipped when an admin user already exists)
# ---------------------------------------------------------------------------
SEED_FLAG=$(node -e "
const { Client } = require('pg');
const url = process.env.DATABASE_URL || '';
if (!url.startsWith('postgresql')) { console.log('skip'); process.exit(0); }
(async () => {
  try {
    const c = new Client({ connectionString: url });
    await c.connect();
    const r = await c.query(\"SELECT email FROM \\\"User\\\" WHERE email = 'admin@ethiohire.et' LIMIT 1\");
    await c.end();
    console.log(r.rows.length ? 'skip' : 'seed');
  } catch { console.log('skip'); }
})();
") || SEED_FLAG="skip"
if [ "$SEED_FLAG" = "seed" ]; then
  echo "[EthioHire] empty database detected — seeding demo data"
  node prisma/seed-docker.mjs || echo "[EthioHire] seed failed (continuing — app still runs)"
fi

# ---------------------------------------------------------------------------
# 4) Start Next.js standalone server
# ---------------------------------------------------------------------------
echo "[EthioHire] starting server on port ${PORT:-3000}"
exec "$@"

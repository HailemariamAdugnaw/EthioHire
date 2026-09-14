/**
 * One-off cleanup: remove E2E test artifacts (users named test.*@t.et and the
 * "QA Engineer (Test)" job) so the shipped db/custom.db contains only seeded
 * demo data. Run: bun scripts/cleanup-e2e.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const j = await prisma.jobPosting.deleteMany({ where: { title: "QA Engineer (Test)" } });
  console.log("deleted test jobs:", j.count);

  const u = await prisma.user.deleteMany({ where: { email: { startsWith: "test." } } });
  console.log("deleted test users:", u.count);

  const remaining = await prisma.user.findMany({ select: { email: true } });
  console.log("remaining users:", remaining.map((r) => r.email).join(", "));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

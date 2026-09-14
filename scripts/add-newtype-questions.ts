/**
 * One-off: add TRUE_FALSE + FILL_BLANK example questions to the seeded
 * "Senior Full-Stack Developer" job so the demo bank shows all four types
 * without wiping existing demo data. Idempotent.
 * Run: bun scripts/add-newtype-questions.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const job = await prisma.jobPosting.findFirst({
    where: { title: { contains: "Senior Full-Stack" } },
  });
  if (!job) {
    console.log("Seed job not found — nothing to do.");
    return;
  }

  const additions = [
    {
      questionText: "In TypeScript, 'strict: true' in tsconfig.json enables all strict type-checking options.",
      questionType: "TRUE_FALSE",
      options: null as string | null,
      correctAnswer: "TRUE",
      timeLimitSeconds: 45,
      order: 6,
    },
    {
      questionText: "The capital city of Ethiopia is ___.",
      questionType: "FILL_BLANK",
      options: null as string | null,
      correctAnswer: "Addis Ababa, Addis Abeba",
      timeLimitSeconds: 45,
      order: 7,
    },
  ];

  for (const q of additions) {
    const existing = await prisma.assessmentQuestion.findFirst({
      where: { jobId: job.id, questionText: q.questionText },
    });
    if (existing) {
      await prisma.assessmentQuestion.update({ where: { id: existing.id }, data: q });
      console.log("updated:", q.questionType);
    } else {
      await prisma.assessmentQuestion.create({ data: { jobId: job.id, ...q } });
      console.log("created:", q.questionType);
    }
  }

  const total = await prisma.assessmentQuestion.count({ where: { jobId: job.id } });
  const byType = await prisma.assessmentQuestion.groupBy({
    by: ["questionType"],
    _count: { questionType: true },
  });
  console.log("job1 total questions:", total, "| by type:", byType.map((t) => `${t.questionType}=${t._count.questionType}`).join(", "));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

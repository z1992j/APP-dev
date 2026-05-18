import { PrismaClient } from '@prisma/client';
import { SEED_LINT_WORDS } from '../src/lint/seed-words';

const prisma = new PrismaClient();

async function main() {
  console.log(`Seeding ${SEED_LINT_WORDS.length} lint words...`);
  for (const w of SEED_LINT_WORDS) {
    await prisma.lintWord.upsert({
      where: { term_patternType: { term: w.term, patternType: w.patternType } },
      update: {
        category: w.category,
        level: w.level,
        suggestion: w.suggestion ?? null,
        enabled: true,
      },
      create: {
        term: w.term,
        patternType: w.patternType,
        category: w.category,
        level: w.level,
        suggestion: w.suggestion ?? null,
      },
    });
  }
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

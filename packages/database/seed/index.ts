import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient, GameType, Difficulty } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SudokuEngine , generateQueens , generateZip , generateTango, generateNonogram, generateMinesweeper, generateKakuro, generateLightUp, generateFutoshiki, generateHitori } from '@puzzle-roll/shared';
import { SqlDriverAdapterFactory } from '@prisma/client/runtime/client';

// const connectionString = process.env.DATABASE_URL;
// if (!connectionString) throw new Error('DATABASE_URL is not set. Check your .env file.');

// Load the root .env before anything else.
console.log('env file path', path.resolve(__dirname, '../.env'))
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// DATABASE_URL is now available in process.env
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    '[prisma.config.ts] DATABASE_URL is not set. ' +
    'Ensure a .env file exists at the specified path with DATABASE_URL defined.'
  );
}

const adapter: SqlDriverAdapterFactory = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const PUZZLES_PER_DIFFICULTY = 20;
const DAILY_DAYS = 365;

const GAME_TYPES: GameType[] = [
  'sudoku', 'queens', 'zip', 'tango', 'nonogram',
  'minesweeper', 'kakuro', 'light_up', 'futoshiki', 'hitori',
];

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

type GeneratorFn = (difficulty: string, seed: number) => { puzzleData: unknown; solution: unknown; seed: number };

const GENERATORS: Record<GameType, GeneratorFn> = {
  sudoku: (d, s) => SudokuEngine.generatePuzzle(d as Parameters<typeof SudokuEngine.generatePuzzle>[0], s),
  queens: (d, s) => generateQueens(d as Parameters<typeof generateQueens>[0], s),
  zip: (d, s) => generateZip(d as Parameters<typeof generateZip>[0], s),
  tango: (d, s) => generateTango(d as Parameters<typeof generateTango>[0], s),
  nonogram: (d, s) => generateNonogram(d as Parameters<typeof generateNonogram>[0], s),
  minesweeper: (d, s) => generateMinesweeper(d as Parameters<typeof generateMinesweeper>[0], s),
  kakuro: (d, s) => generateKakuro(d as Parameters<typeof generateKakuro>[0], s),
  light_up: (d, s) => generateLightUp(d as Parameters<typeof generateLightUp>[0], s),
  futoshiki: (d, s) => generateFutoshiki(d as Parameters<typeof generateFutoshiki>[0], s),
  hitori: (d, s) => generateHitori(d as Parameters<typeof generateHitori>[0], s),
};

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function seedPuzzles(): Promise<Map<string, string[]>> {
  console.log('🎲 Generating puzzles...');
  const puzzleIdMap = new Map<string, string[]>();

  for (const gameType of GAME_TYPES) {
    for (const difficulty of DIFFICULTIES) {
      const key = `${gameType}:${difficulty}`;
      const batch: {
        gameType: GameType;
        difficulty: Difficulty;
        puzzleData: object;
        solution: object;
        seed: number;
      }[] = [];

      console.log(`  Generating ${PUZZLES_PER_DIFFICULTY} ${difficulty} ${gameType} puzzles...`);

      for (let i = 0; i < PUZZLES_PER_DIFFICULTY; i++) {
        const seed =
          parseInt(`${Date.now()}${i}`.slice(-9)) +
          i * 997 +
          GAME_TYPES.indexOf(gameType) * 10000 +
          DIFFICULTIES.indexOf(difficulty) * 100000;

        const label = `  generate-${gameType}-${difficulty}-${i}`;
        console.time(label);

        try {
          const { puzzleData, solution, seed: actualSeed } = GENERATORS[gameType](difficulty, seed);
          batch.push({
            gameType,
            difficulty,
            puzzleData: puzzleData as object,
            solution: solution as object,
            seed: actualSeed,
          });
        } catch (err) {
          console.error(`    ⚠️  Failed to generate ${gameType} ${difficulty} #${i}: ${err}`);
        }

        console.timeEnd(label);
      }

      if (batch.length === 0) {
        console.warn(`  ⚠️  No puzzles generated for ${key}, skipping DB insert`);
        puzzleIdMap.set(key, []);
        continue;
      }

      // Insert one by one so we get back each created ID reliably.
      // createMany doesn't return IDs in Prisma, and findMany after createMany
      // would fetch ALL rows for that game/difficulty — not just the new batch.
      const ids: string[] = [];
      for (const row of batch) {
        const created = await prisma.gamePuzzle.create({
          data: row,
          select: { id: true },
        });
        ids.push(created.id);
      }

      puzzleIdMap.set(key, ids);
      console.log(`  ✅ ${gameType} ${difficulty}: ${ids.length} puzzles created`);
    }
  }

  return puzzleIdMap;
}

async function seedDailyPuzzles(puzzleIdMap: Map<string, string[]>): Promise<void> {
  console.log('\n📅 Assigning daily puzzles for 365 days...');

  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);

  const usedIndices = new Map<string, number>();

  const dailyDifficulties: Difficulty[] = ['medium', 'hard', 'medium', 'hard', 'easy', 'expert'];

  for (let dayOffset = 0; dayOffset < DAILY_DAYS; dayOffset++) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    const dateStr = toISODate(date);

    for (const gameType of GAME_TYPES) {
      const difficulty = dailyDifficulties[dayOffset % dailyDifficulties.length];
      const key = `${gameType}:${difficulty}`;
      const ids = puzzleIdMap.get(key) ?? [];

      if (ids.length === 0) {
        console.warn(`  ⚠️  No puzzles for ${key}`);
        continue;
      }

      const currentIdx = usedIndices.get(key) ?? 0;
      const puzzleId = ids[currentIdx % ids.length];
      usedIndices.set(key, currentIdx + 1);

      await prisma.dailyPuzzle.upsert({
        where: { gameType_date: { gameType, date: dateStr } },
        create: { gameType, date: dateStr, puzzleId },
        update: { puzzleId },
      });
    }

    if (dayOffset % 30 === 0) {
      console.log(`  ✅ Assigned daily puzzles through day ${dayOffset + 1}`);
    }
  }

  console.log(
    `  ✅ ${DAILY_DAYS} days × ${GAME_TYPES.length} games = ${DAILY_DAYS * GAME_TYPES.length} daily puzzle assignments`
  );
}

async function main(): Promise<void> {
  console.log('🌱 Starting Puzzle Roll seed...\n');

  console.log('🧹 Clearing existing puzzle data...');
  await prisma.gameCompletion.deleteMany();
  await prisma.dailyPuzzle.deleteMany();
  await prisma.gamePuzzle.deleteMany();

  const puzzleIdMap = await seedPuzzles();
  await seedDailyPuzzles(puzzleIdMap);

  const totalPuzzles = await prisma.gamePuzzle.count();
  const totalDaily = await prisma.dailyPuzzle.count();

  console.log(`\n✨ Seed complete!`);
  console.log(`   ${totalPuzzles} puzzles created`);
  console.log(`   ${totalDaily} daily puzzle assignments created`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
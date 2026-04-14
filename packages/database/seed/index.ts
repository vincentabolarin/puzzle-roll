import { PrismaClient, GameType, Difficulty } from '@prisma/client';
import { SudokuEngine } from '@puzzle-roll/shared';
import { generatePuzzle as generateQueens } from '../../../packages/shared/src/engines/queens';
import { generatePuzzle as generateZip } from '../../../packages/shared/src/engines/zip';
import { generatePuzzle as generateTango } from '../../../packages/shared/src/engines/tango';
import { generatePuzzle as generateNonogram } from '../../../packages/shared/src/engines/nonogram';
import { generatePuzzle as generateMinesweeper } from '../../../packages/shared/src/engines/minesweeper';
import { generatePuzzle as generateKakuro } from '../../../packages/shared/src/engines/kakuro';
import { generatePuzzle as generateLightUp } from '../../../packages/shared/src/engines/lightup';
import { generatePuzzle as generateFutoshiki } from '../../../packages/shared/src/engines/futoshiki';
import { generatePuzzle as generateHitori } from '../../../packages/shared/src/engines/hitori';

const prisma = new PrismaClient();

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

function getStartDate(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function seedPuzzles(): Promise<Map<string, string[]>> {
  console.log('🎲 Generating puzzles...');
  const puzzleIdMap = new Map<string, string[]>();

  for (const gameType of GAME_TYPES) {
    for (const difficulty of DIFFICULTIES) {
      const key = `${gameType}:${difficulty}`;
      const ids: string[] = [];
      console.log(`  Generating ${PUZZLES_PER_DIFFICULTY} ${difficulty} ${gameType} puzzles...`);

      for (let i = 0; i < PUZZLES_PER_DIFFICULTY; i++) {
        const seed = parseInt(`${Date.now()}${i}`.slice(-9)) + i * 997 + GAME_TYPES.indexOf(gameType) * 10000 + DIFFICULTIES.indexOf(difficulty) * 100000;
        
        let puzzleData: unknown;
        let solution: unknown;
        let actualSeed: number;

        try {
          const result = GENERATORS[gameType](difficulty, seed);
          puzzleData = result.puzzleData;
          solution = result.solution;
          actualSeed = result.seed;
        } catch (err) {
          console.error(`    ⚠️  Failed to generate ${gameType} ${difficulty} #${i}: ${err}`);
          continue;
        }

        const puzzle = await prisma.gamePuzzle.create({
          data: {
            gameType: gameType as GameType,
            difficulty: difficulty as Difficulty,
            puzzleData: puzzleData as object,
            solution: solution as object,
            seed: actualSeed!,
          },
        });

        ids.push(puzzle.id);
      }

      puzzleIdMap.set(key, ids);
      console.log(`  ✅ ${gameType} ${difficulty}: ${ids.length} puzzles created`);
    }
  }

  return puzzleIdMap;
}

async function seedDailyPuzzles(puzzleIdMap: Map<string, string[]>): Promise<void> {
  console.log('\n📅 Assigning daily puzzles for 365 days...');

  const startDate = getStartDate();
  const usedIndices = new Map<string, number>();

  for (let dayOffset = 0; dayOffset < DAILY_DAYS; dayOffset++) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    const dateStr = toISODate(date);

    for (const gameType of GAME_TYPES) {
      // Cycle through all difficulties but bias towards medium/hard for daily
      const dailyDifficulties: Difficulty[] = ['medium', 'hard', 'medium', 'hard', 'easy', 'expert'];
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
        where: { gameType_date: { gameType: gameType as GameType, date: dateStr } },
        create: {
          gameType: gameType as GameType,
          date: dateStr,
          puzzleId,
        },
        update: { puzzleId },
      });
    }

    if (dayOffset % 30 === 0) {
      console.log(`  ✅ Assigned daily puzzles through day ${dayOffset + 1}`);
    }
  }

  console.log(`  ✅ ${DAILY_DAYS} days × ${GAME_TYPES.length} games = ${DAILY_DAYS * GAME_TYPES.length} daily puzzle assignments`);
}

async function main(): Promise<void> {
  console.log('🌱 Starting Puzzle Roll seed...\n');

  // Clear existing data
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

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient, GameType, Difficulty } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  SudokuEngine, generateQueens, generateZip, generateTango,
  generateNonogram, generateMinesweeper, generateKakuro,
  generateLightUp, generateFutoshiki, generateHitori,
  buildThemedNonogram
} from '@puzzle-roll/shared';
import { SqlDriverAdapterFactory } from '@prisma/client/runtime/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('[seed] DATABASE_URL is not set.');

const adapter: SqlDriverAdapterFactory = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const PUZZLES_PER_DIFFICULTY = 10;
const DAILY_DAYS = 365;
const PUZZLE_TIMEOUT_MS = 30_000;

const GAME_TYPES: GameType[] = [
  'sudoku','queens','zip','tango','nonogram',
  'minesweeper','kakuro','light_up','futoshiki','hitori',
];
const DIFFICULTIES: Difficulty[] = ['easy','medium','hard','expert'];

// ─── Themed Nonogram Days ────────────────────────────────────────────────────
// Add entries here for special hand-crafted daily nonograms.
// `grid` is a boolean[][] where true = filled cell.
// `difficulty` determines the target difficulty slot for the daily assignment.
// The grid must match the NONOGRAM_SIZE_CONFIG for that difficulty:
//   easy=5, medium=7, hard=9, expert=11
//
// Example: letter "P" on a 5×5 easy grid:
// {
//   date: '2026-01-01',
//   difficulty: 'easy',
//   grid: [
//     [true,  true,  true,  false, false],
//     [true,  false, false, true,  false],
//     [true,  true,  true,  false, false],
//     [true,  false, false, false, false],
//     [true,  false, false, false, false],
//   ],
// },
const THEMED_NONOGRAM_DAYS: {
  date: string;
  difficulty: Difficulty;
  grid: boolean[][];
}[] = [
  // Add themed entries here
];
// ─────────────────────────────────────────────────────────────────────────────

type GenFn = (d: string, s: number) => { puzzleData: unknown; solution: unknown; seed: number };
const GENERATORS: Record<GameType, GenFn> = {
  sudoku:      (d,s)=>SudokuEngine.generatePuzzle(d as Parameters<typeof SudokuEngine.generatePuzzle>[0],s),
  queens:      (d,s)=>generateQueens(d as Parameters<typeof generateQueens>[0],s),
  zip:         (d,s)=>generateZip(d as Parameters<typeof generateZip>[0],s),
  tango:       (d,s)=>generateTango(d as Parameters<typeof generateTango>[0],s),
  nonogram:    (d,s)=>generateNonogram(d as Parameters<typeof generateNonogram>[0],s),
  minesweeper: (d,s)=>generateMinesweeper(d as Parameters<typeof generateMinesweeper>[0],s),
  kakuro:      (d,s)=>generateKakuro(d as Parameters<typeof generateKakuro>[0],s),
  light_up:    (d,s)=>generateLightUp(d as Parameters<typeof generateLightUp>[0],s),
  futoshiki:   (d,s)=>generateFutoshiki(d as Parameters<typeof generateFutoshiki>[0],s),
  hitori:      (d,s)=>generateHitori(d as Parameters<typeof generateHitori>[0],s),
};

async function tryGenerate(gameType: GameType, difficulty: string, seed: number) {
  return new Promise<{ puzzleData: unknown; solution: unknown; seed: number } | null>((resolve) => {
    const t = setTimeout(() => { console.warn(`    ⏱  Timeout: ${gameType} ${difficulty}`); resolve(null); }, PUZZLE_TIMEOUT_MS);
    try { const r = GENERATORS[gameType](difficulty, seed); clearTimeout(t); resolve(r); }
    catch (e) { clearTimeout(t); console.error(`    ⚠️  ${e instanceof Error ? e.message : e}`); resolve(null); }
  });
}

function toISO(date: Date) { return date.toISOString().slice(0,10); }

/** Seed one (gameType, difficulty) combination and return generated puzzle IDs. */
async function seedOneDifficulty(
  gameType: GameType,
  difficulty: Difficulty,
  baseIndex: number,
): Promise<string[]> {
  const key = `${gameType}:${difficulty}`;
  const batch: { gameType: GameType; difficulty: Difficulty; puzzleData: object; solution: object; seed: number }[] = [];

  for (let i = 0; i < PUZZLES_PER_DIFFICULTY; i++) {
    const seed = Math.abs(Math.floor(Date.now() / 1000)) + i * 997
      + GAME_TYPES.indexOf(gameType) * 10_000
      + DIFFICULTIES.indexOf(difficulty) * 100_000
      + baseIndex;
    const r = await tryGenerate(gameType, difficulty, seed);
    if (r) batch.push({ gameType, difficulty, puzzleData: r.puzzleData as object, solution: r.solution as object, seed: r.seed });
  }

  if (batch.length === 0) {
    console.warn(`  ⚠️  Zero puzzles for ${key}`);
    return [];
  }

  const ids: string[] = [];
  for (const row of batch) {
    const c = await prisma.gamePuzzle.create({ data: row, select: { id: true } });
    ids.push(c.id);
  }
  console.log(`  ✅ ${key}: ${ids.length} puzzles`);
  return ids;
}

async function seedPuzzles(): Promise<Map<string, string[]>> {
  console.log('🎲 Generating puzzles...\n');
  const map = new Map<string, string[]>();

  // Seed each game type sequentially (avoids DB overload),
  // but all 4 difficulties of a game run IN PARALLEL.
  for (const gameType of GAME_TYPES) {
    console.log(`▶ ${gameType}`);
    const results = await Promise.all(
      DIFFICULTIES.map((difficulty, i) =>
        seedOneDifficulty(gameType, difficulty, i * PUZZLES_PER_DIFFICULTY * 10)
      )
    );
    for (let i = 0; i < DIFFICULTIES.length; i++) {
      map.set(`${gameType}:${DIFFICULTIES[i]}`, results[i]);
    }
    console.log('');
  }

  return map;
}

async function seedThemedNonograms(): Promise<Map<string, string>> {
  // Returns: date → puzzleId for overriding the normal rotation
  const dateToId = new Map<string, string>();
  if (THEMED_NONOGRAM_DAYS.length === 0) return dateToId;

  console.log(`🎨 Seeding ${THEMED_NONOGRAM_DAYS.length} themed nonogram(s)...\n`);
  for (const entry of THEMED_NONOGRAM_DAYS) {
    try {
      const generated = buildThemedNonogram(entry.grid);
      const record = await prisma.gamePuzzle.create({
        data: {
          gameType: 'nonogram',
          difficulty: entry.difficulty,
          puzzleData: generated.puzzleData as object,
          solution: generated.solution as object,
          seed: -1, // marker for themed puzzles
        },
        select: { id: true },
      });
      dateToId.set(entry.date, record.id);
      console.log(`  ✅ Themed nonogram for ${entry.date} (${entry.difficulty})`);
    } catch (e) {
      console.error(`  ⚠️  Failed themed nonogram for ${entry.date}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return dateToId;
}

async function seedDaily(map: Map<string, string[]>, themedOverrides: Map<string, string>) {
  console.log(`📅 Assigning ${DAILY_DAYS} days of daily puzzles...\n`);
  const start = new Date(); start.setUTCHours(0,0,0,0);
  const used = new Map<string, number>();
  const rota: Difficulty[] = ['medium','hard','medium','easy','hard','expert'];

  for (let d = 0; d < DAILY_DAYS; d++) {
    const dt = new Date(start); dt.setUTCDate(dt.getUTCDate() + d);
    const dateStr = toISO(dt);
    const diff = rota[d % rota.length];

    for (const gt of GAME_TYPES) {
      // Themed nonogram override
      if (gt === 'nonogram' && themedOverrides.has(dateStr)) {
        const themedPuzzleId = themedOverrides.get(dateStr)!;
        await prisma.dailyPuzzle.upsert({
          where: { gameType_date: { gameType: gt, date: dateStr } },
          create: { gameType: gt, date: dateStr, puzzleId: themedPuzzleId },
          update: { puzzleId: themedPuzzleId },
        });
        continue;
      }

      let key = `${gt}:${diff}`;
      let ids = map.get(key) ?? [];
      if (ids.length === 0) {
        const fallback = DIFFICULTIES.map(fd=>`${gt}:${fd}`).find(k=>(map.get(k)?.length??0)>0);
        if (!fallback) continue;
        key = fallback; ids = map.get(key)!;
      }
      const idx = used.get(key) ?? 0;
      await prisma.dailyPuzzle.upsert({
        where: { gameType_date: { gameType: gt, date: dateStr } },
        create: { gameType: gt, date: dateStr, puzzleId: ids[idx % ids.length] },
        update: { puzzleId: ids[idx % ids.length] },
      });
      used.set(key, idx + 1);
    }
    if (d % 30 === 0) console.log(`  ✅ Day ${d+1} assigned`);
  }
  console.log(`\n  ✅ Complete`);
}

async function main() {
  console.log('🌱 Puzzle Roll seed starting...\n');
  console.log('🧹 Clearing existing data...');
  await prisma.gameCompletion.deleteMany();
  await prisma.dailyPuzzle.deleteMany();
  await prisma.gamePuzzle.deleteMany();
  console.log('   Done.\n');

  const map = await seedPuzzles();
  const themedOverrides = await seedThemedNonograms();
  await seedDaily(map, themedOverrides);

  console.log(`\n✨ Done! ${await prisma.gamePuzzle.count()} puzzles, ${await prisma.dailyPuzzle.count()} daily assignments.`);
}

main()
  .catch(e => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
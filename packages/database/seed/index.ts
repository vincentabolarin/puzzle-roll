import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient, GameType, Difficulty } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  SudokuEngine, generateQueens, generateZip, generateTango,
  generateNonogram, generateMinesweeper, generateKakuro,
  generateLightUp, generateFutoshiki, generateHitori,
  buildThemedNonogram,
} from '@puzzle-roll/shared';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('[seed] DATABASE_URL is not set.');

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as never);

const PUZZLES_PER_DIFFICULTY = 200;
const DAILY_DAYS = 365;
// Per-attempt timeout (ms). Tango/Hitori expert can take up to ~20s.
const ATTEMPT_TIMEOUT_MS = 25_000;
// Max attempts per puzzle slot before giving up that slot
const MAX_ATTEMPTS_PER_SLOT = 8;

const GAME_TYPES: GameType[] = [
  'sudoku','queens','zip','tango','nonogram',
  'minesweeper','kakuro','light_up','futoshiki','hitori',
];
const DIFFICULTIES: Difficulty[] = ['easy','medium','hard','expert'];

// ─── Themed Nonogram Days ──────────────────────────────────────────────────
// Add entries here for special hand-crafted daily nonograms.
// grid must match NONOGRAM_SIZE_CONFIG: easy=5, medium=7, hard=9, expert=11
const THEMED_NONOGRAM_DAYS: { date: string; difficulty: Difficulty; grid: boolean[][] }[] = [
  // Example:
  // { date: '2026-12-25', difficulty: 'easy', grid: [[true,false,true,false,true],[false,true,false,true,false],[true,false,true,false,true],[false,true,false,true,false],[true,false,true,false,true]] },
];
// ──────────────────────────────────────────────────────────────────────────

type GenResult = { puzzleData: unknown; solution: unknown; seed: number };
type GenFn = (difficulty: string, seed: number) => GenResult;

const GENERATORS: Record<GameType, GenFn> = {
  sudoku:      (d, s) => SudokuEngine.generatePuzzle(d as Parameters<typeof SudokuEngine.generatePuzzle>[0], s),
  queens:      (d, s) => generateQueens(d as Parameters<typeof generateQueens>[0], s),
  zip:         (d, s) => generateZip(d as Parameters<typeof generateZip>[0], s),
  tango:       (d, s) => generateTango(d as Parameters<typeof generateTango>[0], s),
  nonogram:    (d, s) => generateNonogram(d as Parameters<typeof generateNonogram>[0], s),
  minesweeper: (d, s) => generateMinesweeper(d as Parameters<typeof generateMinesweeper>[0], s),
  kakuro:      (d, s) => generateKakuro(d as Parameters<typeof generateKakuro>[0], s),
  light_up:    (d, s) => generateLightUp(d as Parameters<typeof generateLightUp>[0], s),
  futoshiki:   (d, s) => generateFutoshiki(d as Parameters<typeof generateFutoshiki>[0], s),
  hitori:      (d, s) => generateHitori(d as Parameters<typeof generateHitori>[0], s),
};

/**
 * Try to generate one puzzle. Wraps in a Promise so we can apply a timeout.
 * Note: JS is single-threaded so the timeout only fires AFTER the synchronous
 * generator returns — this guards against generators that loop forever, not
 * ones that are just slow. For slow generators (nonogram hard, tango expert)
 * we rely on the generator's own internal attempt limits.
 */
function tryGenerate(gameType: GameType, difficulty: string, seed: number): Promise<GenResult | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      console.warn(`    ⏱  Timeout: ${gameType}:${difficulty} seed=${seed}`);
      resolve(null);
    }, ATTEMPT_TIMEOUT_MS);
    try {
      const r = GENERATORS[gameType](difficulty, seed);
      clearTimeout(timer);
      resolve(r);
    } catch (e) {
      clearTimeout(timer);
      // Generator threw (e.g. "Failed after N attempts") — not an error, just retry with different seed
      resolve(null);
    }
  });
}

/**
 * Deterministic seed for a given game/difficulty/slot combination.
 * Uses large prime offsets so different game types never share seeds.
 */
function makeSeed(gameType: GameType, difficulty: Difficulty, slotIdx: number, attemptIdx: number): number {
  const gtOffset = GAME_TYPES.indexOf(gameType) * 100_000_000;
  const diffOffset = DIFFICULTIES.indexOf(difficulty) * 10_000_000;
  const slotOffset = slotIdx * 100_000;
  const attemptOffset = attemptIdx * 7919;
  return Math.abs(gtOffset + diffOffset + slotOffset + attemptOffset + 1);
}

async function seedOneDifficulty(gameType: GameType, difficulty: Difficulty): Promise<string[]> {
  const ids: string[] = [];
  const key = `${gameType}:${difficulty}`;

  for (let slot = 0; slot < PUZZLES_PER_DIFFICULTY; slot++) {
    let result: GenResult | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SLOT; attempt++) {
      const seed = makeSeed(gameType, difficulty, slot, attempt);
      result = await tryGenerate(gameType, difficulty, seed);
      if (result) break;
    }
    if (!result) {
      console.warn(`    ⚠  ${key} slot ${slot + 1}: all ${MAX_ATTEMPTS_PER_SLOT} attempts failed — skipping`);
      continue;
    }
    const row = await prisma.gamePuzzle.create({
      data: { gameType, difficulty, seed: result.seed, puzzleData: result.puzzleData as object, solution: result.solution as object },
      select: { id: true },
    });
    ids.push(row.id);
  }

  const status = ids.length === PUZZLES_PER_DIFFICULTY ? '✅' : `⚠  ${ids.length}/${PUZZLES_PER_DIFFICULTY}`;
  console.log(`  ${status} ${key}`);
  return ids;
}

async function seedAllPuzzles(): Promise<Map<string, string[]>> {
  console.log('🎲 Generating puzzles...\n');
  const map = new Map<string, string[]>();

  for (const gameType of GAME_TYPES) {
    console.log(`▶ ${gameType}`);
    // All 4 difficulties for this game in parallel
    const results = await Promise.all(
      DIFFICULTIES.map(d => seedOneDifficulty(gameType, d))
    );
    DIFFICULTIES.forEach((d, i) => map.set(`${gameType}:${d}`, results[i]));
    console.log('');
  }

  return map;
}

async function seedThemedNonograms(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (THEMED_NONOGRAM_DAYS.length === 0) return map;
  console.log(`🎨 Seeding ${THEMED_NONOGRAM_DAYS.length} themed nonogram(s)...\n`);
  for (const entry of THEMED_NONOGRAM_DAYS) {
    try {
      const generated = buildThemedNonogram(entry.grid);
      const row = await prisma.gamePuzzle.create({
        data: { gameType: 'nonogram', difficulty: entry.difficulty, seed: -1, puzzleData: generated.puzzleData as object, solution: generated.solution as object },
        select: { id: true },
      });
      map.set(entry.date, row.id);
      console.log(`  ✅ Themed nonogram for ${entry.date} (${entry.difficulty})`);
    } catch (e) {
      console.error(`  ⚠  Themed ${entry.date}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return map;
}

async function seedDailyPuzzles(puzzleMap: Map<string, string[]>, themedOverrides: Map<string, string>): Promise<void> {
  console.log(`📅 Assigning ${DAILY_DAYS} days of daily puzzles...\n`);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const rota: Difficulty[] = ['medium', 'hard', 'medium', 'easy', 'hard', 'expert'];
  const used = new Map<string, number>();

  for (let d = 0; d < DAILY_DAYS; d++) {
    const dt = new Date(start);
    dt.setUTCDate(dt.getUTCDate() + d);
    const dateStr = dt.toISOString().slice(0, 10);
    const diff = rota[d % rota.length];

    for (const gt of GAME_TYPES) {
      // Themed nonogram override
      if (gt === 'nonogram' && themedOverrides.has(dateStr)) {
        await prisma.dailyPuzzle.upsert({
          where: { gameType_date: { gameType: gt, date: dateStr } },
          create: { gameType: gt, date: dateStr, puzzleId: themedOverrides.get(dateStr)! },
          update: { puzzleId: themedOverrides.get(dateStr)! },
        });
        continue;
      }

      // Find puzzle IDs for this game/difficulty; fall back to any available difficulty
      let key = `${gt}:${diff}`;
      let ids = puzzleMap.get(key) ?? [];
      if (ids.length === 0) {
        const fallback = DIFFICULTIES.map(fd => `${gt}:${fd}`).find(k => (puzzleMap.get(k)?.length ?? 0) > 0);
        if (!fallback) continue;
        key = fallback;
        ids = puzzleMap.get(key)!;
      }

      const idx = used.get(key) ?? 0;
      await prisma.dailyPuzzle.upsert({
        where: { gameType_date: { gameType: gt, date: dateStr } },
        create: { gameType: gt, date: dateStr, puzzleId: ids[idx % ids.length] },
        update: { puzzleId: ids[idx % ids.length] },
      });
      used.set(key, idx + 1);
    }
    if (d % 60 === 0) process.stdout.write(`  ✅ Day ${d + 1} assigned\n`);
  }
  console.log('\n  ✅ Daily rotation complete');
}

async function main(): Promise<void> {
  console.log('🌱 Puzzle Roll seed starting...\n');
  console.log('🧹 Clearing existing data...');
  await prisma.$transaction([
    prisma.gameCompletion.deleteMany(),
    prisma.dailyPuzzle.deleteMany(),
    prisma.gamePuzzle.deleteMany(),
  ]);
  console.log('   Done.\n');

  const puzzleMap = await seedAllPuzzles();
  const themedOverrides = await seedThemedNonograms();
  await seedDailyPuzzles(puzzleMap, themedOverrides);

  const totalPuzzles = await prisma.gamePuzzle.count();
  const totalDaily = await prisma.dailyPuzzle.count();
  const expected = GAME_TYPES.length * DIFFICULTIES.length * PUZZLES_PER_DIFFICULTY;
  const successRate = Math.round((totalPuzzles / expected) * 100);

  console.log(`\n✨ Seed complete!`);
  console.log(`   Puzzles: ${totalPuzzles}/${expected} (${successRate}%)`);
  console.log(`   Daily assignments: ${totalDaily}`);

  if (successRate < 90) {
    console.warn(`\n⚠  Success rate below 90%. Some puzzles may not be available.`);
    // Print breakdown of which combinations are low
    for (const gt of GAME_TYPES) {
      for (const d of DIFFICULTIES) {
        const ids = puzzleMap.get(`${gt}:${d}`) ?? [];
        if (ids.length < PUZZLES_PER_DIFFICULTY) {
          console.warn(`   Missing: ${gt}:${d} has ${ids.length}/${PUZZLES_PER_DIFFICULTY}`);
        }
      }
    }
  }
}

main()
  .catch(e => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
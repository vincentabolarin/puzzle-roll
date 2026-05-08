/**
 * add-puzzles.ts — non-destructive puzzle top-up script.
 *
 * Appends N new puzzles per game×difficulty without deleting existing data.
 * Run when the puzzle pool is running low:
 *   pnpm --filter @puzzle-roll/database add-puzzles
 *
 * Also extends the daily rotation by EXTEND_DAYS days from today.
 *
 * SAFE TO RUN IN PRODUCTION — does not touch GameCompletion or user data.
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient, GameType, Difficulty } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  SudokuEngine, generateQueens, generateZip, generateTango,
  generateNonogram, generateMinesweeper, generateKakuro,
  generateLightUp, generateFutoshiki, generateHitori,
} from '@puzzle-roll/shared';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('[add-puzzles] DATABASE_URL is not set.');

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as never);

const ADD_PER_DIFFICULTY = 100;   // new puzzles to add per game×difficulty
const EXTEND_DAYS = 180;           // days of daily rotation to extend
const ATTEMPT_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 8;

const GAME_TYPES: GameType[] = ['sudoku','queens','zip','tango','nonogram','minesweeper','kakuro','light_up','futoshiki','hitori'];
const DIFFICULTIES: Difficulty[] = ['easy','medium','hard','expert'];

const GENERATORS: Record<GameType, (d: string, s: number) => unknown> = {
  sudoku:      (d, s) => SudokuEngine.generatePuzzle(d as never, s),
  queens:      (d, s) => generateQueens(d as never, s),
  zip:         (d, s) => generateZip(d as never, s),
  tango:       (d, s) => generateTango(d as never, s),
  nonogram:    (d, s) => generateNonogram(d as never, s),
  minesweeper: (d, s) => generateMinesweeper(d as never, s),
  kakuro:      (d, s) => generateKakuro(d as never, s),
  light_up:    (d, s) => generateLightUp(d as never, s),
  futoshiki:   (d, s) => generateFutoshiki(d as never, s),
  hitori:      (d, s) => generateHitori(d as never, s),
};

async function tryGen(gt: GameType, diff: string, seed: number): Promise<{ puzzleData: unknown; solution: unknown; seed: number } | null> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(null), ATTEMPT_TIMEOUT_MS);
    try { const r = GENERATORS[gt](diff, seed) as never; clearTimeout(t); resolve(r); }
    catch { clearTimeout(t); resolve(null); }
  });
}

async function addPuzzlesForCombo(gt: GameType, diff: Difficulty, existingCount: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < ADD_PER_DIFFICULTY; i++) {
    // Use high seed offset to avoid collisions with initial seed
    const baseSeed = 1_000_000_000 + existingCount * 1000 + i * 7919 + GAME_TYPES.indexOf(gt) * 100_000_000;
    for (let a = 0; a < MAX_ATTEMPTS; a++) {
      const r = await tryGen(gt, diff, baseSeed + a * 13) as { puzzleData: unknown; solution: unknown; seed: number } | null;
      if (!r) continue;
      const row = await prisma.gamePuzzle.create({
        data: { gameType: gt, difficulty: diff, seed: r.seed, puzzleData: r.puzzleData as object, solution: r.solution as object },
        select: { id: true },
      });
      ids.push(row.id);
      break;
    }
  }
  console.log(`  ✅ ${gt}:${diff} — added ${ids.length}/${ADD_PER_DIFFICULTY}`);
  return ids;
}

async function main(): Promise<void> {
  console.log('🌱 Adding puzzles (non-destructive)...\n');

  const newPuzzleMap = new Map<string, string[]>();

  for (const gt of GAME_TYPES) {
    console.log(`▶ ${gt}`);
    for (const diff of DIFFICULTIES) {
      const existing = await prisma.gamePuzzle.count({ where: { gameType: gt, difficulty: diff } });
      const ids = await addPuzzlesForCombo(gt, diff, existing);
      newPuzzleMap.set(`${gt}:${diff}`, ids);
    }
    console.log('');
  }

  // Extend daily rotation from today's furthest assigned date
  console.log(`📅 Extending daily rotation by ${EXTEND_DAYS} days...\n`);
  const latest = await prisma.dailyPuzzle.findFirst({ orderBy: { date: 'desc' }, select: { date: true } });
  const startDate = latest ? new Date(latest.date) : new Date();
  startDate.setUTCDate(startDate.getUTCDate() + 1);

  const rota: Difficulty[] = ['medium','hard','medium','easy','hard','expert'];
  const usedIdx = new Map<string, number>();

  for (let d = 0; d < EXTEND_DAYS; d++) {
    const dt = new Date(startDate);
    dt.setUTCDate(dt.getUTCDate() + d);
    const dateStr = dt.toISOString().slice(0, 10);
    const diff = rota[d % rota.length];

    for (const gt of GAME_TYPES) {
      let key = `${gt}:${diff}`;
      let ids = newPuzzleMap.get(key) ?? [];
      if (ids.length === 0) {
        // Fallback to any difficulty pool
        const fb = DIFFICULTIES.map(fd => `${gt}:${fd}`).find(k => (newPuzzleMap.get(k)?.length ?? 0) > 0);
        if (!fb) continue;
        key = fb; ids = newPuzzleMap.get(key)!;
      }
      const idx = usedIdx.get(key) ?? 0;
      await prisma.dailyPuzzle.upsert({
        where: { gameType_date: { gameType: gt, date: dateStr } },
        create: { gameType: gt, date: dateStr, puzzleId: ids[idx % ids.length] },
        update: { puzzleId: ids[idx % ids.length] },
      });
      usedIdx.set(key, idx + 1);
    }
  }

  console.log(`\n✨ Done! Added puzzles and extended rotation to ${EXTEND_DAYS} more days.`);
}

main().catch(e => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
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

async function seedPuzzles(): Promise<Map<string, string[]>> {
  console.log('🎲 Generating puzzles...\n');
  const map = new Map<string, string[]>();

  for (const gameType of GAME_TYPES) {
    for (const difficulty of DIFFICULTIES) {
      const key = `${gameType}:${difficulty}`;
      console.log(`  ▶ ${key}`);
      const batch: { gameType: GameType; difficulty: Difficulty; puzzleData: object; solution: object; seed: number }[] = [];

      for (let i = 0; i < PUZZLES_PER_DIFFICULTY; i++) {
        const seed = Math.abs(Math.floor(Date.now() / 1000)) + i * 997 + GAME_TYPES.indexOf(gameType) * 10_000 + DIFFICULTIES.indexOf(difficulty) * 100_000;
        const label = `    [${i+1}/${PUZZLES_PER_DIFFICULTY}] ${gameType}-${difficulty}`;
        console.time(label);
        const r = await tryGenerate(gameType, difficulty, seed);
        if (r) batch.push({ gameType, difficulty, puzzleData: r.puzzleData as object, solution: r.solution as object, seed: r.seed });
        console.timeEnd(label);
      }

      if (batch.length === 0) { console.warn(`  ⚠️  Zero puzzles for ${key}\n`); map.set(key, []); continue; }

      const ids: string[] = [];
      for (const row of batch) {
        const c = await prisma.gamePuzzle.create({ data: row, select: { id: true } });
        ids.push(c.id);
      }
      map.set(key, ids);
      console.log(`  ✅ ${key}: ${ids.length} puzzles\n`);
    }
  }
  return map;
}

async function seedDaily(map: Map<string, string[]>) {
  console.log(`📅 Assigning ${DAILY_DAYS} days of daily puzzles...\n`);
  const start = new Date(); start.setUTCHours(0,0,0,0);
  const used = new Map<string, number>();
  const rota: Difficulty[] = ['medium','hard','medium','easy','hard','expert'];

  for (let d = 0; d < DAILY_DAYS; d++) {
    const dt = new Date(start); dt.setUTCDate(dt.getUTCDate() + d);
    const dateStr = toISO(dt);
    const diff = rota[d % rota.length];

    for (const gt of GAME_TYPES) {
      let key = `${gt}:${diff}`;
      let ids = map.get(key) ?? [];
      // Fall back to any available difficulty for this game
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
  await seedDaily(map);

  console.log(`\n✨ Done! ${await prisma.gamePuzzle.count()} puzzles, ${await prisma.dailyPuzzle.count()} daily assignments.`);
}

main()
  .catch(e => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@puzzle-roll/database';
import { GetPuzzlesQueryDto } from './puzzles.dto';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class PuzzlesService {
  async getDailyPuzzle(gameType: string) {
    const date = todayUTC();
    const daily = await prisma.dailyPuzzle.findUnique({
      where: {
        gameType_date: {
          gameType: gameType as Parameters<typeof prisma.dailyPuzzle.findUnique>[0]['where']['gameType_date']['gameType'],
          date,
        },
      },
      include: { puzzle: true },
    });

    if (!daily) {
      throw new NotFoundException(`No daily puzzle found for ${gameType} on ${date}`);
    }

    return {
      dailyPuzzleId: daily.id,
      date: daily.date,
      gameType: daily.gameType,
      puzzle: {
        id: daily.puzzle.id,
        gameType: daily.puzzle.gameType,
        difficulty: daily.puzzle.difficulty,
        puzzleData: daily.puzzle.puzzleData,
        // solution is intentionally omitted from this response
      },
    };
  }

  async getPuzzles(gameType: string, query: GetPuzzlesQueryDto) {
    const { difficulty, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      gameType: gameType as Parameters<typeof prisma.gamePuzzle.findMany>[0]['where']['gameType'],
      ...(difficulty ? { difficulty: difficulty as Parameters<typeof prisma.gamePuzzle.findMany>[0]['where']['difficulty'] } : {}),
    };

    const [puzzles, total] = await prisma.$transaction([
      prisma.gamePuzzle.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ difficulty: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          gameType: true,
          difficulty: true,
          puzzleData: true,
          createdAt: true,
          // solution intentionally excluded
        },
      }),
      prisma.gamePuzzle.count({ where }),
    ]);

    return {
      data: puzzles,
      total,
      page,
      limit,
      hasMore: skip + puzzles.length < total,
    };
  }

  async getPuzzleById(id: string, includeSolution = false) {
    const puzzle = await prisma.gamePuzzle.findUnique({
      where: { id },
      select: {
        id: true,
        gameType: true,
        difficulty: true,
        puzzleData: true,
        createdAt: true,
        solution: includeSolution,
      },
    });

    if (!puzzle) throw new NotFoundException(`Puzzle ${id} not found`);
    return puzzle;
  }

  async getPuzzleSolution(id: string) {
    const puzzle = await prisma.gamePuzzle.findUnique({
      where: { id },
      select: { id: true, solution: true },
    });
    if (!puzzle) throw new NotFoundException(`Puzzle ${id} not found`);
    return puzzle;
  }

  async getAllDailyPuzzles(gameType: string, limit = 30) {
    const dailies = await prisma.dailyPuzzle.findMany({
      where: {
        gameType: gameType as Parameters<typeof prisma.dailyPuzzle.findMany>[0]['where']['gameType'],
        date: { lte: todayUTC() },
      },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        puzzle: {
          select: {
            id: true,
            gameType: true,
            difficulty: true,
            puzzleData: true,
          },
        },
      },
    });

    return dailies;
  }
}

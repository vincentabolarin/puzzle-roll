import { Injectable, NotFoundException } from '@nestjs/common';
import { GetPuzzlesQueryDto } from './puzzles.dto';
import { GameType } from '@puzzle-roll/shared';
import { PrismaService } from '../common/prisma/prisma.service';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class PuzzlesService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyPuzzle(gameType: GameType) {
    const date = todayUTC();
    const daily = await this.prisma.dailyPuzzle.findUnique({
      where: { gameType_date: { gameType, date } },
      include: { puzzle: true },
    });
    if (!daily) throw new NotFoundException(`No daily puzzle found for ${gameType} on ${date}`);
    return {
      dailyPuzzleId: daily.id,
      date: daily.date,
      gameType: daily.gameType,
      puzzle: {
        id: daily.puzzle.id,
        gameType: daily.puzzle.gameType,
        difficulty: daily.puzzle.difficulty,
        puzzleData: daily.puzzle.puzzleData,
      },
    };
  }

  async getPuzzles(gameType: GameType, query: GetPuzzlesQueryDto) {
    const { difficulty, limit = 20 } = query;

    // Support both page (1-based) and offset (0-based); offset takes precedence
    let skip: number;
    if (query.offset !== undefined) {
      skip = query.offset;
    } else {
      const page = Math.max(1, query.page ?? 1);
      skip = (page - 1) * limit;
    }

    const page = Math.floor(skip / limit) + 1;

    const where = {
      gameType,
      ...(difficulty ? { difficulty } : {}),
    };

    const [puzzles, total] = await this.prisma.$transaction([
      this.prisma.gamePuzzle.findMany({
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
        },
      }),
      this.prisma.gamePuzzle.count({ where }),
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
    const puzzle = await this.prisma.gamePuzzle.findUnique({
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

  async getPuzzleSolution(id: string, userId: string) {
    // Require JWT (already enforced at controller) — the userId param is intentionally
    // not used for a hard block because:
    //   1. The client only calls this endpoint when a hint is requested (before completion)
    //   2. After completion the user legitimately wants the solution to review
    // The JWT requirement alone prevents unauthenticated scraping.
    // A future improvement: block if hintsUsed === 0 AND not completed.
    const puzzle = await this.prisma.gamePuzzle.findUnique({
      where: { id },
      select: { id: true, solution: true },
    });
    if (!puzzle) throw new NotFoundException(`Puzzle ${id} not found`);
    return puzzle;
  }

  async getAllDailyPuzzles(gameType: GameType, limit = 30) {
    return this.prisma.dailyPuzzle.findMany({
      where: { gameType, date: { lte: todayUTC() } },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        puzzle: {
          select: { id: true, gameType: true, difficulty: true, puzzleData: true },
        },
      },
    });
  }
}
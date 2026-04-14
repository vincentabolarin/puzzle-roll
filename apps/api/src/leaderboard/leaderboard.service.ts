import { Injectable } from '@nestjs/common';
import { prisma } from '@puzzle-roll/database';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class LeaderboardService {
  async getDailyLeaderboard(gameType: string, userId: string, limit = 100) {
    const date = todayUTC();

    const daily = await prisma.dailyPuzzle.findUnique({
      where: {
        gameType_date: {
          gameType: gameType as Parameters<typeof prisma.dailyPuzzle.findUnique>[0]['where']['gameType_date']['gameType'],
          date,
        },
      },
    });

    if (!daily) return { gameType, date, entries: [], userEntry: null };

    const completions = await prisma.gameCompletion.findMany({
      where: { dailyPuzzleId: daily.id },
      orderBy: [{ elapsedSeconds: 'asc' }, { hintsUsed: 'asc' }, { completedAt: 'asc' }],
      take: limit,
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    const entries = completions.map((c, index) => ({
      rank: index + 1,
      userId: c.userId,
      username: c.user.email?.split('@')[0] ?? `Player_${c.userId.slice(0, 6)}`,
      elapsedSeconds: c.elapsedSeconds,
      hintsUsed: c.hintsUsed,
      completedAt: c.completedAt.toISOString(),
    }));

    const userEntry = entries.find((e) => e.userId === userId) ?? null;

    // If user completed but is outside top N, fetch their rank separately
    if (!userEntry) {
      const userCompletion = await prisma.gameCompletion.findFirst({
        where: { dailyPuzzleId: daily.id, userId },
        include: { user: { select: { id: true, email: true } } },
      });

      if (userCompletion) {
        const rank = await prisma.gameCompletion.count({
          where: {
            dailyPuzzleId: daily.id,
            OR: [
              { elapsedSeconds: { lt: userCompletion.elapsedSeconds } },
              {
                elapsedSeconds: userCompletion.elapsedSeconds,
                hintsUsed: { lt: userCompletion.hintsUsed },
              },
            ],
          },
        });

        return {
          gameType,
          date,
          entries,
          userEntry: {
            rank: rank + 1,
            userId: userCompletion.userId,
            username:
              userCompletion.user.email?.split('@')[0] ??
              `Player_${userCompletion.userId.slice(0, 6)}`,
            elapsedSeconds: userCompletion.elapsedSeconds,
            hintsUsed: userCompletion.hintsUsed,
            completedAt: userCompletion.completedAt.toISOString(),
          },
        };
      }
    }

    return { gameType, date, entries, userEntry };
  }

  async getAllTimeLeaderboard(gameType: string, limit = 100) {
    // Best time per user for this game type across all non-daily completions
    const results = await prisma.gameCompletion.groupBy({
      by: ['userId'],
      where: {
        gameType: gameType as Parameters<typeof prisma.gameCompletion.groupBy>[0]['where']['gameType'],
        isDaily: false,
      },
      _min: { elapsedSeconds: true },
      _count: { id: true },
      orderBy: { _min: { elapsedSeconds: 'asc' } },
      take: limit,
    });

    const userIds = results.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return results.map((r, index) => ({
      rank: index + 1,
      userId: r.userId,
      username:
        userMap.get(r.userId)?.email?.split('@')[0] ??
        `Player_${r.userId.slice(0, 6)}`,
      bestTime: r._min.elapsedSeconds,
      gamesCompleted: r._count.id,
    }));
  }
}

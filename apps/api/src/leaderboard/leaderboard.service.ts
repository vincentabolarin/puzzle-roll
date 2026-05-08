import { Injectable } from '@nestjs/common';
import { GameType } from '@puzzle-roll/shared';
import { PrismaService } from '../common/prisma/prisma.service';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}
  async getDailyLeaderboard(gameType: GameType, userId: string, limit = 100) {
    const date = todayUTC();

    const daily = await this.prisma.dailyPuzzle.findUnique({
      where: {
        gameType_date: {
          gameType: gameType as GameType,
          date,
        },
      },
    });

    if (!daily) return { gameType, date, entries: [], userEntry: null };

    const completions = await this.prisma.gameCompletion.findMany({
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
      username: (c.user as any).username ?? c.user.email?.split('@')[0] ?? `Player_${c.userId.slice(0, 6)}`,
      elapsedSeconds: c.elapsedSeconds,
      hintsUsed: c.hintsUsed,
      completedAt: c.completedAt.toISOString(),
    }));

    const userEntry = entries.find((e) => e.userId === userId) ?? null;

    // If user completed but is outside top N, fetch their rank separately
    if (!userEntry) {
      const userCompletion = await this.prisma.gameCompletion.findFirst({
        where: { dailyPuzzleId: daily.id, userId },
        include: { user: { select: { id: true, email: true } } },
      });

      if (userCompletion) {
        const rank = await this.prisma.gameCompletion.count({
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
            username: (userCompletion.user as any).username ?? userCompletion.user.email?.split('@')[0] ?? `Player_${userCompletion.userId.slice(0, 6)}`,
            elapsedSeconds: userCompletion.elapsedSeconds,
            hintsUsed: userCompletion.hintsUsed,
            completedAt: userCompletion.completedAt.toISOString(),
          },
        };
      }
    }

    return { gameType, date, entries, userEntry };
  }

  async getAllTimeLeaderboard(gameType: GameType, limit = 100) {
    // Best time per user for this game type across all non-daily completions
    const results = await this.prisma.gameCompletion.groupBy({
      by: ['userId'],
      where: {
        gameType: gameType as GameType,
        isDaily: false,
      },
      _min: { elapsedSeconds: true },
      _count: { id: true },
      orderBy: { _min: { elapsedSeconds: 'asc' } },
      take: limit,
    });

    const userIds = results.map((r) => r.userId);
    const users = await this.prisma.user.findMany({
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

  /** Returns the leaderboard for the current Mon–Sun ISO week (UTC) */
  async getWeeklyLeaderboard(gameType: GameType, limit = 100) {
    // Find the most recent Monday at 00:00:00 UTC
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday
    ));

    const completions = await this.prisma.gameCompletion.findMany({
      where: { gameType: gameType as GameType, isDaily: true, completedAt: { gte: weekStart } },
      orderBy: [{ elapsedSeconds: 'asc' }, { hintsUsed: 'asc' }],
      include: { user: { select: { id: true, email: true, username: true } } },
    });

    // Best time per user this week
    const bestPerUser = new Map<string, typeof completions[0]>();
    for (const c of completions) {
      const existing = bestPerUser.get(c.userId);
      if (!existing || c.elapsedSeconds < existing.elapsedSeconds) bestPerUser.set(c.userId, c);
    }

    const sorted = Array.from(bestPerUser.values())
      .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds || a.hintsUsed - b.hintsUsed)
      .slice(0, limit);

    return sorted.map((c, i) => ({
      rank: i + 1,
      userId: c.userId,
      username: c.user.username ?? c.user.email?.split('@')[0] ?? `Player_${c.userId.slice(0, 6)}`,
      elapsedSeconds: c.elapsedSeconds,
      hintsUsed: c.hintsUsed,
    }));
  }

  /** Award weekly champion badge — called by cron every Monday midnight UTC */
  async awardWeeklyChampionBadges(): Promise<void> {
    const gameTypes: GameType[] = ['sudoku','queens','zip','tango','nonogram','minesweeper','kakuro','light_up','futoshiki','hitori'] as GameType[];
    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // badge lasts 7 days

    for (const gt of gameTypes) {
      const weekly = await this.getWeeklyLeaderboard(gt, 1);
      if (weekly.length === 0) continue;
      const winner = weekly[0];
      await this.prisma.userBadge.upsert({
        where: { userId_badgeType_gameType: { userId: winner.userId, badgeType: 'weekly_champion', gameType: gt } },
        create: { userId: winner.userId, badgeType: 'weekly_champion', gameType: gt, expiresAt: expiry },
        update: { awardedAt: new Date(), expiresAt: expiry },
      });
    }
  }

}
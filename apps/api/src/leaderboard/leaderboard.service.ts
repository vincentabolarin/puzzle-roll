import { Injectable } from '@nestjs/common';
import { GameType } from '@puzzle-roll/shared';
import { PrismaService } from '../common/prisma/prisma.service';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyLeaderboard(gameType: GameType, userId: string, limit = 50, offset = 0) {
    const date = todayUTC();

    const daily = await this.prisma.dailyPuzzle.findUnique({
      where: { gameType_date: { gameType: gameType as GameType, date } },
    });

    if (!daily) return { gameType, date, entries: [], userEntry: null, total: 0, hasMore: false };

    // Total count for rank display and pagination metadata
    const total = await this.prisma.gameCompletion.count({
      where: { dailyPuzzleId: daily.id },
    });

    const completions = await this.prisma.gameCompletion.findMany({
      where: { dailyPuzzleId: daily.id },
      orderBy: [{ hintsUsed: 'asc' }, { elapsedSeconds: 'asc' }, { completedAt: 'asc' }],
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, email: true, username: true } },
      },
    });

    const entries = completions.map((c, index) => ({
      rank: offset + index + 1,
      userId: c.userId,
      username: (c.user as any).username ?? c.user.email?.split('@')[0] ?? `Player_${c.userId.slice(0, 6)}`,
      elapsedSeconds: c.elapsedSeconds,
      hintsUsed: c.hintsUsed,
      completedAt: c.completedAt.toISOString(),
    }));

    // Always resolve the user's entry regardless of pagination window
    const userInPage = entries.find((e) => e.userId === userId) ?? null;
    let userEntry = userInPage;

    if (!userEntry) {
      const userCompletion = await this.prisma.gameCompletion.findFirst({
        where: { dailyPuzzleId: daily.id, userId },
        include: { user: { select: { id: true, email: true, username: true } } },
      });

      if (userCompletion) {
        // Rank = number of players who beat this user + 1
        const rank = await this.prisma.gameCompletion.count({
          where: {
            dailyPuzzleId: daily.id,
            OR: [
              { hintsUsed: { lt: userCompletion.hintsUsed } },
              {
                hintsUsed: userCompletion.hintsUsed,
                elapsedSeconds: { lt: userCompletion.elapsedSeconds },
              },
            ],
          },
        });

        userEntry = {
          rank: rank + 1,
          userId: userCompletion.userId,
          username: (userCompletion.user as any).username ?? userCompletion.user.email?.split('@')[0] ?? `Player_${userCompletion.userId.slice(0, 6)}`,
          elapsedSeconds: userCompletion.elapsedSeconds,
          hintsUsed: userCompletion.hintsUsed,
          completedAt: userCompletion.completedAt.toISOString(),
        };
      }
    }

    return {
      gameType,
      date,
      entries,
      userEntry,
      total,
      hasMore: offset + limit < total,
    };
  }

  async getAllTimeLeaderboard(gameType: GameType, limit = 50, offset = 0) {
    const total = await this.prisma.gameCompletion.groupBy({
      by: ['userId'],
      where: { gameType: gameType as GameType, isDaily: false },
      _count: { id: true },
    }).then(r => r.length);

    const results = await this.prisma.gameCompletion.groupBy({
      by: ['userId'],
      where: { gameType: gameType as GameType, isDaily: false },
      _min: { elapsedSeconds: true },
      _count: { id: true },
      orderBy: { _min: { elapsedSeconds: 'asc' } },
      take: limit,
      skip: offset,
    });

    const userIds = results.map((r) => r.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      entries: results.map((r, index) => ({
        rank: offset + index + 1,
        userId: r.userId,
        username: (userMap.get(r.userId) as any)?.username ?? userMap.get(r.userId)?.email?.split('@')[0] ?? `Player_${r.userId.slice(0, 6)}`,
        bestTime: r._min.elapsedSeconds,
        gamesCompleted: r._count.id,
      })),
      total,
      hasMore: offset + limit < total,
    };
  }

  /** Returns the leaderboard for the current Mon–Sun ISO week (UTC) */
  async getWeeklyLeaderboard(gameType: GameType, limit = 50, offset = 0) {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday
    ));

    const completions = await this.prisma.gameCompletion.findMany({
      where: { gameType: gameType as GameType, isDaily: true, completedAt: { gte: weekStart } },
      orderBy: [{ hintsUsed: 'asc' }, { elapsedSeconds: 'asc' }],
      include: { user: { select: { id: true, email: true, username: true } } },
    });

    // Best completion per user this week
    const bestPerUser = new Map<string, typeof completions[0]>();
    for (const c of completions) {
      const existing = bestPerUser.get(c.userId);
      if (!existing || c.elapsedSeconds < existing.elapsedSeconds || (c.elapsedSeconds === existing.elapsedSeconds && c.hintsUsed < existing.hintsUsed)) {
        bestPerUser.set(c.userId, c);
      }
    }

    const sorted = Array.from(bestPerUser.values())
      .sort((a, b) => a.hintsUsed - b.hintsUsed || a.elapsedSeconds - b.elapsedSeconds);

    const total = sorted.length;
    const paged = sorted.slice(offset, offset + limit);

    return {
      entries: paged.map((c, i) => ({
        rank: offset + i + 1,
        userId: c.userId,
        username: (c.user as any).username ?? c.user.email?.split('@')[0] ?? `Player_${c.userId.slice(0, 6)}`,
        elapsedSeconds: c.elapsedSeconds,
        hintsUsed: c.hintsUsed,
      })),
      total,
      hasMore: offset + limit < total,
    };
  }

  /** Award weekly champion badge — called by cron every Monday midnight UTC */
  async awardWeeklyChampionBadges(): Promise<void> {
    const gameTypes: GameType[] = ['sudoku','queens','zip','tango','nonogram','minesweeper','kakuro','light_up','futoshiki','hitori'] as GameType[];
    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    for (const gt of gameTypes) {
      const result = await this.getWeeklyLeaderboard(gt as GameType, 1, 0);
      if (result.entries.length === 0) continue;
      const winner = result.entries[0];
      await this.prisma.userBadge.upsert({
        where: { userId_badgeType_gameType: { userId: winner.userId, badgeType: 'weekly_champion', gameType: gt } },
        create: { userId: winner.userId, badgeType: 'weekly_champion', gameType: gt, expiresAt: expiry },
        update: { awardedAt: new Date(), expiresAt: expiry },
      });
    }
  }
}
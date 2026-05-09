import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CompleteGameDto, SyncProgressDto } from './progress.dto';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GameType } from '@puzzle-roll/shared';
import { PrismaService } from '../common/prisma/prisma.service';

const STREAK_MILESTONES = new Set([7, 30, 100]);

@Injectable()
export class ProgressService {
  constructor(
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  async completeGame(userId: string, dto: CompleteGameDto) {
    // Verify puzzle exists
    const puzzle = await this.prisma.gamePuzzle.findUnique({ where: { id: dto.puzzleId } });
    if (!puzzle) throw new NotFoundException(`Puzzle ${dto.puzzleId} not found`);

    // Server-side validation for daily completions
    if (dto.isDaily) {
      if (dto.elapsedSeconds < 1) {
        throw new BadRequestException('Elapsed time is not plausible');
      }
      const today = new Date().toISOString().slice(0, 10);
      const submittedDate = dto.completedAt.slice(0, 10);
      if (submittedDate !== today) {
        throw new BadRequestException('Daily puzzle submission date mismatch');
      }
    }

    // Idempotent — if already completed, return existing
    const existing = await this.prisma.gameCompletion.findUnique({
      where: { userId_puzzleId: { userId, puzzleId: dto.puzzleId } },
    });
    if (existing) return existing;

    const completion = await this.prisma.gameCompletion.create({
      data: {
        userId,
        puzzleId: dto.puzzleId,
        dailyPuzzleId: dto.dailyPuzzleId ?? null,
        gameType: dto.gameType as Parameters<typeof this.prisma.gameCompletion.create>[0]['data']['gameType'],
        difficulty: dto.difficulty as Parameters<typeof this.prisma.gameCompletion.create>[0]['data']['difficulty'],
        isDaily: dto.isDaily,
        elapsedSeconds: dto.elapsedSeconds,
        hintsUsed: dto.hintsUsed,
        completedAt: new Date(dto.completedAt),
        shareableResult: dto.shareableResult ?? null,
      },
    });

    // Update user stats and get resulting streak
    const completedDate = dto.completedAt.slice(0, 10);
    const updatedStats = await this.usersService.upsertStats(
      userId,
      dto.gameType,
      dto.elapsedSeconds,
      true,
      dto.isDaily,
      completedDate,
    );

    // Fire streak milestone notifications on daily completions only
    if (dto.isDaily && updatedStats && STREAK_MILESTONES.has(updatedStats.currentStreak)) {
      const pushTokens = await this.prisma.pushToken.findMany({
        where: { userId },
        select: { token: true },
      });
      for (const { token } of pushTokens) {
        await this.notificationsService.enqueueStreakMilestones(
          userId,
          dto.gameType,
          updatedStats.currentStreak,
          token,
        );
      }
    }

    return completion;
  }

  async syncProgress(userId: string, dto: SyncProgressDto) {
    const results = await Promise.allSettled(
      dto.completions.map((completion) => this.completeGame(userId, completion)),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return { succeeded, failed, total: dto.completions.length };
  }

  async getUserProgress(userId: string, requestingUserId: string) {
    if (userId !== requestingUserId) {
      throw new NotFoundException('Progress not found');
    }

    const completions = await this.prisma.gameCompletion.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        puzzleId: true,
        gameType: true,
        difficulty: true,
        isDaily: true,
        elapsedSeconds: true,
        hintsUsed: true,
        completedAt: true,
        shareableResult: true,
      },
    });

    const stats = await this.prisma.userStats.findMany({
      where: { userId },
      orderBy: { gameType: 'asc' },
    });

    return { completions, stats };
  }

  async hasCompletedDaily(userId: string, gameType: GameType, date: string): Promise<boolean> {
    const daily = await this.prisma.dailyPuzzle.findUnique({
      where: { gameType_date: { gameType, date } },
    });
    if (!daily) return false;
    const completion = await this.prisma.gameCompletion.findFirst({
      where: { userId, dailyPuzzleId: daily.id },
    });
    return completion !== null;
  }
}
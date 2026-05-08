import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { GameType } from '@puzzle-roll/shared';
import { UpdateNotificationsDto, UpdateSettingsDto, UpdateUsernameDto } from './users.dto';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true, stats: true },
    });
    if (!user) throw new NotFoundException('User not found');
    // Never expose passwordHash
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async getStats(userId: string) {
    const rows = await this.prisma.userStats.findMany({
      where: { userId },
      orderBy: { gameType: 'asc' },
    });
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return rows.map(row => {
      const streakActive = row.lastPlayedDate === today || row.lastPlayedDate === yesterday;
      return { ...row, currentStreak: streakActive ? row.currentStreak : 0 };
    });
  }

  async updateUsername(userId: string, dto: UpdateUsernameDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('Username is already taken');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { username: dto.username },
      select: { id: true, username: true, email: true, isAnonymous: true },
    });
  }

  async clearStats(userId: string, gameType?: GameType) {
    if (gameType) {
      await this.prisma.userStats.deleteMany({ where: { userId, gameType } });
    } else {
      await this.prisma.userStats.deleteMany({ where: { userId } });
    }
  }

  async updateNotifications(userId: string, dto: UpdateNotificationsDto) {
    const settingsData: Record<string, unknown> = {};
    if (dto.notificationEnabled !== undefined) settingsData['notificationEnabled'] = dto.notificationEnabled;
    if (dto.notificationHour !== undefined) settingsData['notificationHour'] = dto.notificationHour;
    if (dto.timezoneOffsetMinutes !== undefined) settingsData['timezoneOffsetMinutes'] = dto.timezoneOffsetMinutes;
    if (dto.timezone !== undefined) settingsData['timezone'] = dto.timezone;

    if (Object.keys(settingsData).length > 0) {
      await this.prisma.userSettings.upsert({
        where: { userId },
        create: { userId, ...settingsData },
        update: settingsData,
      });
    }

    if (dto.pushToken && dto.platform) {
      await this.prisma.pushToken.upsert({
        where: { token: dto.pushToken },
        create: { userId, token: dto.pushToken, platform: dto.platform },
        update: { userId },
      });
    }

    return this.getMe(userId);
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const settingsData: Record<string, unknown> = {};
    if (dto.soundEnabled !== undefined) settingsData['soundEnabled'] = dto.soundEnabled;
    if (dto.hapticsEnabled !== undefined) settingsData['hapticsEnabled'] = dto.hapticsEnabled;
    if (dto.autoRemoveNotes !== undefined) settingsData['autoRemoveNotes'] = dto.autoRemoveNotes;

    await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...settingsData },
      update: settingsData,
    });

    return this.getMe(userId);
  }

  async upsertStats(
    userId: string,
    gameType: GameType,
    elapsedSeconds: number,
    completed: boolean,
    isDaily: boolean,
    completedDate: string
  ) {
    const existing = await this.prisma.userStats.findUnique({
      where: { userId_gameType: { userId, gameType } },
    });

    const today = completedDate;
    const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);

    let currentStreak = existing?.currentStreak ?? 0;
    let longestStreak = existing?.longestStreak ?? 0;

    // Streak only increments for daily puzzle completions.
    // Day 1 = streak of 1. Consecutive days = streak keeps growing.
    // Missing a day resets to 1 on next daily completion.
    if (completed && isDaily) {
      if (existing?.lastPlayedDate === yesterday) {
        currentStreak += 1; // consecutive day
      } else if (existing?.lastPlayedDate === today) {
        // same-day duplicate — streak unchanged
      } else {
        currentStreak = 1; // missed one or more days — new streak
      }
      longestStreak = Math.max(longestStreak, currentStreak);
    }

    const bestTime =
      completed &&
      (existing?.bestTime === null || existing?.bestTime === undefined || elapsedSeconds < (existing.bestTime ?? Infinity))
        ? elapsedSeconds
        : existing?.bestTime ?? null;

    await this.prisma.userStats.upsert({
      where: { userId_gameType: { userId, gameType } },
      create: {
        userId, gameType,
        gamesPlayed: 1,
        gamesCompleted: completed ? 1 : 0,
        bestTime: completed ? elapsedSeconds : null,
        currentStreak,
        longestStreak,
        lastPlayedDate: today,
      },
      update: {
        gamesPlayed: { increment: 1 },
        gamesCompleted: completed ? { increment: 1 } : undefined,
        bestTime,
        currentStreak,
        longestStreak,
        lastPlayedDate: today,
      },
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { email: null, passwordHash: null, username: null, deviceId: null, deletedAt: new Date() },
      }),
      this.prisma.pushToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
    ]);
  }

}
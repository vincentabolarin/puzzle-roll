import { Injectable, NotFoundException } from '@nestjs/common';
// import { prisma } from '@puzzle-roll/database';
import { GameType } from '@puzzle-roll/shared';
import { UpdateNotificationsDto, UpdateSettingsDto } from './users.dto';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
        stats: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getStats(userId: string) {
    const stats = await this.prisma.userStats.findMany({
      where: { userId },
      orderBy: { gameType: 'asc' },
    });
    return stats;
  }

  async updateNotifications(userId: string, dto: UpdateNotificationsDto) {
    const settingsData: Record<string, unknown> = {};

    if (dto.notificationEnabled !== undefined) settingsData['notificationEnabled'] = dto.notificationEnabled;
    if (dto.notificationHour !== undefined) settingsData['notificationHour'] = dto.notificationHour;
    if (dto.timezoneOffsetMinutes !== undefined) settingsData['timezoneOffsetMinutes'] = dto.timezoneOffsetMinutes;

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
    const gt = gameType;

    const existing = await this.prisma.userStats.findUnique({
      where: { userId_gameType: { userId, gameType: gt } },
    });

    const today = completedDate;
    const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);

    let currentStreak = existing?.currentStreak ?? 0;
    let longestStreak = existing?.longestStreak ?? 0;

    if (completed && isDaily) {
      if (existing?.lastPlayedDate === yesterday) {
        currentStreak += 1;
      } else if (existing?.lastPlayedDate !== today) {
        currentStreak = 1;
      }
      longestStreak = Math.max(longestStreak, currentStreak);
    }

    const bestTime =
      completed && (existing?.bestTime === null || existing?.bestTime === undefined || elapsedSeconds < (existing.bestTime ?? Infinity))
        ? elapsedSeconds
        : existing?.bestTime ?? null;

    await this.prisma.userStats.upsert({
      where: { userId_gameType: { userId, gameType: gt } },
      create: {
        userId,
        gameType: gt,
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
}

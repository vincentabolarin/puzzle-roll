import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { DateTime } from 'luxon';
import { PrismaService } from '../common/prisma/prisma.service';

export const NOTIFICATION_QUEUE = 'notifications';
export const DAILY_PUZZLE_ROTATION_QUEUE = 'daily-puzzle-rotation';

export interface DailyReminderJobData {
  userId: string;
  pushToken: string;
  preferredGame: string | null;
  notificationHour: number;
  timezone: string;
}

export interface StreakNudgeJobData {
  userId: string;
  pushToken: string;
  streakDays: number;
  timezone: string;
}

/**
 * Compute the millisecond delay from now until the next occurrence of
 * `targetHour:00:00` in the user's IANA timezone.
 * Returns null if the target time has already passed today and there is no
 * meaningful delay (caller should skip or schedule for tomorrow).
 */
function msUntilLocalHour(timezone: string, targetHour: number): number {
  const safeZone = isValidTimezone(timezone) ? timezone : 'UTC';
  const now = DateTime.now().setZone(safeZone);
  let target = now.set({ hour: targetHour, minute: 0, second: 0, millisecond: 0 });
  if (target <= now) {
    // Already past today — schedule for the same time tomorrow
    target = target.plus({ days: 1 });
  }
  return target.toMillis() - now.toMillis();
}

function isValidTimezone(tz: string): boolean {
  try {
    DateTime.now().setZone(tz);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notificationQueue: Queue,
    private readonly prisma: PrismaService
  ) {}

  async sendPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
    const chunks = this.expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(chunk);

        for (const ticket of tickets) {
          if (ticket.status === 'error') {
            this.logger.warn(`Push notification error: ${ticket.message}`, ticket.details);
          }
        }
      } catch (err) {
        this.logger.error('Failed to send push notification chunk', err);
      }
    }
  }

  async enqueueDailyReminders(): Promise<void> {
    const users = await this.prisma.userSettings.findMany({
      where: { notificationEnabled: true },
      include: {
        user: {
          include: {
            pushTokens: true,
            stats: { orderBy: { gamesPlayed: 'desc' }, take: 1 },
          },
        },
      },
    });

    for (const settings of users) {
      for (const pushToken of settings.user.pushTokens) {
        if (!Expo.isExpoPushToken(pushToken.token)) continue;

        const preferredGame = settings.user.stats[0]?.gameType ?? null;
        const timezone = settings.timezone ?? 'UTC';
        const delayMs = msUntilLocalHour(timezone, settings.notificationHour);

        await this.notificationQueue.add(
          'daily-reminder',
          {
            userId: settings.userId,
            pushToken: pushToken.token,
            preferredGame,
            notificationHour: settings.notificationHour,
            timezone,
          } satisfies DailyReminderJobData,
          { delay: delayMs, attempts: 2 }
        );
      }
    }

    this.logger.log(`Enqueued daily reminders for ${users.length} users`);
  }

  async enqueueStreakNudges(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    const usersWithStreaks = await this.prisma.userStats.findMany({
      where: { currentStreak: { gte: 3 } },
      include: {
        user: {
          include: {
            pushTokens: true,
            settings: true,
          },
        },
      },
    });

    for (const stat of usersWithStreaks) {
      const settings = stat.user.settings;
      if (!settings?.notificationEnabled) continue;

      const playedToday = await this.prisma.gameCompletion.findFirst({
        where: {
          userId: stat.userId,
          isDaily: true,
          completedAt: { gte: new Date(`${today}T00:00:00.000Z`) },
        },
      });

      if (playedToday) continue;

      for (const pushToken of stat.user.pushTokens) {
        if (!Expo.isExpoPushToken(pushToken.token)) continue;

        const timezone = settings.timezone ?? 'UTC';

        // Schedule nudge for 20:00 in the user's local timezone.
        // If 20:00 has already passed today, skip — it's too late to nudge.
        const safeZone = isValidTimezone(timezone) ? timezone : 'UTC';
        const now = DateTime.now().setZone(safeZone);
        const target = now.set({ hour: 20, minute: 0, second: 0, millisecond: 0 });

        if (target <= now) continue; // already past 20:00 local

        const delayMs = target.toMillis() - now.toMillis();

        await this.notificationQueue.add(
          'streak-nudge',
          {
            userId: stat.userId,
            pushToken: pushToken.token,
            streakDays: stat.currentStreak,
            timezone,
          } satisfies StreakNudgeJobData,
          { delay: delayMs, attempts: 2 }
        );
      }
    }

    this.logger.log('Enqueued streak nudges');
  }

  async enqueueStreakMilestones(userId: string, gameType: string, streak: number, pushToken: string): Promise<void> {
    const milestones = [7, 30, 100];
    if (!milestones.includes(streak)) return;
    if (!Expo.isExpoPushToken(pushToken)) return;

    await this.notificationQueue.add(
      'streak-milestone',
      { userId, pushToken, streakDays: streak, gameType } satisfies { userId: string; pushToken: string; streakDays: number; gameType: string },
      { delay: 0, attempts: 2 }
    );
  }

  async enqueueWeeklyChampionNotification(userId: string, pushToken: string, gameType: string): Promise<void> {
    if (!Expo.isExpoPushToken(pushToken)) return;
    await this.notificationQueue.add(
      'weekly-champion',
      { userId, pushToken, gameType },
      { delay: 0, attempts: 2 }
    );
  }
}
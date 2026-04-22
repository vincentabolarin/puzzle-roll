import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { PrismaService } from '../common/prisma/prisma.service';

export const NOTIFICATION_QUEUE = 'notifications';
export const DAILY_PUZZLE_ROTATION_QUEUE = 'daily-puzzle-rotation';

export interface DailyReminderJobData {
  userId: string;
  pushToken: string;
  preferredGame: string | null;
  notificationHour: number;
  timezoneOffsetMinutes: number;
}

export interface StreakNudgeJobData {
  userId: string;
  pushToken: string;
  streakDays: number;
  timezoneOffsetMinutes: number;
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

        // Log any errors but don't throw — notification failure should never crash the server
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
    // Fetch all opted-in users with push tokens
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

    const now = new Date();

    for (const settings of users) {
      for (const pushToken of settings.user.pushTokens) {
        if (!Expo.isExpoPushToken(pushToken.token)) continue;

        const preferredGame = settings.user.stats[0]?.gameType ?? null;

        // Calculate delay so notification fires at user's preferred local hour
        const targetHour = settings.notificationHour;
        const offsetMs = settings.timezoneOffsetMinutes * 60 * 1000;
        const userLocalNow = new Date(now.getTime() + offsetMs);
        const targetLocal = new Date(userLocalNow);
        targetLocal.setUTCHours(targetHour, 0, 0, 0);

        let delayMs = targetLocal.getTime() - userLocalNow.getTime();
        if (delayMs < 0) delayMs += 86400000; // next day

        await this.notificationQueue.add(
          'daily-reminder',
          {
            userId: settings.userId,
            pushToken: pushToken.token,
            preferredGame,
            notificationHour: targetHour,
            timezoneOffsetMinutes: settings.timezoneOffsetMinutes,
          } satisfies DailyReminderJobData,
          { delay: delayMs, attempts: 2 }
        );
      }
    }

    this.logger.log(`Enqueued daily reminders for ${users.length} users`);
  }

  async enqueueStreakNudges(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    // Find users with active streaks >= 3 who haven't played today
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

      // Check if user has played any daily puzzle today
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

        // Schedule for 20:00 local time
        const now = new Date();
        const offsetMs = (settings.timezoneOffsetMinutes ?? 0) * 60 * 1000;
        const userLocalNow = new Date(now.getTime() + offsetMs);
        const targetLocal = new Date(userLocalNow);
        targetLocal.setUTCHours(20, 0, 0, 0);

        let delayMs = targetLocal.getTime() - userLocalNow.getTime();
        if (delayMs < 0) continue; // already past 20:00 local — don't send

        await this.notificationQueue.add(
          'streak-nudge',
          {
            userId: stat.userId,
            pushToken: pushToken.token,
            streakDays: stat.currentStreak,
            timezoneOffsetMinutes: settings.timezoneOffsetMinutes ?? 0,
          } satisfies StreakNudgeJobData,
          { delay: delayMs, attempts: 2 }
        );
      }
    }

    this.logger.log('Enqueued streak nudges');
  }
}

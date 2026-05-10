import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import {
  NOTIFICATION_QUEUE,
  DailyReminderJobData,
  StreakNudgeJobData,
  NotificationsService,
} from './notifications.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { GameType } from '@puzzle-roll/shared';

const GAME_NAMES: Record<string, string> = {
  sudoku: 'Sudoku',
  queens: 'Queens',
  zip: 'Zip',
  tango: 'Tango',
  nonogram: 'Nonogram',
  minesweeper: 'Minesweeper',
  kakuro: 'Kakuro',
  light_up: 'Light Up',
  futoshiki: 'Futoshiki',
  hitori: 'Hitori',
};

const GAME_TYPES = Object.keys(GAME_NAMES) as GameType[];
const GAME_LIST = Object.keys(GAME_NAMES);

@Processor(NOTIFICATION_QUEUE)
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly expo = new Expo();

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly leaderboardService: LeaderboardService,
    private readonly prisma: PrismaService,
  ) {}

  @Process('daily-reminder')
  async handleDailyReminder(job: Job<DailyReminderJobData>): Promise<void> {
    const { pushToken, preferredGame } = job.data;

    if (!Expo.isExpoPushToken(pushToken)) {
      this.logger.warn(`Invalid push token: ${pushToken}`);
      return;
    }

    const gameKey =
      preferredGame && GAME_NAMES[preferredGame]
        ? preferredGame
        : GAME_LIST[Math.floor(Math.random() * GAME_LIST.length)];

    const gameName = GAME_NAMES[gameKey];

    const message: ExpoPushMessage = {
      to: pushToken,
      title: 'Puzzle Roll',
      body: `🧩 Today's ${gameName} is live — can you top the leaderboard?`,
      data: { screen: 'daily', gameType: gameKey },
      sound: 'default',
      priority: 'normal',
    };

    await this.notificationsService.sendPushNotifications([message]);
    this.logger.debug(`Sent daily reminder to user ${job.data.userId}`);
  }

  @Process('streak-nudge')
  async handleStreakNudge(job: Job<StreakNudgeJobData>): Promise<void> {
    const { pushToken, streakDays } = job.data;

    if (!Expo.isExpoPushToken(pushToken)) {
      this.logger.warn(`Invalid push token: ${pushToken}`);
      return;
    }

    const message: ExpoPushMessage = {
      to: pushToken,
      title: 'Puzzle Roll',
      body: `⚠️ Your ${streakDays}-day streak ends at midnight — play today's puzzle to keep it alive.`,
      data: { screen: 'home' },
      sound: 'default',
      priority: 'high',
    };

    await this.notificationsService.sendPushNotifications([message]);
    this.logger.debug(`Sent streak nudge to user ${job.data.userId}`);
  }

  @Process('streak-milestone')
  async handleStreakMilestone(job: Job<{ userId: string; pushToken: string; streakDays: number; gameType: string }>): Promise<void> {
    const { pushToken, streakDays, gameType } = job.data;
    if (!Expo.isExpoPushToken(pushToken)) return;
    const emoji = streakDays >= 100 ? '🏆' : streakDays >= 30 ? '🥇' : '🔥';
    await this.notificationsService.sendPushNotifications([{
      to: pushToken,
      sound: 'default',
      title: `${emoji} ${streakDays}-day streak!`,
      body: `Incredible! You've kept your ${gameType} streak alive for ${streakDays} days in a row.`,
      data: { screen: 'profile', url: 'puzzleroll://profile' },
    }]);
  }

  @Process('weekly-champion')
  async handleWeeklyChampion(job: Job<{ userId: string; pushToken: string; gameType: string }>): Promise<void> {
    const { pushToken, gameType } = job.data;
    if (!Expo.isExpoPushToken(pushToken)) return;
    await this.notificationsService.sendPushNotifications([{
      to: pushToken,
      sound: 'default',
      title: '🏆 Weekly Champion!',
      body: `You topped this week's ${GAME_NAMES[gameType] ?? gameType} leaderboard. Your champion badge is live!`,
      data: { screen: 'leaderboard', gameType, url: `puzzleroll://leaderboard/${gameType}` },
    }]);
    this.logger.log(`Sent weekly champion notification for ${gameType} to user ${job.data.userId}`);
  }

  /**
   * Fired by the weekly cron (every Monday 00:05 UTC).
   * Awards badges for all 10 game types and enqueues push notifications for winners.
   */
  @Process('award-weekly-champions')
  async handleAwardWeeklyChampions(_job: Job<Record<string, never>>): Promise<void> {
    this.logger.log('Running weekly champion award job');

    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    for (const gt of GAME_TYPES) {
      try {
        const weekly = await this.leaderboardService.getWeeklyLeaderboard(gt, 1);
        if (weekly.entries.length === 0) {
          this.logger.debug(`No completions for ${gt} this week — skipping`);
          continue;
        }

        const winner = weekly.entries[0];

        // Upsert the badge
        await this.prisma.userBadge.upsert({
          where: { userId_badgeType_gameType: { userId: winner.userId, badgeType: 'weekly_champion', gameType: gt } },
          create: { userId: winner.userId, badgeType: 'weekly_champion', gameType: gt, expiresAt: expiry },
          update: { awardedAt: new Date(), expiresAt: expiry },
        });

        this.logger.log(`Awarded weekly_champion badge for ${gt} to user ${winner.userId}`);

        // Notify the winner if they have a push token
        const pushTokens = await this.prisma.pushToken.findMany({
          where: { userId: winner.userId },
          select: { token: true },
        });

        for (const { token } of pushTokens) {
          await this.notificationsService.enqueueWeeklyChampionNotification(
            winner.userId,
            token,
            gt,
          );
        }
      } catch (err) {
        // Don't let one game type failure abort the rest
        this.logger.error(`Failed to award weekly champion for ${gt}`, err);
      }
    }

    this.logger.log('Weekly champion award job complete');
  }
}
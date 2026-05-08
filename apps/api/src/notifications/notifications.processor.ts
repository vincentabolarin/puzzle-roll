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

const GAME_LIST = Object.keys(GAME_NAMES);

@Processor(NOTIFICATION_QUEUE)
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly expo = new Expo();

  constructor(private readonly notificationsService: NotificationsService) {}

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
      body: `You topped this week's ${gameType} leaderboard. Your champion badge is live!`,
      data: { screen: 'leaderboard', gameType, url: `puzzleroll://leaderboard/${gameType}` },
    }]);
  }

}
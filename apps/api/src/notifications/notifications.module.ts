import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NotificationsService, NOTIFICATION_QUEUE, DAILY_PUZZLE_ROTATION_QUEUE } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { DailyPuzzleProcessor } from './daily-puzzle.processor';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: NOTIFICATION_QUEUE },
      { name: DAILY_PUZZLE_ROTATION_QUEUE },
    ),
    LeaderboardModule,
  ],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    DailyPuzzleProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule implements OnModuleInit {
  private readonly logger = new Logger(NotificationsModule.name);

  constructor(
    @InjectQueue(DAILY_PUZZLE_ROTATION_QUEUE)
    private readonly rotationQueue: Queue,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // ── Daily puzzle rotation — midnight UTC every day ──────────────────────
    const rotationJobs = await this.rotationQueue.getRepeatableJobs();
    for (const job of rotationJobs) {
      await this.rotationQueue.removeRepeatableByKey(job.key);
    }
    await this.rotationQueue.add(
      'rotate-daily',
      {},
      {
        repeat: { cron: '0 0 * * *', tz: 'UTC' },
        attempts: 3,
        backoff: { type: 'fixed', delay: 60000 },
      },
    );
    this.logger.log('Daily rotation cron scheduled at midnight UTC');

    // ── Weekly champion awards — every Monday at 00:05 UTC ─────────────────
    // 5-minute offset from midnight so the new week's leaderboard is clean
    // before we read last week's final standings.
    const notifRepeatableJobs = await this.notificationQueue.getRepeatableJobs();
    for (const job of notifRepeatableJobs) {
      if (job.name === 'award-weekly-champions') {
        await this.notificationQueue.removeRepeatableByKey(job.key);
      }
    }
    await this.notificationQueue.add(
      'award-weekly-champions',
      {},
      {
        repeat: { cron: '5 0 * * 1', tz: 'UTC' }, // 00:05 every Monday
        attempts: 3,
        backoff: { type: 'fixed', delay: 120000 },
      },
    );
    this.logger.log('Weekly champion cron scheduled for Mondays at 00:05 UTC');
  }
}
import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NotificationsService, NOTIFICATION_QUEUE, DAILY_PUZZLE_ROTATION_QUEUE } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { DailyPuzzleProcessor } from './daily-puzzle.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: NOTIFICATION_QUEUE },
      { name: DAILY_PUZZLE_ROTATION_QUEUE }
    ),
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
    private readonly rotationQueue: Queue
  ) {}

  async onModuleInit(): Promise<void> {
    // Schedule the daily rotation job at midnight UTC every day
    // Remove any existing repeatable job first to avoid duplicates on restart
    const repeatableJobs = await this.rotationQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.rotationQueue.removeRepeatableByKey(job.key);
    }

    await this.rotationQueue.add(
      'rotate-daily',
      {},
      {
        repeat: { cron: '0 0 * * *', tz: 'UTC' },
        attempts: 3,
        backoff: { type: 'fixed', delay: 60000 },
      }
    );

    this.logger.log('Daily rotation cron job scheduled at midnight UTC');
  }
}

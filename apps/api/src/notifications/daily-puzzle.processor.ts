import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DAILY_PUZZLE_ROTATION_QUEUE, NotificationsService } from './notifications.service';

@Processor(DAILY_PUZZLE_ROTATION_QUEUE)
export class DailyPuzzleProcessor {
  private readonly logger = new Logger(DailyPuzzleProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Process('rotate-daily')
  async handleDailyRotation(_job: Job): Promise<void> {
    this.logger.log('Running daily puzzle rotation and notification enqueueing...');

    try {
      // Daily puzzles are pre-seeded for 365 days — no rotation logic needed here.
      // This job triggers notification enqueueing at midnight UTC.
      await this.notificationsService.enqueueDailyReminders();
      await this.notificationsService.enqueueStreakNudges();
      this.logger.log('Daily rotation complete — notifications enqueued');
    } catch (err) {
      this.logger.error('Daily rotation failed', err);
      throw err; // Re-throw so Bull marks job as failed and retries
    }
  }
}

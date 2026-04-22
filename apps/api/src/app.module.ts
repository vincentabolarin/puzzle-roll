import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PuzzlesModule } from './puzzles/puzzles.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { ProgressModule } from './progress/progress.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 200,
      },
    ]),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      }),
      inject: [ConfigService],
    }),

    TerminusModule,

    AuthModule,
    UsersModule,
    PuzzlesModule,
    LeaderboardModule,
    ProgressModule,
    NotificationsModule,
    AdminModule,
    PrismaModule
  ],
  controllers: [HealthController],
})
export class AppModule {}

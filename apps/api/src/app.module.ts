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
      validate(config: Record<string, unknown>) {
        const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'JWT_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN', 'PORT', 'NODE_ENV'];
        const missing = required.filter((k) => !config[k]);
        if (missing.length > 0) {
          throw new Error(
            `Missing required environment variables: ${missing.join(', ')}.\n` +
            `Check your .env file or Dokploy environment settings.`
          );
        }
        if ((config['JWT_SECRET'] as string)?.length < 32) {
          throw new Error('JWT_SECRET must be at least 32 characters long.');
        }
        if ((config['JWT_REFRESH_SECRET'] as string)?.length < 32) {
          throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long.');
        }
        return {
          ...config,
          PORT: parseInt(config['PORT'] as string, 10) || 3000,
          DB_POOL_MAX: parseInt(config['DB_POOL_MAX'] as string, 10) || 10,
          JWT_EXPIRES_IN: config['JWT_EXPIRES_IN'] || '15m',
          JWT_REFRESH_EXPIRES_IN: config['JWT_REFRESH_EXPIRES_IN'] || '7d',
          REDIS_URL: config['REDIS_URL'] || 'redis://localhost:6379',
          NODE_ENV: config['NODE_ENV'] || 'development',
        };
      },
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
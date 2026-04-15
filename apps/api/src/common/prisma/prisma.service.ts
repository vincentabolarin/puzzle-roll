import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '@puzzle-roll/database/prisma/generated/client';
import type { SqlDriverAdapterFactory } from '@prisma/client/runtime/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Check your .env file.');
    }

    // Explicit pool configuration.
    //
    // max: maximum connections held open. Match this to your Postgres host's
    //   connection limit — typically ~80% of the plan ceiling. For example:
    //   - Supabase free: 60 → use 50
    //   - Railway hobby: 25 → use 20
    //   - RDS t3.micro: 83 → use 70
    //   Default here is 10, which is safe for any hosted plan.
    //
    // idleTimeoutMillis: how long (ms) a connection can sit idle before being
    //   closed and removed from the pool. 30 s is a reasonable default.
    //
    // connectionTimeoutMillis: how long (ms) to wait for a free connection
    //   before throwing "Connection timeout". 20 s prevents indefinite queueing
    //   during traffic spikes.
    const pool = new Pool({
      connectionString,
      max: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 20_000,
    });

    const adapter: SqlDriverAdapterFactory = new PrismaPg(pool);

    super({
      adapter,
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'info', 'warn', 'error'],
    });

    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to PostgreSQL via Prisma.');
    } catch (error) {
      this.logger.error('Failed to connect to database. Check DATABASE_URL in .env.', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Disconnected from PostgreSQL.');
  }

  /**
   * Registers SIGINT/SIGTERM handlers for clean shutdown in Docker/Dokploy.
   * Call once from main.ts after app is created.
   */
  enableShutdownHooks(): void {
    const shutdown = (signal: string): void => {
      this.logger.log(`Received ${signal}. Shutting down Prisma...`);
      this.$disconnect()
        .then(() => {
          this.logger.log('Prisma disconnected cleanly.');
          process.exit(0);
        })
        .catch((error) => {
          this.logger.error('Error during Prisma shutdown', error);
          process.exit(1);
        });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

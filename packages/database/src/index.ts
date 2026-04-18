import { SqlDriverAdapterFactory } from '@prisma/client/runtime/client';
import { PrismaClient } from '../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// DATABASE_URL is now available in process.env
// const connectionString = process.env.DATABASE_URL;

// if (!connectionString) {
//   throw new Error(
//     '[prisma.config.ts] DATABASE_URL is not set. ' +
//     'Ensure a .env file exists at the specified path with DATABASE_URL defined.'
//   );
// }

// const adapter: SqlDriverAdapterFactory = new PrismaPg({ connectionString });

// function createPrismaClient(): PrismaClient {
//   return new PrismaClient({ adapter });
// }

// In production, always create a new client
// In development, reuse the global instance to avoid too many connections during hot reload

// export const prisma: PrismaClient =
//   process.env.NODE_ENV === 'production'
//     ? createPrismaClient()
//     : (global.__prisma ?? (global.__prisma = createPrismaClient()));

export * from '../prisma/generated/client';

import path from 'path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load the root .env before anything else.
dotenv.config({ path: path.resolve(__dirname, './.env') });

// DATABASE_URL is now available in process.env
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    '[prisma.config.ts] DATABASE_URL is not set. ' +
    'Ensure a .env file exists at the specified path with DATABASE_URL defined.'
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let dbCredentials:
  | { url: string }
  | { host: string; user: string; password: string; database: string; ssl: boolean };

if (connectionString) {
  dbCredentials = { url: connectionString };
} else {
  const sqlHost = process.env.SQL_HOST;
  const sqlDbName = process.env.SQL_DB_NAME;
  const user = process.env.SQL_ADMIN_USER;
  const password = process.env.SQL_ADMIN_PASSWORD;

  if (!sqlHost) {
    throw new Error('SQL_HOST (or DATABASE_URL) must be set in environment variables.');
  }
  if (!sqlDbName) {
    throw new Error('SQL_DB_NAME (or DATABASE_URL) must be set in environment variables.');
  }
  if (!user) {
    throw new Error('SQL_ADMIN_USER (or DATABASE_URL) must be set in environment variables.');
  }
  if (!password) {
    throw new Error('SQL_ADMIN_PASSWORD (or DATABASE_URL) must be set in environment variables.');
  }

  dbCredentials = {
    host: sqlHost,
    user,
    password,
    database: sqlDbName,
    ssl: process.env.SQL_SSL === 'true',
  };
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials,
  verbose: true,
});

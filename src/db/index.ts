import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';
import { createMockDb } from './mockDb.ts';
import { createSupabaseDb } from './supabaseDb.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

const supabaseUrl = (
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''
).trim();
const supabaseKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const hasSqlVars = Boolean(
  process.env.SQL_HOST &&
    process.env.SQL_USER &&
    process.env.SQL_PASSWORD &&
    process.env.SQL_DB_NAME
);

const hasDatabaseConfig = Boolean(connectionString || hasSqlVars);

export const createPool = () => {
  if (!hasDatabaseConfig) return undefined;
  if (!global._postgresPool) {
    const useSsl =
      process.env.SQL_SSL === 'true' ||
      (Boolean(connectionString) && process.env.SQL_SSL !== 'false');

    global._postgresPool = connectionString
      ? new Pool({
          connectionString,
          ssl: useSsl ? { rejectUnauthorized: false } : undefined,
          max: process.env.VERCEL ? 5 : 10,
          connectionTimeoutMillis: 15000,
        })
      : new Pool({
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
          max: process.env.VERCEL ? 5 : 10,
          connectionTimeoutMillis: 15000,
        });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

let db: ReturnType<typeof drizzle<typeof schema>>;

if (supabaseUrl && supabaseKey) {
  console.log('[DB] Using Supabase HTTPS client');
  db = createSupabaseDb(supabaseUrl, supabaseKey);
} else {
  const pool = createPool();
  if (pool) {
    db = drizzle(pool, { schema });
  } else {
    console.warn('[AI Studio] Database not configured — using in-memory store with seeded data');
    db = createMockDb();
  }
}

export { db };

import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '@/lib/env';


declare global {
  // eslint-disable-next-line no-var
  var __kycPgPool: Pool | undefined;
}

function getConnectionString() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }
  return env.DATABASE_URL;
}

export function isPostgresConfigured() {
  return Boolean(env.DATABASE_URL);
}

export function getPgPool() {
  if (!isPostgresConfigured()) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!global.__kycPgPool) {
    global.__kycPgPool = new Pool({
      connectionString: getConnectionString(),
      max: 10,
      ssl: false,
    });
  }

  return global.__kycPgPool;
}

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getPgPool().query<T>(text, values);
}

export async function withPgTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

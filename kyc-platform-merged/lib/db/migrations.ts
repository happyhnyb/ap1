import fs from 'node:fs/promises';
import path from 'node:path';
import { withPgTransaction } from '@/lib/db/pg';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

export async function ensureMigrationTable() {
  await withPgTransaction(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  });
}

export async function runMigrations() {
  await ensureMigrationTable();
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
  const applied = await withPgTransaction(async (client) => {
    const result = await client.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    return new Set(result.rows.map((row) => row.filename));
  });

  const executed: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await withPgTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    });
    executed.push(file);
  }

  return executed;
}

import { runMigrations } from '@/lib/db/migrations';

async function main() {
  const executed = await runMigrations();
  if (!executed.length) {
    console.log('No pending PostgreSQL migrations.');
    return;
  }

  console.log('Applied migrations:');
  for (const file of executed) {
    console.log(`- ${file}`);
  }
}

main().catch((error) => {
  console.error('db:migrate failed:', error);
  process.exit(1);
});

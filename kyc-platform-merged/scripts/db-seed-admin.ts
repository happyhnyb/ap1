import { ensureRoleSeeds, getUserByEmail, createUser } from '@/lib/db/repositories/users';

async function main() {
  const name = process.env.ADMIN_NAME?.trim() || 'KYC Admin';
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before running db:seed-admin.');
  }

  await ensureRoleSeeds();

  const existing = await getUserByEmail(email);
  if (existing) {
    console.log(`Admin seed skipped: user already exists for ${email}`);
    return;
  }

  const user = await createUser({ name, email, password, role: 'admin' });
  console.log(`Created admin user ${user.email} (${user._id})`);
}

main().catch((error) => {
  console.error('db:seed-admin failed:', error);
  process.exit(1);
});

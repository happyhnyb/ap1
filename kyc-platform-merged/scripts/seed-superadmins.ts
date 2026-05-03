#!/usr/bin/env tsx
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '@/lib/env';
import { ensureRoleSeeds, upsertUserWithPassword } from '@/lib/db/repositories/users';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PASSWORD = 'Hnyb@2012';
const USERS = [
  { name: 'Deepak', email: 'deepak@hnyb.in', role: 'admin' as const },
  { name: 'Niraj', email: 'niraj@hnyb.in', role: 'admin' as const },
];

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, lowercase: true, unique: true },
  password_hash: String,
  auth_methods: [String],
  role: String,
  mobile: { type: String, default: null },
  subscription: {
    status: String,
    plan: String,
    started_at: Date,
    expires_at: Date,
    payment_ref: { type: String, default: null },
  },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

async function seedPostgresUsers() {
  await ensureRoleSeeds();
  for (const user of USERS) {
    const saved = await upsertUserWithPassword({
      ...user,
      password: PASSWORD,
    });
    console.log(`Upserted ${saved.email} as ${saved.role}`);
  }
}

async function seedMongoUsers() {
  if (!env.MONGODB_URI) {
    throw new Error('Neither DATABASE_URL nor MONGODB_URI is configured.');
  }

  const User = mongoose.models.User || mongoose.model('User', UserSchema);
  await mongoose.connect(env.MONGODB_URI);

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    for (const user of USERS) {
      await User.findOneAndUpdate(
        { email: user.email.toLowerCase() },
        {
          $set: {
            name: user.name,
            email: user.email.toLowerCase(),
            password_hash: passwordHash,
            role: user.role,
            updated_at: new Date(),
          },
          $setOnInsert: {
            mobile: null,
            subscription: { status: 'none', plan: 'free', started_at: null, expires_at: null, payment_ref: null },
          },
          $addToSet: { auth_methods: 'email' },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`Upserted ${user.email} as ${user.role}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  if (env.DATABASE_URL) {
    await seedPostgresUsers();
    return;
  }
  await seedMongoUsers();
}

main().catch((error) => {
  console.error('seed-superadmins failed:', error);
  process.exit(1);
});

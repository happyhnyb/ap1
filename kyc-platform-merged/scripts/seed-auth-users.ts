#!/usr/bin/env tsx
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

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

const User = mongoose.models.User || mongoose.model('User', UserSchema);

const monthsFromNow = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date;
};

const USERS = [
  {
    name: 'Dhairya Pareek',
    email: 'admin@kyc.news',
    password: 'admin123',
    auth_methods: ['email', 'google'],
    role: 'admin',
    mobile: '+919876543210',
    subscription: { status: 'active', plan: 'annual', started_at: new Date(), expires_at: monthsFromNow(12) },
  },
  {
    name: 'Deepak Pareek',
    email: 'editor@kyc.news',
    password: 'editor123',
    auth_methods: ['email'],
    role: 'editor',
    mobile: '+919876543211',
    subscription: { status: 'active', plan: 'annual', started_at: new Date(), expires_at: monthsFromNow(12) },
  },
  {
    name: 'Niraj Shah',
    email: 'niraj@kyc.news',
    password: 'editor123',
    auth_methods: ['email', 'google'],
    role: 'editor',
    mobile: '+919876543212',
    subscription: { status: 'active', plan: 'annual', started_at: new Date(), expires_at: monthsFromNow(12) },
  },
  {
    name: 'Demo Reader',
    email: 'reader@kyc.news',
    password: 'reader123',
    auth_methods: ['email'],
    role: 'premium',
    mobile: null,
    subscription: { status: 'active', plan: 'monthly', started_at: new Date(), expires_at: monthsFromNow(1) },
  },
  {
    name: 'Free User',
    email: 'free@kyc.news',
    password: 'free123',
    auth_methods: ['email'],
    role: 'reader',
    mobile: null,
    subscription: { status: 'none', plan: 'free', started_at: null, expires_at: null },
  },
];

async function main() {
  await mongoose.connect(MONGODB_URI as string);
  console.log('Connected to MongoDB');

  for (const user of USERS) {
    const password_hash = await bcrypt.hash(user.password, 12);
    await User.findOneAndUpdate(
      { email: user.email.toLowerCase() },
      {
        $set: {
          name: user.name,
          email: user.email.toLowerCase(),
          password_hash,
          auth_methods: user.auth_methods,
          role: user.role,
          mobile: user.mobile,
          subscription: user.subscription,
        },
      },
      { upsert: true, new: true },
    );
    console.log(`Upserted ${user.email}`);
  }

  await mongoose.disconnect();
  console.log('Done');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

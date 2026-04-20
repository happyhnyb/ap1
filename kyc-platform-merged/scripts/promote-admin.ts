import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;
const EMAIL = process.env.PROMOTE_EMAIL!;

async function main() {
  await mongoose.connect(MONGODB_URI);
  const result = await mongoose.connection.collection('users').updateOne(
    { email: EMAIL },
    { $set: {
      role: 'admin',
      'subscription.status': 'active',
      'subscription.plan': 'annual',
      'subscription.expires_at': new Date('2027-12-31'),
    }}
  );
  console.log(result.matchedCount ? `✓ ${EMAIL} promoted to admin` : `✗ ${EMAIL} not found`);
  await mongoose.disconnect();
}

main().catch(console.error);

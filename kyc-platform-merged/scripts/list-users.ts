import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;

async function main() {
  await mongoose.connect(MONGODB_URI);
  const users = await mongoose.connection.collection('users')
    .find({}, { projection: { email: 1, role: 1, name: 1, _id: 0 } })
    .toArray();
  console.log(JSON.stringify(users, null, 2));
  await mongoose.disconnect();
}

main().catch(console.error);

import 'dotenv/config';
import mongoose from 'mongoose';
import { loadConfig } from '../src/config';
import { hashPassword } from '../src/lib/crypto';
import { User } from '../src/models';

async function main() {
  const config = loadConfig();
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars) in .env first');
  await mongoose.connect(config.MONGODB_URI);
  await User.updateOne(
    { email: config.ADMIN_EMAIL.toLowerCase() },
    { $set: { passwordHash: await hashPassword(config.ADMIN_PASSWORD), role: 'admin', failedLogins: 0 }, $unset: { deletedAt: 1, lockedUntil: 1 } },
    { upsert: true }
  );
  console.log(`admin ready: ${config.ADMIN_EMAIL}`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });

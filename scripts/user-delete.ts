// npm run user:delete -- someone@example.com   (soft delete now, hard delete by the retention job after 30 days)
import 'dotenv/config';
import mongoose from 'mongoose';
import { loadConfig } from '../src/config';
import { AuditLog, RefreshToken, User } from '../src/models';

async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) throw new Error('Usage: npm run user:delete -- <email>');
  const config = loadConfig();
  await mongoose.connect(config.MONGODB_URI);
  const user = await User.findOneAndUpdate({ email, deletedAt: null }, { $set: { deletedAt: new Date() } });
  if (!user) throw new Error(`No active user ${email}`);
  await RefreshToken.updateMany({ userId: user._id }, { $set: { revokedAt: new Date() } });
  await AuditLog.create({ action: 'user.deleted', target: String(user._id), meta: { via: 'cli' } });
  console.log(`soft-deleted ${email}; sessions revoked`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });

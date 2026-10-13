import type { Config } from '../config';
import { AgentRun, AuditLog, User } from '../models';

const day = 86_400_000;

/** Data retention. Policy lives in docs/DATA_POLICY.md; keep both in sync. */
export async function runRetention(config: Config, now = Date.now()): Promise<string> {
  const runs = await AgentRun.deleteMany({ createdAt: { $lt: new Date(now - config.RUN_RETENTION_DAYS * day) } });
  const audits = await AuditLog.deleteMany({ at: { $lt: new Date(now - config.AUDIT_RETENTION_DAYS * day) } });
  const users = await User.deleteMany({ deletedAt: { $lt: new Date(now - 30 * day) } });
  return `runs=${runs.deletedCount} audit=${audits.deletedCount} users=${users.deletedCount}`;
}

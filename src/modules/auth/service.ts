import type { Response } from 'express';
import { Types } from 'mongoose';
import type { Config } from '../../config';
import { isSecureEnv } from '../../config';
import { HttpError, unauthorized } from '../../http/errors';
import type { AuthUser, Role } from '../../http/types';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../lib/crypto';
import { RefreshToken, User } from '../../models';
import { signAccessToken } from './tokens';

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;
let dummyHash: Promise<string> | undefined;

export const toAuthUser = (u: { _id: unknown; email: string; role?: string | null }): AuthUser => ({ id: String(u._id), email: u.email, role: (u.role ?? 'member') as Role });

export async function createUser(email: string, password: string, role: Role, name?: string) {
  return User.create({ email, passwordHash: await hashPassword(password), role, ...(name ? { name } : {}) });
}

async function issueRefresh(config: Config, userId: string, familyId: string) {
  const raw = randomToken(48);
  await RefreshToken.create({
    userId: new Types.ObjectId(userId),
    familyId,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + config.REFRESH_TTL_DAYS * 86_400_000)
  });
  return raw;
}

export async function login(config: Config, email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null });
  dummyHash ??= hashPassword('not-a-real-password');
  if (!user) {
    await verifyPassword(password, await dummyHash); // keep timing similar for unknown users
    throw unauthorized('Invalid email or password', 'invalid_credentials');
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new HttpError(429, 'account_locked', 'Too many failed attempts. Try again later.');
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = (user.failedLogins ?? 0) + 1;
    await User.updateOne({ _id: user._id }, failed >= MAX_FAILED ? { $set: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } } : { $set: { failedLogins: failed } });
    throw unauthorized('Invalid email or password', 'invalid_credentials');
  }
  await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0 }, $unset: { lockedUntil: 1 } });
  const authUser = toAuthUser(user);
  const refresh = await issueRefresh(config, authUser.id, randomToken(12));
  return { user: authUser, name: user.name ?? null, access: await signAccessToken(config, authUser), refresh };
}

export async function rotateRefresh(config: Config, rawToken: string | undefined) {
  if (!rawToken) throw unauthorized('Session expired', 'session_expired');
  const tokenHash = sha256(rawToken);
  const record = await RefreshToken.findOne({ tokenHash });
  if (!record || record.expiresAt.getTime() < Date.now() || record.revokedAt) throw unauthorized('Session expired', 'session_expired');
  if (record.usedAt) {
    // Reuse of a rotated token means it may be stolen: kill the whole family.
    await RefreshToken.updateMany({ familyId: record.familyId }, { $set: { revokedAt: new Date() } });
    throw unauthorized('Session expired', 'session_reuse_detected');
  }
  const claimed = await RefreshToken.findOneAndUpdate({ _id: record._id, usedAt: null }, { $set: { usedAt: new Date() } });
  if (!claimed) throw unauthorized('Session expired', 'session_expired');
  const user = await User.findOne({ _id: record.userId, deletedAt: null });
  if (!user) throw unauthorized('Session expired', 'session_expired');
  const authUser = toAuthUser(user);
  return { user: authUser, name: user.name ?? null, access: await signAccessToken(config, authUser), refresh: await issueRefresh(config, authUser.id, record.familyId) };
}

export async function revokeFamily(rawToken: string | undefined) {
  if (!rawToken) return;
  const record = await RefreshToken.findOne({ tokenHash: sha256(rawToken) });
  if (record) await RefreshToken.updateMany({ familyId: record.familyId }, { $set: { revokedAt: new Date() } });
}

export function setSessionCookies(res: Response, config: Config, access: string, refresh: string) {
  const secure = isSecureEnv(config) || config.COOKIE_SAMESITE === 'none';
  const base = { secure, sameSite: config.COOKIE_SAMESITE, ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}) } as const;
  const refreshMs = config.REFRESH_TTL_DAYS * 86_400_000;
  res.cookie('access_token', access, { ...base, httpOnly: true, path: '/', maxAge: config.ACCESS_TTL_MIN * 60_000 });
  res.cookie('refresh_token', refresh, { ...base, httpOnly: true, path: '/api/v1/auth', maxAge: refreshMs });
  res.cookie('csrf_token', randomToken(24), { ...base, httpOnly: false, path: '/', maxAge: refreshMs });
}

export function clearSessionCookies(res: Response, config: Config) {
  const base = { ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}) };
  res.clearCookie('access_token', { ...base, path: '/' });
  res.clearCookie('refresh_token', { ...base, path: '/api/v1/auth' });
  res.clearCookie('csrf_token', { ...base, path: '/' });
}

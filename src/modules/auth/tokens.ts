import { SignJWT, jwtVerify } from 'jose';
import type { Config } from '../../config';
import type { AuthUser, Role } from '../../http/types';

const ISSUER = 'fde-api';
const key = (c: Config) => new TextEncoder().encode(c.JWT_SECRET);

export async function signAccessToken(c: Config, user: AuthUser): Promise<string> {
  return new SignJWT({ role: user.role, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${Math.round(c.ACCESS_TTL_MIN * 60)}s`)
    .sign(key(c));
}

export async function verifyAccessToken(c: Config, token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, key(c), { issuer: ISSUER, algorithms: ['HS256'] });
    if (!payload.sub || typeof payload['email'] !== 'string' || typeof payload['role'] !== 'string') return null;
    return { id: payload.sub, email: payload['email'], role: payload['role'] as Role };
  } catch {
    return null;
  }
}

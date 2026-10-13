import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { addUser, setup, signIn } from './helpers';

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
  await addUser('member@example.com', 'member');
  await addUser('admin@example.com', 'admin');
  await addUser('locked@example.com', 'member');
});
afterAll(() => t.close());

describe('auth', () => {
  it('login sets httpOnly session cookies and a readable csrf cookie', async () => {
    const { res, setCookie } = await signIn(t.app, 'member@example.com');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'member@example.com', role: 'member' });
    const joined = (setCookie ?? []).join('\n');
    expect(joined).toMatch(/access_token=[^;]+;.*HttpOnly/);
    expect(joined).toMatch(/refresh_token=[^;]+;.*Path=\/api\/v1\/auth;.*HttpOnly/);
    expect(setCookie?.find((c) => c.startsWith('csrf_token='))).not.toMatch(/HttpOnly/);
  });

  it('me works with the session and 401s without it', async () => {
    const { agent } = await signIn(t.app, 'member@example.com');
    expect((await agent.get('/api/v1/auth/me')).body.user.email).toBe('member@example.com');
    const anon = await request(t.app).get('/api/v1/auth/me');
    expect(anon.status).toBe(401);
    expect(anon.body.error).toMatchObject({ code: 'unauthorized' });
    expect(anon.body.error.requestId).toBeTruthy();
  });

  it('rejects bad credentials without revealing which part was wrong', async () => {
    const wrongPw = await request(t.app).post('/api/v1/auth/login').send({ email: 'member@example.com', password: 'nope-nope-nope' });
    const unknown = await request(t.app).post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope-nope' });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks the account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) await request(t.app).post('/api/v1/auth/login').send({ email: 'locked@example.com', password: 'wrong-wrong-wrong' });
    const res = await request(t.app).post('/api/v1/auth/login').send({ email: 'locked@example.com', password: 'correct-horse-battery' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('account_locked');
  });

  it('logout requires the CSRF header and ends the session', async () => {
    const { agent, csrf } = await signIn(t.app, 'member@example.com');
    expect((await agent.post('/api/v1/auth/logout')).status).toBe(403);
    expect((await agent.post('/api/v1/auth/logout').set('x-csrf-token', csrf)).status).toBe(204);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('rotates refresh tokens and kills the family when an old one is reused', async () => {
    const first = await signIn(t.app, 'member@example.com');
    const rotated = await first.agent.post('/api/v1/auth/refresh').set('x-csrf-token', first.csrf);
    expect(rotated.status).toBe(200);
    const newRefresh = (rotated.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='))!.split(';')[0]!;

    const replay = await request(t.app).post('/api/v1/auth/refresh').set('Cookie', [`refresh_token=${first.refresh}`, `csrf_token=${first.csrf}`]).set('x-csrf-token', first.csrf);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('session_reuse_detected');

    const afterRevoke = await request(t.app).post('/api/v1/auth/refresh').set('Cookie', [newRefresh, `csrf_token=${first.csrf}`]).set('x-csrf-token', first.csrf);
    expect(afterRevoke.status).toBe(401);
  });

  it('enforces roles', async () => {
    const member = await signIn(t.app, 'member@example.com');
    expect((await member.agent.get('/api/v1/admin/metrics')).status).toBe(403);
    const admin = await signIn(t.app, 'admin@example.com');
    const ok = await admin.agent.get('/api/v1/admin/metrics');
    expect(ok.status).toBe(200);
    expect(ok.body.requests.total).toBeGreaterThan(0);
  });

  it('blocks cookie-authenticated writes without a CSRF token', async () => {
    const { agent } = await signIn(t.app, 'member@example.com');
    const res = await agent.post('/api/v1/agents/triage/run').set('Idempotency-Key', 'k-csrf-1').send({ input: 'VPN is down for everyone' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf_failed');
  });
});

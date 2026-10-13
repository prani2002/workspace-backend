import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AgentRun, AuditLog } from '../src/models';
import { runRetention } from '../src/jobs/retention';
import { addUser, setup, signIn } from './helpers';

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  t = await setup();
  await addUser('admin@example.com', 'admin');
  await addUser('member@example.com', 'member');
});
afterAll(() => t.close());

describe('platform basics', () => {
  it('health, ready and the OpenAPI document are served', async () => {
    expect((await request(t.app).get('/health')).body).toEqual({ ok: true });
    expect((await request(t.app).get('/ready')).body.ready).toBe(true);
    const spec = await request(t.app).get('/openapi.yaml');
    expect(spec.status).toBe(200);
    expect(spec.text).toContain('openapi: 3.0.3');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(t.app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['strict-transport-security']).toBeTruthy();
  });

  it('returns JSON errors with request ids for 404 and bad JSON', async () => {
    const nf = await request(t.app).get('/api/v1/nope').set('x-request-id', 'req-12345678');
    expect(nf.status).toBe(404);
    expect(nf.body.error).toMatchObject({ code: 'not_found', requestId: 'req-12345678' });
    const bad = await request(t.app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_json');
  });

  it('maintenance mode blocks app routes but keeps health, auth and admin reachable', async () => {
    const admin = await signIn(t.app, 'admin@example.com');
    const member = await signIn(t.app, 'member@example.com');
    expect((await admin.agent.put('/api/v1/admin/maintenance').set('x-csrf-token', admin.csrf).send({ enabled: true })).status).toBe(200);
    const blocked = await member.agent.get('/api/v1/agents/runs');
    expect(blocked.status).toBe(503);
    expect(blocked.body.error.code).toBe('maintenance');
    expect(blocked.headers['retry-after']).toBe('120');
    expect((await request(t.app).get('/health')).status).toBe(200);
    expect((await member.agent.get('/api/v1/auth/me')).status).toBe(200);
    expect((await request(t.app).get('/api/v1/system/status')).body).toEqual({ ok: true, maintenance: true });
    await admin.agent.put('/api/v1/admin/maintenance').set('x-csrf-token', admin.csrf).send({ enabled: false });
    expect((await member.agent.get('/api/v1/agents/runs')).status).toBe(200);
  });

  it('writes audit entries that admins can read', async () => {
    const admin = await signIn(t.app, 'admin@example.com');
    const res = await admin.agent.get('/api/v1/admin/audit?limit=20');
    expect(res.status).toBe(200);
    expect(res.body.items.some((i: { action: string }) => i.action === 'auth.login')).toBe(true);
  });

  it('retention deletes only data past its window', async () => {
    const old = new Date(Date.now() - 200 * 86_400_000);
    await AgentRun.create({ userId: 'u', agent: 'triage', input: 'old run text', status: 'ok', createdAt: old });
    await AgentRun.create({ userId: 'u', agent: 'triage', input: 'new run text', status: 'ok' });
    await AuditLog.create({ action: 'old.event', at: new Date(Date.now() - 400 * 86_400_000) });
    const summary = await runRetention(t.ctx.config);
    expect(summary).toMatch(/runs=1 audit=1/);
    expect(await AgentRun.countDocuments({ input: 'new run text' })).toBe(1);
    expect(await AgentRun.countDocuments({ input: 'old run text' })).toBe(0);
  });

  it('scheduler runs a job, records its outcome and never overlaps itself', async () => {
    let runs = 0;
    t.ctx.scheduler.register({ name: 'probe', everyMs: 999_999, run: async () => { runs += 1; await new Promise((r) => setTimeout(r, 30)); return 'done'; } });
    await Promise.all([t.ctx.scheduler.runNow('probe'), t.ctx.scheduler.runNow('probe')]);
    expect(runs).toBe(1);
    expect(t.ctx.metrics.snapshot().jobs['probe']).toMatchObject({ ok: true, info: 'done' });
  });
});

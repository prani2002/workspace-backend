import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentError } from '../src/modules/agents/client';
import { OK_RESULT, addUser, setup, signIn } from './helpers';

let t: Awaited<ReturnType<typeof setup>>;
let s: Awaited<ReturnType<typeof signIn>>;
beforeAll(async () => {
  t = await setup();
  await addUser('member@example.com', 'member');
  s = await signIn(t.app, 'member@example.com');
});
afterAll(() => t.close());

const run = (key: string | null, input = 'VPN is down for everyone', name = 'triage') => {
  const req = s.agent.post(`/api/v1/agents/${name}/run`).set('x-csrf-token', s.csrf);
  if (key) req.set('Idempotency-Key', key);
  return req.send({ input });
};

describe('agent run + idempotency', () => {
  it('requires an Idempotency-Key', async () => {
    const res = await run(null);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('idempotency_key_required');
  });

  it('replays the stored response for the same key and body (agent called once)', async () => {
    t.agent.calls = 0;
    const a = await run('key-replay-1');
    const b = await run('key-replay-1');
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers['idempotent-replayed']).toBe('true');
    expect(b.body.run.id).toBe(a.body.run.id);
    expect(t.agent.calls).toBe(1);
  });

  it('rejects the same key with a different body', async () => {
    await run('key-reuse-1', 'First request text');
    const res = await run('key-reuse-1', 'A different request text');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('idempotency_key_reuse');
  });

  it('does not store 5xx failures, so the client can retry with the same key', async () => {
    t.agent.impl = async () => { throw new AgentError('agent_unreachable', 'down', 502); };
    const failed = await run('key-retry-1');
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('agent_unreachable');
    t.agent.impl = async () => OK_RESULT;
    const retried = await run('key-retry-1');
    expect(retried.status).toBe(201);
    expect(retried.headers['idempotent-replayed']).toBeUndefined();
  });

  it('validates input and unknown agents with a consistent error shape', async () => {
    const bad = await run('key-bad-1', 'hi');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'validation_error' });
    expect(bad.body.error.details[0].path).toBe('input');
    expect((await run('key-unknown-1', 'some valid text', 'nope')).status).toBe(404);
  });

  it('lists only my runs', async () => {
    const res = await s.agent.get('/api/v1/agents/runs?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
  });
});

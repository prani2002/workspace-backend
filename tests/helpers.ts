import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createLogger } from '../src/logger';
import { Metrics } from '../src/lib/metrics';
import { MaintenanceState } from '../src/lib/maintenance';
import { Scheduler } from '../src/lib/scheduler';
import { createUser } from '../src/modules/auth/service';
import type { AgentClient } from '../src/modules/agents/client';
import type { Ctx, Role } from '../src/http/types';

export const OK_RESULT = {
  status: 'ok', category: 'network', severity: 'P2', summary: 'VPN gateway degraded.', suggested_team: 'Network',
  next_steps: ['Check gateway'], missing_info: [], evidence: [{ source: 'service:vpn-gateway', detail: 'degraded' }], confidence: 0.8
};

export interface FakeAgent extends AgentClient { calls: number; impl: () => Promise<unknown> }

export function fakeAgent(): FakeAgent {
  const fake: FakeAgent = {
    calls: 0,
    impl: async () => OK_RESULT,
    async run() {
      fake.calls += 1;
      return { result: await fake.impl(), sessionId: 'sess-1', ms: 5 };
    }
  };
  return fake;
}

export async function setup(env: Record<string, string> = {}) {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), RATE_LIMIT_PER_MIN: '100000', LOGIN_RATE_LIMIT_PER_15MIN: '100000', ...env } as NodeJS.ProcessEnv);
  const logger = createLogger(config);
  const metrics = new Metrics();
  const agent = fakeAgent();
  const ctx: Ctx = { config, logger, metrics, agent, scheduler: new Scheduler(logger, metrics), maintenance: new MaintenanceState(config.MAINTENANCE_MODE) };
  const app = createApp(ctx);
  return {
    app, ctx, agent,
    async close() {
      await mongoose.disconnect();
      await mongod.stop();
    }
  };
}

export const addUser = (email: string, role: Role = 'member', password = 'correct-horse-battery') => createUser(email, password, role);

const cookieValue = (setCookie: string[] | undefined, name: string) =>
  setCookie?.map((c) => c.split(';')[0] ?? '').find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

/** Logs in and returns a cookie-keeping agent plus the CSRF token. */
export async function signIn(app: Parameters<typeof request>[0], email: string, password = 'correct-horse-battery') {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  return { agent, res, csrf: cookieValue(setCookie, 'csrf_token') ?? '', refresh: cookieValue(setCookie, 'refresh_token') ?? '', setCookie };
}

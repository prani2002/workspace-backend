import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { Metrics } from './lib/metrics';
import { MaintenanceState } from './lib/maintenance';
import { Scheduler } from './lib/scheduler';
import { createAgentClient } from './modules/agents/client';
import { runRetention } from './jobs/retention';
import type { Ctx } from './http/types';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const metrics = new Metrics();
  const scheduler = new Scheduler(logger, metrics);

  mongoose.set('strictQuery', true);
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  logger.info('mongo connected');

  const ctx: Ctx = {
    config, logger, metrics, scheduler,
    maintenance: new MaintenanceState(config.MAINTENANCE_MODE),
    agent: createAgentClient({ baseUrl: config.AGENT_URL.replace(/\/+$/, ''), timeoutMs: config.AGENT_TIMEOUT_MS, retries: config.AGENT_RETRIES })
  };

  scheduler.register({ name: 'retention', everyMs: 6 * 3600_000, run: () => runRetention(config) });
  scheduler.start();

  const server = createApp(ctx).listen(config.PORT, () => logger.info({ port: config.PORT, env: config.NODE_ENV }, 'api listening'));

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');
    scheduler.stop();
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(() => void mongoose.disconnect().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

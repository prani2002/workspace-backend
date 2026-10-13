import type { Logger } from '../logger';
import type { Metrics } from './metrics';

export interface Job {
  name: string;
  everyMs: number;
  runOnStart?: boolean;
  run: () => Promise<string | void>;
}

/** Minimal in-process scheduler. Single instance only; use a managed scheduler/queue when you scale out. */
export class Scheduler {
  private timers: NodeJS.Timeout[] = [];
  private running = new Set<string>();
  private jobs: Job[] = [];

  constructor(private readonly logger: Logger, private readonly metrics: Metrics) {}

  register(job: Job) {
    this.jobs.push(job);
  }

  async runNow(name: string) {
    const job = this.jobs.find((j) => j.name === name);
    if (!job) throw new Error(`Unknown job: ${name}`);
    await this.execute(job);
  }

  start() {
    for (const job of this.jobs) {
      this.timers.push(setInterval(() => void this.execute(job), job.everyMs).unref());
      if (job.runOnStart) void this.execute(job);
    }
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  private async execute(job: Job) {
    if (this.running.has(job.name)) return; // never overlap runs of the same job
    this.running.add(job.name);
    try {
      const info = await job.run();
      this.metrics.recordJob(job.name, true, info ?? undefined);
      this.logger.info({ job: job.name, info }, 'job ok');
    } catch (err) {
      this.metrics.recordJob(job.name, false, err instanceof Error ? err.message : String(err));
      this.logger.error({ err, job: job.name }, 'job failed');
    } finally {
      this.running.delete(job.name);
    }
  }
}

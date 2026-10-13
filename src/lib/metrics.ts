const BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000];

export class Metrics {
  private readonly started = Date.now();
  private requests = new Map<string, number>();
  private latency = new Array<number>(BUCKETS_MS.length + 1).fill(0);
  private latencySumMs = 0;
  private total = 0;
  private errors5xx = 0;
  private agentRuns = new Map<string, number>();
  private agentMsSum = 0;
  private agentCount = 0;
  private jobs = new Map<string, { lastRunAt: string; ok: boolean; info?: string }>();

  recordRequest(method: string, route: string, status: number, ms: number) {
    const key = `${method} ${route} ${status}`;
    this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
    const idx = BUCKETS_MS.findIndex((b) => ms <= b);
    this.latency[idx === -1 ? BUCKETS_MS.length : idx]! += 1;
    this.latencySumMs += ms;
    this.total += 1;
    if (status >= 500) this.errors5xx += 1;
  }

  recordAgent(agent: string, outcome: string, ms: number) {
    const key = `${agent}:${outcome}`;
    this.agentRuns.set(key, (this.agentRuns.get(key) ?? 0) + 1);
    this.agentMsSum += ms;
    this.agentCount += 1;
  }

  recordJob(name: string, ok: boolean, info?: string) {
    this.jobs.set(name, { lastRunAt: new Date().toISOString(), ok, ...(info ? { info } : {}) });
  }

  snapshot() {
    return {
      uptimeSec: Math.round((Date.now() - this.started) / 1000),
      requests: {
        total: this.total,
        errors5xx: this.errors5xx,
        errorRate: this.total ? Number((this.errors5xx / this.total).toFixed(4)) : 0,
        avgMs: this.total ? Math.round(this.latencySumMs / this.total) : 0,
        latencyBuckets: BUCKETS_MS.map((le, i) => ({ leMs: le, count: this.latency[i] ?? 0 })).concat([{ leMs: -1, count: this.latency[BUCKETS_MS.length] ?? 0 }]),
        byRoute: Object.fromEntries(this.requests)
      },
      agents: {
        runs: Object.fromEntries(this.agentRuns),
        avgMs: this.agentCount ? Math.round(this.agentMsSum / this.agentCount) : 0
      },
      jobs: Object.fromEntries(this.jobs)
    };
  }
}

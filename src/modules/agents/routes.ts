import { z } from 'zod';
import { defineRoute } from '../../http/types';
import { notFound } from '../../http/errors';
import { AgentRun } from '../../models';
import { agents } from './registry';
import { AgentError } from './client';

const RunBody = z.object({ input: z.string().trim().min(5, 'Describe the task in at least 5 characters').max(4000) }).strict();
const RunsQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

const present = (r: { _id: unknown; agent: string; input: string; output?: unknown; status: string; errorCode?: string | null; ms?: number | null; createdAt?: Date }) => ({
  id: String(r._id), agent: r.agent, input: r.input, result: r.output ?? null, status: r.status, errorCode: r.errorCode ?? null, ms: r.ms ?? 0, createdAt: r.createdAt?.toISOString() ?? new Date().toISOString()
});

export const agentRoutes = [
  defineRoute({
    method: 'post', path: '/api/v1/agents/:name/run', scope: 'sample', auth: 'user', body: RunBody, idempotent: true,
    handler: async (req, res, ctx) => {
      const name = String(req.params['name']);
      const spec = agents[name];
      if (!spec) throw notFound(`Unknown agent "${name}"`, 'agent_not_found');
      const userId = req.user!.id;
      try {
        const out = await ctx.agent.run(spec, req.body.input, { userId, requestId: req.id });
        ctx.metrics.recordAgent(name, 'ok', out.ms);
        const run = await AgentRun.create({ userId, agent: name, input: req.body.input, output: out.result, status: 'ok', ms: out.ms });
        res.status(201).json({ run: present(run.toObject()) });
      } catch (err) {
        const code = err instanceof AgentError ? err.code : 'internal_error';
        ctx.metrics.recordAgent(name, code, 0);
        await AgentRun.create({ userId, agent: name, input: req.body.input, status: 'error', errorCode: code }).catch(() => undefined);
        throw err;
      }
    }
  }),
  defineRoute({
    method: 'get', path: '/api/v1/agents/runs', scope: 'sample', auth: 'user', query: RunsQuery,
    handler: async (req, res) => {
      const limit = (req.query as unknown as z.infer<typeof RunsQuery>).limit;
      const items = await AgentRun.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(limit).lean();
      res.json({ items: items.map(present) });
    }
  })
];

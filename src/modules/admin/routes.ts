import { z } from 'zod';
import { defineRoute } from '../../http/types';
import { audit } from '../../lib/audit';
import { AuditLog } from '../../models';

const admin = { roles: ['admin' as const] };
const AuditQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const MaintenanceBody = z.object({ enabled: z.boolean() }).strict();

export const adminRoutes = [
  defineRoute({
    method: 'get', path: '/api/v1/admin/metrics', scope: 'base', auth: admin,
    handler: async (_req, res, ctx) => {
      res.json({ ...ctx.metrics.snapshot(), maintenance: await ctx.maintenance.isEnabled() });
    }
  }),
  defineRoute({
    method: 'get', path: '/api/v1/admin/audit', scope: 'base', auth: admin, query: AuditQuery,
    handler: async (req, res) => {
      const limit = (req.query as unknown as z.infer<typeof AuditQuery>).limit;
      const rows = await AuditLog.find().sort({ at: -1 }).limit(limit).lean();
      res.json({ items: rows.map((r) => ({ id: String(r._id), at: r.at.toISOString(), action: r.action, userId: r.userId ?? null, target: r.target ?? null, ip: r.ip ?? null, requestId: r.requestId ?? null })) });
    }
  }),
  defineRoute({
    method: 'put', path: '/api/v1/admin/maintenance', scope: 'base', auth: admin, body: MaintenanceBody,
    handler: async (req, res, ctx) => {
      await ctx.maintenance.set(req.body.enabled);
      audit(req, ctx.logger, req.body.enabled ? 'maintenance.on' : 'maintenance.off');
      res.json({ enabled: req.body.enabled });
    }
  })
];

import { readFileSync } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { defineRoute } from '../../http/types';

let specCache: string | undefined;

export const systemRoutes = [
  defineRoute({ method: 'get', path: '/health', scope: 'base', auth: 'public', handler: (_req, res) => { res.json({ ok: true }); } }),
  defineRoute({
    method: 'get', path: '/ready', scope: 'base', auth: 'public',
    handler: (_req, res) => {
      const ready = mongoose.connection.readyState === 1;
      res.status(ready ? 200 : 503).json({ ready, db: ready ? 'up' : 'down' });
    }
  }),
  defineRoute({
    method: 'get', path: '/api/v1/system/status', scope: 'base', auth: 'public',
    handler: async (_req, res, ctx) => { res.json({ ok: true, maintenance: await ctx.maintenance.isEnabled() }); }
  }),
  defineRoute({
    method: 'get', path: '/openapi.yaml', scope: 'base', auth: 'public',
    handler: (_req, res) => {
      specCache ??= readFileSync(path.resolve(__dirname, '../../../openapi.yaml'), 'utf8');
      res.type('text/yaml').send(specCache);
    }
  })
];

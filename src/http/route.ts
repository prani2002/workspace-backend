import { Router, type Request, type RequestHandler, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import type { Ctx, RouteDef } from './types';
import { authenticate, requireRole, validate } from './middleware';
import { idempotency } from './idempotency';

const tooMany = (_req: Request, res: Response) =>
  res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests. Try again later.', requestId: _req.id } });

/** The only place routes are mounted. Keeps auth, validation, idempotency and error handling uniform. */
export function registerRoutes(routes: RouteDef[], ctx: Ctx): Router {
  const router = Router();
  const strict = rateLimit({ windowMs: 15 * 60_000, limit: ctx.config.LOGIN_RATE_LIMIT_PER_15MIN, standardHeaders: 'draft-7', legacyHeaders: false, handler: tooMany });

  for (const r of routes) {
    const chain: RequestHandler[] = [];
    if (r.rateLimit === 'strict') chain.push(strict);
    if (r.middleware) chain.push(...r.middleware);
    if (r.auth !== 'public') {
      chain.push(authenticate(ctx));
      if (typeof r.auth === 'object') chain.push(requireRole(r.auth.roles));
    }
    if (r.query) chain.push(validate('query', r.query));
    if (r.body) chain.push(validate('body', r.body));
    if (r.idempotent) chain.push(idempotency());
    chain.push((req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(r.handler(req, res, ctx)).catch(next);
    });
    router[r.method](r.path, ...chain);
  }
  return router;
}

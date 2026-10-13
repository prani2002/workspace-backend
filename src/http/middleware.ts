import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import type { Ctx, Role } from './types';
import { HttpError, forbidden, unauthorized } from './errors';
import { safeEqual } from '../lib/crypto';
import { verifyAccessToken } from '../modules/auth/tokens';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};

export const metricsMiddleware = (ctx: Ctx): RequestHandler => (req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const route = req.route ? `${req.baseUrl}${String(req.route.path)}` : 'unmatched';
    ctx.metrics.recordRequest(req.method, route, res.statusCode, ms);
  });
  next();
};

const ALWAYS_ALLOWED = [/^\/health$/, /^\/ready$/, /^\/api\/v1\/auth\//, /^\/api\/v1\/admin\//, /^\/api\/v1\/system\//];

export const maintenanceGuard = (ctx: Ctx): RequestHandler => async (req, res, next) => {
  if (ALWAYS_ALLOWED.some((re) => re.test(req.path)) || !(await ctx.maintenance.isEnabled())) return next();
  res.setHeader('Retry-After', '120');
  res.status(503).json({ error: { code: 'maintenance', message: 'The service is under maintenance. Please try again shortly.', requestId: req.id } });
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Double-submit CSRF: only enforced when the request carries a session cookie. */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method) || req.path === '/api/v1/auth/login') return next();
  const cookies = req.cookies as Record<string, string | undefined>;
  if (!cookies['access_token'] && !cookies['refresh_token']) return next();
  const header = req.header('x-csrf-token');
  const cookie = cookies['csrf_token'];
  if (!header || !cookie || !safeEqual(header, cookie)) return next(forbidden('CSRF token missing or invalid', 'csrf_failed'));
  next();
};

export const authenticate = (ctx: Ctx): RequestHandler => async (req, _res, next) => {
  const token = (req.cookies as Record<string, string | undefined>)['access_token'];
  const user = token ? await verifyAccessToken(ctx.config, token) : null;
  if (!user) return next(unauthorized());
  req.user = user;
  next();
};

export const requireRole = (roles: Role[]): RequestHandler => (req, _res, next) =>
  req.user && roles.includes(req.user.role) ? next() : next(forbidden());

export const validate = (part: 'body' | 'query', schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse(req[part]);
  if (!parsed.success) return next(zodToHttp(parsed.error));
  (req as unknown as Record<string, unknown>)[part] = parsed.data;
  next();
};

function zodToHttp(error: ZodError) {
  return new HttpError(400, 'validation_error', 'Request validation failed', error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}`, requestId: req.id } });
};

export const errorHandler = (ctx: Ctx): ErrorRequestHandler => (err, req: Request, res: Response, _next: NextFunction) => {
  const body = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}), requestId: req.id } });

  if (err instanceof HttpError) {
    if (err.status >= 500) ctx.logger.error({ err, requestId: req.id }, 'upstream error');
    return body(err.status, err.code, err.message, err.details);
  }
  if (err instanceof ZodError) {
    const e = zodToHttp(err);
    return body(e.status, e.code, e.message, e.details);
  }
  const type = (err as { type?: string }).type;
  if (type === 'entity.parse.failed') return body(400, 'invalid_json', 'Request body is not valid JSON');
  if (type === 'entity.too.large') return body(413, 'payload_too_large', 'Request body is too large');
  ctx.logger.error({ err, requestId: req.id }, 'unhandled error');
  return body(500, 'internal_error', 'Something went wrong. Quote the request ID to support.');
};

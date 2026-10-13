import type { Request, Response, RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { Metrics } from '../lib/metrics';
import type { AgentClient } from '../modules/agents/client';
import type { MaintenanceState } from '../lib/maintenance';
import type { Scheduler } from '../lib/scheduler';

export type Role = 'admin' | 'member' | 'viewer';
export interface AuthUser { id: string; email: string; role: Role }

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser; id: string }
}

export interface Ctx {
  config: Config;
  logger: Logger;
  metrics: Metrics;
  agent: AgentClient;
  maintenance: MaintenanceState;
  scheduler: Scheduler;
}

export type Auth = 'public' | 'user' | { roles: Role[] };
export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDef {
  method: Method;
  /** Express path, e.g. /api/v1/items/:id (must exist in openapi.yaml as /api/v1/items/{id}) */
  path: string;
  /** MUST id from SCOPE.md (M1, M2...), or "base" (template infra) / "sample" (demo code to delete) */
  scope: string;
  auth: Auth;
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  /** Require an Idempotency-Key header and replay duplicates */
  idempotent?: boolean;
  /** 'strict' = login-style limiter (LOGIN_RATE_LIMIT_PER_15MIN per IP) */
  rateLimit?: 'strict';
  middleware?: RequestHandler[];
  handler: (req: Request, res: Response, ctx: Ctx) => Promise<void> | void;
}

export const defineRoute = (def: RouteDef): RouteDef => def;

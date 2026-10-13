import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import type { Ctx } from './http/types';
import { csrfProtection, errorHandler, maintenanceGuard, metricsMiddleware, notFoundHandler, requestId } from './http/middleware';
import { registerRoutes } from './http/route';
import { allRoutes } from './routes';

export function createApp(ctx: Ctx) {
  const { config, logger } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => (req as express.Request).id, autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' } }));
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean), credentials: true }));
  app.use(metricsMiddleware(ctx));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: config.RATE_LIMIT_PER_MIN,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (req) => req.path === '/health' || req.path === '/ready',
      handler: (req, res) => res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests. Try again later.', requestId: req.id } })
    })
  );
  app.use(maintenanceGuard(ctx));
  app.use(csrfProtection);
  app.use(registerRoutes(allRoutes, ctx));
  app.use(notFoundHandler);
  app.use(errorHandler(ctx));
  return app;
}

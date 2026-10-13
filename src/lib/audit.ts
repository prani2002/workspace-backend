import type { Request } from 'express';
import { AuditLog } from './../models';
import type { Logger } from '../logger';

export function audit(req: Request, logger: Logger, action: string, target?: string, meta?: Record<string, unknown>) {
  AuditLog.create({ action, userId: req.user?.id, target, ip: req.ip, requestId: req.id, meta }).catch((err) => logger.error({ err, action }, 'audit write failed'));
}

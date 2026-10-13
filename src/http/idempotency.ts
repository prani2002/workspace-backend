import type { RequestHandler } from 'express';
import { HttpError, badRequest } from './errors';
import { sha256 } from '../lib/crypto';
import { IdempotencyKey } from '../models';

const TTL_MS = 24 * 3600 * 1000;
const isDuplicateKey = (e: unknown) => (e as { code?: number }).code === 11000;

/** Requires `Idempotency-Key`. Same key + same body replays the stored response; same key + different body is rejected. */
export const idempotency = (): RequestHandler => async (req, res, next) => {
  try {
    const key = req.header('idempotency-key');
    if (!key || key.length > 128) return next(badRequest('idempotency_key_required', 'Idempotency-Key header is required (max 128 characters)'));
    const userId = req.user?.id ?? 'anonymous';
    const requestHash = sha256(`${req.method} ${req.originalUrl} ${JSON.stringify(req.body ?? {})}`);

    try {
      await IdempotencyKey.create({ key, userId, requestHash, state: 'in_progress', expiresAt: new Date(Date.now() + TTL_MS) });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      const existing = await IdempotencyKey.findOne({ userId, key }).lean();
      if (!existing) return next(new HttpError(409, 'request_in_progress', 'A request with this key is being processed'));
      if (existing.requestHash !== requestHash) return next(new HttpError(422, 'idempotency_key_reuse', 'This Idempotency-Key was already used with a different request'));
      if (existing.state !== 'done') {
        res.setHeader('Retry-After', '1');
        return next(new HttpError(409, 'request_in_progress', 'A request with this key is being processed'));
      }
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(existing.status ?? 200).json(existing.body);
      return;
    }

    const original = res.json.bind(res);
    res.json = ((body: unknown) => {
      const finish = () => original(body);
      const save =
        res.statusCode >= 500
          ? IdempotencyKey.deleteOne({ userId, key }) // let the client retry real failures
          : IdempotencyKey.updateOne({ userId, key }, { $set: { state: 'done', status: res.statusCode, body } });
      save.then(finish, finish);
      return res;
    }) as typeof res.json;
    next();
  } catch (err) {
    next(err);
  }
};

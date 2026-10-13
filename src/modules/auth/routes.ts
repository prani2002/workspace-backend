import { z } from 'zod';
import { defineRoute } from '../../http/types';
import { audit } from '../../lib/audit';
import { User } from '../../models';
import { unauthorized } from '../../http/errors';
import { clearSessionCookies, login, revokeFamily, rotateRefresh, setSessionCookies } from './service';

const LoginBody = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) }).strict();
const cookie = (req: { cookies: unknown }, name: string) => (req.cookies as Record<string, string | undefined>)[name];

export const authRoutes = [
  defineRoute({
    method: 'post', path: '/api/v1/auth/login', scope: 'base', auth: 'public', rateLimit: 'strict', body: LoginBody,
    handler: async (req, res, ctx) => {
      try {
        const out = await login(ctx.config, req.body.email, req.body.password);
        setSessionCookies(res, ctx.config, out.access, out.refresh);
        req.user = out.user;
        audit(req, ctx.logger, 'auth.login', out.user.id);
        res.json({ user: { ...out.user, name: out.name } });
      } catch (err) {
        audit(req, ctx.logger, 'auth.login_failed', String(req.body.email).toLowerCase());
        throw err;
      }
    }
  }),
  defineRoute({
    method: 'post', path: '/api/v1/auth/refresh', scope: 'base', auth: 'public',
    handler: async (req, res, ctx) => {
      try {
        const out = await rotateRefresh(ctx.config, cookie(req, 'refresh_token'));
        setSessionCookies(res, ctx.config, out.access, out.refresh);
        res.json({ user: { ...out.user, name: out.name } });
      } catch (err) {
        clearSessionCookies(res, ctx.config);
        throw err;
      }
    }
  }),
  defineRoute({
    method: 'post', path: '/api/v1/auth/logout', scope: 'base', auth: 'public',
    handler: async (req, res, ctx) => {
      await revokeFamily(cookie(req, 'refresh_token'));
      clearSessionCookies(res, ctx.config);
      audit(req, ctx.logger, 'auth.logout');
      res.status(204).end();
    }
  }),
  defineRoute({
    method: 'get', path: '/api/v1/auth/me', scope: 'base', auth: 'user',
    handler: async (req, res) => {
      const user = await User.findOne({ _id: req.user!.id, deletedAt: null }).lean();
      if (!user) throw unauthorized('Session expired', 'session_expired');
      res.json({ user: { id: String(user._id), email: user.email, role: user.role ?? 'member', name: user.name ?? null } });
    }
  })
];

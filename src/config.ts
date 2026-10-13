import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/fde'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TTL_MIN: z.coerce.number().positive().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().positive().default(7),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  LOGIN_RATE_LIMIT_PER_15MIN: z.coerce.number().int().positive().default(20),
  AGENT_URL: z.string().url().default('http://localhost:8000'),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  AGENT_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  MAINTENANCE_MODE: bool,
  RUN_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional()
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  return parsed.data;
}

export const isSecureEnv = (c: Config) => c.NODE_ENV === 'production' || c.NODE_ENV === 'staging';

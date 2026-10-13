import pino from 'pino';
import type { Config } from './config';

export type Logger = pino.Logger;

export function createLogger(config: Config): Logger {
  return pino({
    level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
    redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', 'password', '*.password', '*.token'], censor: '[redacted]' },
    ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {})
  });
}

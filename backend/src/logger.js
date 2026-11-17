// Logs estruturados em JSON (RNF-05). Campos sensíveis são redigidos (constituição II.6).
import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.senha',
      '*.senha_hash',
      '*.token',
      'senha',
      'token',
    ],
    censor: '[REDACTED]',
  },
});

/** Log de auditoria (não repúdio): quem fez o quê, quando e de onde. */
export function audit(event, data = {}) {
  logger.info({ audit: true, event, ...data }, `audit:${event}`);
}

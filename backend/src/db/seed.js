// Cria o admin inicial a partir do ambiente (spec 001 / RS-005-02). Idempotente.
import { config } from '../config.js';
import { query } from './pool.js';
import { hashPassword } from '../services/password.js';
import { logger } from '../logger.js';

export async function seedAdmin() {
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    logger.warn('ADMIN_EMAIL/ADMIN_PASSWORD não definidos: admin inicial não criado');
    return;
  }
  const email = config.ADMIN_EMAIL.trim().toLowerCase();
  const { rowCount } = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (rowCount > 0) return;

  await query(
    "INSERT INTO users (nome, email, senha_hash, role) VALUES ($1, $2, $3, 'admin')",
    [config.ADMIN_NAME, email, await hashPassword(config.ADMIN_PASSWORD)],
  );
  logger.info({ email }, 'admin inicial criado');
}

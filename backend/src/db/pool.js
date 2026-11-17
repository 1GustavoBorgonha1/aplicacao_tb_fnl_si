import pg from 'pg';
import { config } from '../config.js';

// Em produção (RDS) DATABASE_SSL=true força conexão criptografada em trânsito.
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
});

/** Atalho para queries parametrizadas — NUNCA concatenar valores no SQL. */
export const query = (text, params) => pool.query(text, params);

/** Executa `fn(client)` dentro de uma transação. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

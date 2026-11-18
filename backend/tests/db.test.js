// ADR-08 — Runner de migrations: idempotente e seguro com várias réplicas (K3s).
import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';

afterAll(() => pool.end());

describe('Migrations', () => {
  it('rodar de novo não reaplica nada e registra cada migration uma única vez', async () => {
    const antes = await pool.query('SELECT nome FROM schema_migrations ORDER BY nome');
    await migrate();
    const depois = await pool.query('SELECT nome FROM schema_migrations ORDER BY nome');
    expect(depois.rows).toEqual(antes.rows);
    expect(depois.rows.map((r) => r.nome)).toEqual(expect.arrayContaining(['001_init.sql', '002_token_versao.sql']));
  });

  it('duas réplicas migrando ao mesmo tempo não conflitam (advisory lock)', async () => {
    await expect(Promise.all([migrate(), migrate()])).resolves.toBeDefined();
  });
});

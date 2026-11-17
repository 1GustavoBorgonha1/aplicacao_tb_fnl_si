// Roda uma vez antes de todos os testes: aplica as migrations no banco de teste.
export default async function setup() {
  await import('./setup-env.js');
  const { migrate } = await import('../src/db/migrate.js');
  const { pool } = await import('../src/db/pool.js');
  await migrate();
  await pool.end();
}

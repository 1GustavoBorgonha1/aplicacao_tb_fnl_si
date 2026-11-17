import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { seedAdmin } from './db/seed.js';
import { logger } from './logger.js';

async function main() {
  await migrate();
  await seedAdmin();

  const server = createApp().listen(config.PORT, () => {
    logger.info({ port: config.PORT, storage: config.STORAGE_DRIVER }, 'MarmiFit API no ar');
  });

  // Encerramento gracioso (docker stop envia SIGTERM) — disponibilidade.
  const shutdown = (signal) => {
    logger.info({ signal }, 'encerrando');
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'falha ao iniciar');
  process.exit(1);
});

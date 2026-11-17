// Monta a aplicação Express. Separado de server.js para os testes usarem sem abrir porta.
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { mealsRouter } from './routes/meals.js';
import { ordersRouter } from './routes/orders.js';
import { restaurantsRouter } from './routes/restaurants.js';
import { storage } from './storage/index.js';

export function createApp({
  loginLimit = config.LOGIN_RATE_LIMIT,
  loginWindowMin = config.LOGIN_RATE_WINDOW_MIN,
} = {}) {
  const app = express();

  app.disable('x-powered-by'); // não revela a tecnologia (Security Misconfiguration)
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' })); // limita payload (DoS)
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  // RNF-05 — health check para o ALB/Docker. Verifica também o banco.
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'indisponivel' });
    }
  });

  app.use('/api/auth', authRouter({ loginLimit, loginWindowMin }));
  app.use('/api/restaurants', restaurantsRouter());
  app.use('/api/meals', mealsRouter());
  app.use('/api/orders', ordersRouter());
  app.use('/api/admin', adminRouter());

  // Imagens do driver local (no S3 as URLs apontam direto para o bucket/CloudFront).
  if (config.STORAGE_DRIVER === 'local') {
    app.use(
      '/uploads',
      express.static(storage.root, { index: false, dotfiles: 'deny', fallthrough: false, maxAge: '1d' }),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// Configuração 100% via variáveis de ambiente (constituição II.5 / RNF-02).
// Falha rápido no startup se algo obrigatório estiver ausente ou inseguro.
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  // Nº de proxies à frente (Nginx = 1; ALB + Nginx = 2). Necessário para o rate limit ver o IP real.
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10), // falhas de login por IP na janela
  LOGIN_RATE_WINDOW_MIN: z.coerce.number().int().positive().default(15),
  ADMIN_NAME: z.string().default('Administrador'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  S3_BUCKET: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Não usa o logger aqui para não depender da própria config.
  console.error('Configuração inválida:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

const env = parsed.data;
if (env.STORAGE_DRIVER === 's3' && !env.S3_BUCKET) {
  console.error('Configuração inválida: S3_BUCKET é obrigatório quando STORAGE_DRIVER=s3');
  process.exit(1);
}

export const config = Object.freeze(env);

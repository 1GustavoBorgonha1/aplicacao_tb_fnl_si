// Spec 001 — Cadastro, login e /me.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { conflict, forbidden, unauthorized } from '../errors.js';
import { audit } from '../logger.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../services/password.js';
import { signToken } from '../services/token.js';
import { requireAuth } from '../middlewares/auth.js';
import { parse, texto } from '../validate.js';

const email = z.string().trim().toLowerCase().pipe(z.string().email().max(150)); // RS-001-06
const senha = z
  .string()
  .min(8, 'mínimo de 8 caracteres')
  .max(72, 'máximo de 72 caracteres')
  .regex(/[A-Za-z]/, 'deve conter letra')
  .regex(/\d/, 'deve conter número'); // CA-001-04
const soDigitos = (min, max) =>
  z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().min(min).max(max));

// Campos desconhecidos (ex.: "role") são descartados pelo zod → CA-001-11.
const clienteSchema = z.object({ nome: texto(2, 100), email, senha });
export const restauranteDadosSchema = z.object({
  nome: texto(2, 100),
  telefone: soDigitos(10, 11),
  endereco: texto(5, 200),
  horario: texto(0, 100).default(''),
});
const restauranteSchema = clienteSchema.extend({
  restaurante: restauranteDadosSchema.extend({ cnpj: soDigitos(14, 14) }),
});
const loginSchema = z.object({ email, senha: z.string().min(1).max(200) });

const publicUser = (u) => ({ id: u.id, nome: u.nome, email: u.email, role: u.role });

export function authRouter({ loginLimit, loginWindowMin }) {
  const router = Router();

  // RS-001-04 — Rate limit contra força bruta (Hydra) e cadastro em massa.
  const loginLimiter = rateLimit({
    windowMs: loginWindowMin * 60_000,
    limit: loginLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { erro: 'Muitas tentativas. Tente novamente mais tarde.' },
    handler: (req, res, _next, options) => {
      audit('login_rate_limited', { ip: req.ip });
      res.status(options.statusCode).json(options.message);
    },
  });
  const registerLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: loginLimit * 4,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { erro: 'Muitos cadastros a partir deste IP. Tente mais tarde.' },
  });

  async function emailEmUso(db, e) {
    const { rowCount } = await db.query('SELECT 1 FROM users WHERE email = $1', [e]);
    return rowCount > 0;
  }

  router.post('/register/cliente', registerLimiter, async (req, res) => {
    const data = parse(clienteSchema, req.body);
    if (await emailEmUso({ query }, data.email)) throw conflict('E-mail já cadastrado');

    const { rows } = await query(
      "INSERT INTO users (nome, email, senha_hash, role) VALUES ($1, $2, $3, 'cliente') RETURNING *",
      [data.nome, data.email, await hashPassword(data.senha)],
    );
    audit('user_registered', { userId: rows[0].id, role: 'cliente', ip: req.ip });
    res.status(201).json({ user: publicUser(rows[0]) });
  });

  // CA-002 — usuário + restaurante na mesma transação.
  router.post('/register/restaurante', registerLimiter, async (req, res) => {
    const data = parse(restauranteSchema, req.body);
    const senhaHash = await hashPassword(data.senha);

    const result = await withTransaction(async (db) => {
      if (await emailEmUso(db, data.email)) throw conflict('E-mail já cadastrado');
      const cnpj = await db.query('SELECT 1 FROM restaurants WHERE cnpj = $1', [data.restaurante.cnpj]);
      if (cnpj.rowCount > 0) throw conflict('CNPJ já cadastrado');

      const u = await db.query(
        "INSERT INTO users (nome, email, senha_hash, role) VALUES ($1, $2, $3, 'restaurante') RETURNING *",
        [data.nome, data.email, senhaHash],
      );
      const r = data.restaurante;
      const rest = await db.query(
        `INSERT INTO restaurants (user_id, nome, cnpj, telefone, endereco, horario)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nome, status`,
        [u.rows[0].id, r.nome, r.cnpj, r.telefone, r.endereco, r.horario],
      );
      return { user: u.rows[0], restaurante: rest.rows[0] };
    });

    audit('user_registered', { userId: result.user.id, role: 'restaurante', ip: req.ip });
    res.status(201).json({ user: publicUser(result.user), restaurante: result.restaurante });
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const data = parse(loginSchema, req.body);
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [data.email]);
    const user = rows[0];

    // Sempre executa o bcrypt (mesmo sem usuário) para não vazar existência pelo tempo.
    const ok = await verifyPassword(data.senha, user?.senha_hash ?? DUMMY_HASH);
    if (!user || !ok) {
      audit('login_failed', { email: data.email, ip: req.ip });
      throw unauthorized('E-mail ou senha inválidos'); // CA-001-06 / RS-001-03
    }
    if (!user.ativo) {
      audit('login_blocked', { userId: user.id, ip: req.ip });
      throw forbidden('Usuário desativado'); // CA-001-09
    }

    audit('login_success', { userId: user.id, role: user.role, ip: req.ip });
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  router.get('/me', requireAuth, async (req, res) => {
    const body = { user: publicUser(req.user) };
    if (req.user.role === 'restaurante') {
      const { rows } = await query('SELECT id, nome, status FROM restaurants WHERE user_id = $1', [
        req.user.id,
      ]);
      body.restaurante = rows[0] ?? null;
    }
    res.json(body);
  });

  return router;
}

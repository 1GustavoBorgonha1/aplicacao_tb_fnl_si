// Spec 005 — Painel administrativo. Todas as rotas exigem role=admin (CA-005-01).
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { badRequest, notFound } from '../errors.js';
import { audit } from '../logger.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { parse, parseId } from '../validate.js';
import { serializeMeal } from './meals.js';
import { fetchOrders, STATUS } from './orders.js';

const REST_STATUS = ['pendente', 'aprovado', 'bloqueado'];
const ROLES = ['admin', 'restaurante', 'cliente'];

export function adminRouter() {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/stats', async (_req, res) => {
    const [users, rests, orders] = await Promise.all([
      query('SELECT role, COUNT(*)::int AS total FROM users GROUP BY role'),
      query('SELECT status, COUNT(*)::int AS total FROM restaurants GROUP BY status'),
      query('SELECT status, COUNT(*)::int AS total FROM orders GROUP BY status'),
    ]);
    const toObj = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r.total]));
    res.json({
      usuarios: toObj(users.rows, 'role'),
      restaurantes: toObj(rests.rows, 'status'),
      pedidos: toObj(orders.rows, 'status'),
    });
  });

  router.get('/restaurants', async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(REST_STATUS).optional() }), req.query);
    const { rows } = await query(
      `SELECT r.*, u.nome AS dono_nome, u.email AS dono_email, u.ativo AS dono_ativo
         FROM restaurants r JOIN users u ON u.id = r.user_id
        WHERE ($1::text IS NULL OR r.status = $1)
        ORDER BY r.criado_em DESC`,
      [status ?? null],
    );
    res.json({ restaurantes: rows });
  });

  router.patch('/restaurants/:id/status', async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = parse(z.object({ status: z.enum(REST_STATUS) }), req.body);
    const { rows } = await query('UPDATE restaurants SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    if (!rows[0]) throw notFound('Restaurante não encontrado');
    audit('admin_restaurant_status', { adminId: req.user.id, restaurantId: id, status }); // CA-005-06
    res.json({ restaurante: rows[0] });
  });

  router.get('/users', async (req, res) => {
    const { role } = parse(z.object({ role: z.enum(ROLES).optional() }), req.query);
    const { rows } = await query(
      `SELECT id, nome, email, role, ativo, criado_em FROM users
        WHERE ($1::text IS NULL OR role = $1) ORDER BY criado_em DESC`,
      [role ?? null],
    );
    res.json({ usuarios: rows });
  });

  router.patch('/users/:id/ativo', async (req, res) => {
    const id = parseId(req.params.id);
    const { ativo } = parse(z.object({ ativo: z.boolean() }), req.body);
    if (id === req.user.id && !ativo) throw badRequest('Você não pode desativar a si mesmo'); // CA-005-05
    const { rows } = await query(
      'UPDATE users SET ativo = $1 WHERE id = $2 RETURNING id, nome, email, role, ativo',
      [ativo, id],
    );
    if (!rows[0]) throw notFound('Usuário não encontrado');
    audit('admin_user_ativo', { adminId: req.user.id, userId: id, ativo });
    res.json({ usuario: rows[0] });
  });

  router.get('/orders', async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(STATUS).optional() }), req.query);
    res.json({ pedidos: await fetchOrders('($1::text IS NULL OR o.status = $1)', [status ?? null]) });
  });

  router.get('/meals', async (_req, res) => {
    const { rows } = await query(
      `SELECT m.*, r.nome AS restaurante_nome FROM meals m
         JOIN restaurants r ON r.id = m.restaurant_id ORDER BY r.nome, m.nome`,
    );
    res.json({ marmitas: rows.map((m) => ({ ...serializeMeal(m), restaurante_nome: m.restaurante_nome })) });
  });

  router.patch('/meals/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const { disponivel } = parse(z.object({ disponivel: z.boolean() }), req.body);
    const { rows } = await query('UPDATE meals SET disponivel = $1 WHERE id = $2 RETURNING *', [disponivel, id]);
    if (!rows[0]) throw notFound('Marmita não encontrada');
    audit('admin_meal_disponivel', { adminId: req.user.id, mealId: id, disponivel });
    res.json({ marmita: serializeMeal(rows[0]) });
  });

  return router;
}

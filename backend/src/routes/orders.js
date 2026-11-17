// Spec 004 — Pedidos para retirada.
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { audit } from '../logger.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { loadRestaurant } from '../middlewares/restaurant.js';
import { parse, parseId, texto } from '../validate.js';

export const STATUS = ['recebido', 'em_preparo', 'pronto_retirada', 'retirado', 'cancelado'];

// Máquina de estados do restaurante (spec 004 §3).
export const TRANSICOES = {
  recebido: ['em_preparo', 'cancelado'],
  em_preparo: ['pronto_retirada', 'cancelado'],
  pronto_retirada: ['retirado'],
  retirado: [],
  cancelado: [],
};

const MIN_ANTECEDENCIA_MS = 30 * 60_000;
const MAX_ANTECEDENCIA_MS = 7 * 24 * 60 * 60_000;

const orderSchema = z.object({
  restaurant_id: z.coerce.number().int().positive(),
  retirada_em: z.coerce.date(),
  observacao: texto(0, 300).default(''),
  itens: z
    .array(
      z.object({
        meal_id: z.coerce.number().int().positive(),
        qtd: z.coerce.number().int().min(1).max(20), // CA-004-03
      }),
    )
    .min(1)
    .max(20),
});

/** Busca pedidos já com itens. `where` usa apenas placeholders. */
export async function fetchOrders(where, params) {
  const { rows } = await query(
    `SELECT o.*, r.nome AS restaurante_nome, r.endereco AS restaurante_endereco,
            u.nome AS cliente_nome,
            COALESCE(json_agg(json_build_object(
              'meal_id', i.meal_id, 'nome', i.nome_marmita, 'qtd', i.qtd,
              'preco_unit_centavos', i.preco_unit_centavos) ORDER BY i.id)
              FILTER (WHERE i.id IS NOT NULL), '[]') AS itens
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       JOIN users u ON u.id = o.cliente_id
       LEFT JOIN order_items i ON i.order_id = o.id
      WHERE ${where}
      GROUP BY o.id, r.id, u.id
      ORDER BY o.criado_em DESC`,
    params,
  );
  return rows;
}

export function ordersRouter() {
  const router = Router();
  const asCliente = [requireAuth, requireRole('cliente')];
  const asRestaurant = [requireAuth, requireRole('restaurante'), loadRestaurant()];

  // ---- Cliente ----
  router.post('/', ...asCliente, async (req, res) => {
    const data = parse(orderSchema, req.body);

    const delta = data.retirada_em.getTime() - Date.now();
    if (delta < MIN_ANTECEDENCIA_MS || delta > MAX_ANTECEDENCIA_MS) {
      throw badRequest('Horário de retirada deve ser entre 30 minutos e 7 dias a partir de agora'); // CA-004-04
    }

    // Soma quantidades se a mesma marmita vier repetida.
    const qtdPorMeal = new Map();
    for (const { meal_id, qtd } of data.itens) qtdPorMeal.set(meal_id, (qtdPorMeal.get(meal_id) ?? 0) + qtd);
    if ([...qtdPorMeal.values()].some((q) => q > 20)) throw badRequest('Máximo de 20 unidades por marmita');
    const ids = [...qtdPorMeal.keys()];

    const pedido = await withTransaction(async (db) => {
      // CA-004-02: mesmo restaurante, aprovado, marmitas disponíveis.
      const { rows: meals } = await db.query(
        `SELECT m.id, m.nome, m.preco_centavos
           FROM meals m JOIN restaurants r ON r.id = m.restaurant_id
          WHERE m.id = ANY($1::int[]) AND m.restaurant_id = $2 AND m.disponivel AND r.status = 'aprovado'`,
        [ids, data.restaurant_id],
      );
      if (meals.length !== ids.length) {
        throw badRequest('Uma ou mais marmitas estão indisponíveis ou não pertencem a este restaurante');
      }

      // CA-004-01 / RS-004-01: total calculado com os preços do banco.
      const total = meals.reduce((acc, m) => acc + m.preco_centavos * qtdPorMeal.get(m.id), 0);
      const { rows } = await db.query(
        `INSERT INTO orders (cliente_id, restaurant_id, retirada_em, observacao, total_centavos)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.user.id, data.restaurant_id, data.retirada_em, data.observacao, total],
      );
      const orderId = rows[0].id;
      for (const m of meals) {
        await db.query(
          `INSERT INTO order_items (order_id, meal_id, nome_marmita, qtd, preco_unit_centavos)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, m.id, m.nome, qtdPorMeal.get(m.id), m.preco_centavos],
        );
      }
      return orderId;
    }); // CA-004-09

    audit('order_created', { userId: req.user.id, orderId: pedido });
    const [order] = await fetchOrders('o.id = $1', [pedido]);
    res.status(201).json({ pedido: order });
  });

  router.get('/mine', ...asCliente, async (req, res) => {
    res.json({ pedidos: await fetchOrders('o.cliente_id = $1', [req.user.id]) }); // CA-004-05
  });

  router.patch('/:id/cancel', ...asCliente, async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await query('SELECT status FROM orders WHERE id = $1 AND cliente_id = $2', [
      id,
      req.user.id,
    ]);
    if (!rows[0]) throw notFound('Pedido não encontrado');
    if (rows[0].status !== 'recebido') throw conflict('O pedido já está em preparo e não pode ser cancelado'); // CA-004-08

    await query(
      "UPDATE orders SET status = 'cancelado', atualizado_em = now() WHERE id = $1 AND status = 'recebido'",
      [id],
    );
    audit('order_status', { userId: req.user.id, orderId: id, de: 'recebido', para: 'cancelado' });
    const [order] = await fetchOrders('o.id = $1', [id]);
    res.json({ pedido: order });
  });

  // ---- Restaurante ----
  router.get('/received', ...asRestaurant, async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(STATUS).optional() }), req.query);
    const pedidos = await fetchOrders('o.restaurant_id = $1 AND ($2::text IS NULL OR o.status = $2)', [
      req.restaurant.id,
      status ?? null,
    ]); // CA-004-06
    res.json({ pedidos });
  });

  router.patch('/:id/status', ...asRestaurant, async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = parse(z.object({ status: z.enum(STATUS) }), req.body);
    const { rows } = await query('SELECT status FROM orders WHERE id = $1 AND restaurant_id = $2', [
      id,
      req.restaurant.id,
    ]);
    if (!rows[0]) throw notFound('Pedido não encontrado');
    const atual = rows[0].status;
    if (!TRANSICOES[atual].includes(status)) {
      throw conflict(`Transição inválida: ${atual} → ${status}`); // CA-004-07
    }

    // Condição no WHERE evita corrida entre duas atualizações simultâneas.
    const upd = await query(
      'UPDATE orders SET status = $1, atualizado_em = now() WHERE id = $2 AND status = $3',
      [status, id, atual],
    );
    if (upd.rowCount === 0) throw conflict('O pedido foi alterado por outra operação; recarregue');
    audit('order_status', { userId: req.user.id, orderId: id, de: atual, para: status }); // RS-004-03
    const [order] = await fetchOrders('o.id = $1', [id]);
    res.json({ pedido: order });
  });

  return router;
}

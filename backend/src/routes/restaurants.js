// Spec 002 (restaurantes) + catálogo público da spec 003.
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { notFound } from '../errors.js';
import { audit } from '../logger.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { loadRestaurant } from '../middlewares/restaurant.js';
import { parse, parseId } from '../validate.js';
import { horarioTexto, restauranteDadosSchema } from './auth.js';
import { serializeRestaurante } from '../horario.js';
import { CATEGORIAS, serializeMeal } from './meals.js';

// CA-002-05: listagem pública sem CNPJ e sem dados do dono.
const PUBLIC_COLS = 'id, nome, telefone, endereco, horario, dias_retirada, abre_as, fecha_as';

export function restaurantsRouter() {
  const router = Router();
  const asRestaurant = [requireAuth, requireRole('restaurante')];

  // ---- Área do restaurante (rotas /me antes de /:id) ----
  router.get('/me', ...asRestaurant, loadRestaurant({ allowBlocked: true }), (req, res) => {
    const { user_id: _userId, ...restaurante } = req.restaurant;
    res.json({ restaurante: serializeRestaurante(restaurante) });
  });

  router.put('/me', ...asRestaurant, loadRestaurant(), async (req, res) => {
    // CA-002-03: cnpj e status não fazem parte do schema → ignorados.
    const data = parse(restauranteDadosSchema, req.body);
    const { rows } = await query(
      `UPDATE restaurants
          SET nome = $1, telefone = $2, endereco = $3, horario = $4,
              dias_retirada = $5, abre_as = $6, fecha_as = $7
        WHERE id = $8
        RETURNING id, nome, cnpj, telefone, endereco, horario, dias_retirada, abre_as, fecha_as, status, criado_em`,
      [
        data.nome, data.telefone, data.endereco, horarioTexto(data),
        data.dias_retirada, data.abre_as, data.fecha_as, req.restaurant.id,
      ],
    );
    audit('restaurant_updated', { userId: req.user.id, restaurantId: req.restaurant.id });
    res.json({ restaurante: serializeRestaurante(rows[0]) });
  });

  // ---- Público ----
  router.get('/', async (_req, res) => {
    const { rows } = await query(
      `SELECT ${PUBLIC_COLS} FROM restaurants WHERE status = 'aprovado' ORDER BY nome`,
    ); // CA-002-01
    res.json({ restaurantes: rows.map(serializeRestaurante) });
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await query(
      `SELECT ${PUBLIC_COLS} FROM restaurants WHERE id = $1 AND status = 'aprovado'`,
      [id],
    );
    if (!rows[0]) throw notFound('Restaurante não encontrado'); // CA-002-02
    res.json({ restaurante: serializeRestaurante(rows[0]) });
  });

  // CA-003-02 — catálogo: só disponíveis de restaurante aprovado, filtro opcional.
  router.get('/:id/meals', async (req, res) => {
    const id = parseId(req.params.id);
    const { categoria } = parse(
      z.object({ categoria: z.enum(CATEGORIAS).optional() }),
      req.query,
    );
    const rest = await query("SELECT 1 FROM restaurants WHERE id = $1 AND status = 'aprovado'", [id]);
    if (rest.rowCount === 0) throw notFound('Restaurante não encontrado');

    const { rows } = await query(
      `SELECT * FROM meals
       WHERE restaurant_id = $1 AND disponivel = TRUE AND ($2::text IS NULL OR categoria = $2)
       ORDER BY nome`,
      [id, categoria ?? null],
    );
    res.json({ marmitas: rows.map(serializeMeal) });
  });

  return router;
}

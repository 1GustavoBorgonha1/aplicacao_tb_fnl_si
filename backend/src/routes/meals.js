// Spec 003 — CRUD de marmitas do restaurante (com imagem).
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { badRequest, notFound } from '../errors.js';
import { audit } from '../logger.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { loadRestaurant } from '../middlewares/restaurant.js';
import { detectImageType, singleImage } from '../middlewares/upload.js';
import { storage } from '../storage/index.js';
import { parse, parseId, texto } from '../validate.js';

export const CATEGORIAS = ['tradicional', 'low_carb', 'vegana', 'vegetariana', 'sem_gluten'];

// Campos multipart chegam como string → coerção controlada.
const intOpcional = (max) =>
  z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? null : v),
    z.coerce.number().int().min(0).max(max).nullable(),
  );
const bool = z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean());

const mealSchema = z.object({
  nome: texto(2, 100),
  descricao: texto(0, 500).default(''),
  preco_centavos: z.coerce.number().int().min(1).max(100000), // CA-003-08
  kcal: intOpcional(5000).default(null),
  proteina_g: intOpcional(500).default(null),
  categoria: z.enum(CATEGORIAS),
  disponivel: bool.default(true),
  remover_imagem: bool.default(false),
});

export const serializeMeal = (m) => ({
  id: m.id,
  restaurant_id: m.restaurant_id,
  nome: m.nome,
  descricao: m.descricao,
  preco_centavos: m.preco_centavos,
  kcal: m.kcal,
  proteina_g: m.proteina_g,
  categoria: m.categoria,
  disponivel: m.disponivel,
  imagem_url: storage.url(m.imagem_key),
});

/** Valida a imagem pelo conteúdo e salva no storage. Retorna a key ou null. */
async function saveImage(file) {
  if (!file) return null;
  const ext = detectImageType(file.buffer); // CA-003-04
  if (!ext) throw badRequest('Imagem deve ser JPEG, PNG ou WEBP');
  return storage.save(file.buffer, ext);
}

export function mealsRouter() {
  const router = Router();
  router.use(requireAuth, requireRole('restaurante'), loadRestaurant());

  router.get('/mine', async (req, res) => {
    const { rows } = await query('SELECT * FROM meals WHERE restaurant_id = $1 ORDER BY nome', [
      req.restaurant.id,
    ]);
    res.json({ marmitas: rows.map(serializeMeal) });
  });

  router.post('/', singleImage, async (req, res) => {
    const data = parse(mealSchema, req.body);
    const key = await saveImage(req.file);
    try {
      const { rows } = await query(
        `INSERT INTO meals (restaurant_id, nome, descricao, preco_centavos, kcal, proteina_g, categoria, disponivel, imagem_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [req.restaurant.id, data.nome, data.descricao, data.preco_centavos, data.kcal, data.proteina_g,
          data.categoria, data.disponivel, key],
      );
      audit('meal_created', { userId: req.user.id, mealId: rows[0].id });
      res.status(201).json({ marmita: serializeMeal(rows[0]) });
    } catch (err) {
      await storage.remove(key); // não deixa arquivo órfão
      throw err;
    }
  });

  // Busca a marmita garantindo que pertence ao restaurante logado (CA-003-03).
  async function findOwn(req) {
    const id = parseId(req.params.id);
    const { rows } = await query('SELECT * FROM meals WHERE id = $1 AND restaurant_id = $2', [
      id,
      req.restaurant.id,
    ]);
    if (!rows[0]) throw notFound('Marmita não encontrada');
    return rows[0];
  }

  router.put('/:id', singleImage, async (req, res) => {
    const atual = await findOwn(req);
    const data = parse(mealSchema, req.body);
    const novaKey = await saveImage(req.file);
    const key = novaKey ?? (data.remover_imagem ? null : atual.imagem_key);

    try {
      const { rows } = await query(
        `UPDATE meals SET nome = $1, descricao = $2, preco_centavos = $3, kcal = $4, proteina_g = $5,
           categoria = $6, disponivel = $7, imagem_key = $8
         WHERE id = $9 AND restaurant_id = $10 RETURNING *`,
        [data.nome, data.descricao, data.preco_centavos, data.kcal, data.proteina_g, data.categoria,
          data.disponivel, key, atual.id, req.restaurant.id],
      );
      if (atual.imagem_key && atual.imagem_key !== key) await storage.remove(atual.imagem_key); // CA-003-06
      audit('meal_updated', { userId: req.user.id, mealId: atual.id });
      res.json({ marmita: serializeMeal(rows[0]) });
    } catch (err) {
      await storage.remove(novaKey);
      throw err;
    }
  });

  router.delete('/:id', async (req, res) => {
    const atual = await findOwn(req);
    // order_items.meal_id → ON DELETE SET NULL: histórico preservado (CA-003-07).
    await query('DELETE FROM meals WHERE id = $1 AND restaurant_id = $2', [atual.id, req.restaurant.id]);
    await storage.remove(atual.imagem_key);
    audit('meal_deleted', { userId: req.user.id, mealId: atual.id });
    res.status(204).end();
  });

  return router;
}

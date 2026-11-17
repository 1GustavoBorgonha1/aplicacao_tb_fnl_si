// Spec 003 — Marmitas.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, auth, createCliente, createMeal, createRestaurante, futuro, PNG, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const arquivo = (url) => path.join(process.env.UPLOAD_DIR, url.replace('/uploads/', ''));

describe('Spec 003 — Marmitas', () => {
  it('CA-003-01 restaurante cria marmita com imagem', async () => {
    const r = await createRestaurante();
    const res = await api()
      .post('/api/meals')
      .set(auth(r.token))
      .field({ nome: 'Tilápia com legumes', preco_centavos: '2990', categoria: 'sem_gluten', proteina_g: '35', descricao: 'Leve' })
      .attach('imagem', PNG, { filename: 'foto.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.marmita).toMatchObject({ nome: 'Tilápia com legumes', preco_centavos: 2990, proteina_g: 35, kcal: null });
    expect(res.body.marmita.imagem_url).toMatch(/^\/uploads\/meals\/[0-9a-f-]{36}\.png$/); // CA-003-05
    expect(existsSync(arquivo(res.body.marmita.imagem_url))).toBe(true);

    const img = await api().get(res.body.marmita.imagem_url);
    expect(img.status).toBe(200);
    expect(img.headers['x-content-type-options']).toBe('nosniff'); // RS-003-03
  });

  it('RS-003-03 imagem inexistente ou path traversal retorna 404, não 500', async () => {
    expect((await api().get('/uploads/meals/nao-existe.png')).status).toBe(404);
    const traversal = await api().get('/uploads/..%2f..%2fetc%2fpasswd');
    expect([403, 404]).toContain(traversal.status);
    expect(traversal.text).not.toContain('root:');
  });

  it('CA-003-01 cliente não pode criar marmita', async () => {
    const c = await createCliente();
    const res = await api().post('/api/meals').set(auth(c.token)).field({ nome: 'Xis Fit', preco_centavos: '100', categoria: 'vegana' });
    expect(res.status).toBe(403);
  });

  it('CA-003-02 catálogo mostra só disponíveis e filtra por categoria', async () => {
    const r = await createRestaurante();
    await createMeal(r.token, { nome: 'Arroz', categoria: 'vegana' });
    await createMeal(r.token, { nome: 'Batata', categoria: 'low_carb' });
    await createMeal(r.token, { nome: 'Couve', categoria: 'vegana', disponivel: 'false' });

    const todas = await api().get(`/api/restaurants/${r.restaurantId}/meals`);
    expect(todas.body.marmitas.map((m) => m.nome)).toEqual(['Arroz', 'Batata']);
    const veganas = await api().get(`/api/restaurants/${r.restaurantId}/meals?categoria=vegana`);
    expect(veganas.body.marmitas.map((m) => m.nome)).toEqual(['Arroz']);
    expect((await api().get(`/api/restaurants/${r.restaurantId}/meals?categoria=xpto`)).status).toBe(400);
  });

  it('CA-003-02 catálogo de restaurante pendente retorna 404', async () => {
    const r = await createRestaurante({ aprovar: false });
    await createMeal(r.token);
    expect((await api().get(`/api/restaurants/${r.restaurantId}/meals`)).status).toBe(404);
  });

  it('CA-003-03 restaurante A não edita nem remove marmita do B', async () => {
    const a = await createRestaurante();
    const b = await createRestaurante();
    const mealB = await createMeal(b.token);
    const put = await api().put(`/api/meals/${mealB.id}`).set(auth(a.token)).field({ nome: 'Hack', preco_centavos: '1', categoria: 'vegana' });
    expect(put.status).toBe(404);
    expect((await api().delete(`/api/meals/${mealB.id}`).set(auth(a.token))).status).toBe(404);
    const { rows } = await pool.query('SELECT nome FROM meals WHERE id = $1', [mealB.id]);
    expect(rows[0].nome).toBe('Frango com batata doce');
  });

  it('CA-003-04 rejeita arquivo que não é imagem, mesmo com Content-Type de imagem', async () => {
    const r = await createRestaurante();
    const res = await api()
      .post('/api/meals')
      .set(auth(r.token))
      .field({ nome: 'Xis Fit', preco_centavos: '100', categoria: 'vegana' })
      .attach('imagem', Buffer.from('<?php system($_GET["c"]); ?>'), { filename: 'shell.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    const { rowCount } = await pool.query('SELECT 1 FROM meals');
    expect(rowCount).toBe(0);
  });

  it('CA-003-04 rejeita imagem maior que 2 MB', async () => {
    const r = await createRestaurante();
    const grande = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024 + 10)]);
    const res = await api()
      .post('/api/meals')
      .set(auth(r.token))
      .field({ nome: 'Xis Fit', preco_centavos: '100', categoria: 'vegana' })
      .attach('imagem', grande, 'grande.png');
    expect(res.status).toBe(400);
  });

  it('CA-003-06 trocar e remover apaga o arquivo antigo', async () => {
    const r = await createRestaurante();
    const criada = await api()
      .post('/api/meals')
      .set(auth(r.token))
      .field({ nome: 'Xis Fit', preco_centavos: '100', categoria: 'vegana' })
      .attach('imagem', PNG, 'a.png');
    const antiga = criada.body.marmita.imagem_url;

    const editada = await api()
      .put(`/api/meals/${criada.body.marmita.id}`)
      .set(auth(r.token))
      .field({ nome: 'Xis Fit 2', preco_centavos: '200', categoria: 'vegana' })
      .attach('imagem', PNG, 'b.png');
    expect(editada.status).toBe(200);
    const nova = editada.body.marmita.imagem_url;
    expect(nova).not.toBe(antiga);
    expect(existsSync(arquivo(antiga))).toBe(false);

    expect((await api().delete(`/api/meals/${criada.body.marmita.id}`).set(auth(r.token))).status).toBe(204);
    expect(existsSync(arquivo(nova))).toBe(false);
  });

  it('CA-003-07 remover marmita preserva o histórico do pedido', async () => {
    const r = await createRestaurante();
    const meal = await createMeal(r.token);
    const c = await createCliente();
    const pedido = await api()
      .post('/api/orders')
      .set(auth(c.token))
      .send({ restaurant_id: r.restaurantId, retirada_em: futuro(), itens: [{ meal_id: meal.id, qtd: 2 }] });
    expect(pedido.status).toBe(201);

    await api().delete(`/api/meals/${meal.id}`).set(auth(r.token));
    const mine = await api().get('/api/orders/mine').set(auth(c.token));
    expect(mine.body.pedidos[0].itens[0]).toMatchObject({ meal_id: null, nome: 'Frango com batata doce', qtd: 2 });
  });

  it.each(['0', '-5', '100001', 'abc'])('CA-003-08 preço inválido "%s" retorna 400', async (preco) => {
    const r = await createRestaurante();
    const res = await api().post('/api/meals').set(auth(r.token)).field({ nome: 'Xis Fit', preco_centavos: preco, categoria: 'vegana' });
    expect(res.status).toBe(400);
  });
});

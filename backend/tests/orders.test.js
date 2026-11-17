// Spec 004 — Pedidos para retirada.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, auth, createCliente, createMeal, createRestaurante, futuro, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

async function cenario() {
  const r = await createRestaurante();
  const m1 = await createMeal(r.token, { nome: 'M1', preco_centavos: '2000' });
  const m2 = await createMeal(r.token, { nome: 'M2', preco_centavos: '1550' });
  const c = await createCliente();
  return { r, m1, m2, c };
}

const novoPedido = (token, body) => api().post('/api/orders').set(auth(token)).send(body);
const setStatus = (token, id, status) => api().patch(`/api/orders/${id}/status`).set(auth(token)).send({ status });

describe('Spec 004 — Pedidos', () => {
  it('CA-004-01 total é calculado no servidor e preço enviado é ignorado', async () => {
    const { r, m1, m2, c } = await cenario();
    const res = await novoPedido(c.token, {
      restaurant_id: r.restaurantId,
      retirada_em: futuro(),
      observacao: 'Sem cebola',
      total_centavos: 1,
      itens: [{ meal_id: m1.id, qtd: 2, preco_unit_centavos: 1 }, { meal_id: m2.id, qtd: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.pedido.total_centavos).toBe(2000 * 2 + 1550);
    expect(res.body.pedido.status).toBe('recebido');
    expect(res.body.pedido.itens).toHaveLength(2);
  });

  it('CA-004-02 marmita de outro restaurante ou indisponível retorna 400', async () => {
    const { r, m1, c } = await cenario();
    const outro = await createRestaurante();
    const mOutro = await createMeal(outro.token);
    const misturado = await novoPedido(c.token, {
      restaurant_id: r.restaurantId, retirada_em: futuro(),
      itens: [{ meal_id: m1.id, qtd: 1 }, { meal_id: mOutro.id, qtd: 1 }],
    });
    expect(misturado.status).toBe(400);

    const indisp = await createMeal(r.token, { disponivel: 'false' });
    const res = await novoPedido(c.token, { restaurant_id: r.restaurantId, retirada_em: futuro(), itens: [{ meal_id: indisp.id, qtd: 1 }] });
    expect(res.status).toBe(400);
    expect((await pool.query('SELECT 1 FROM orders')).rowCount).toBe(0);
  });

  it.each([[0], [21]])('CA-004-03 quantidade %i é inválida', async (qtd) => {
    const { r, m1, c } = await cenario();
    const res = await novoPedido(c.token, { restaurant_id: r.restaurantId, retirada_em: futuro(), itens: [{ meal_id: m1.id, qtd }] });
    expect(res.status).toBe(400);
  });

  it('CA-004-03 pedido sem itens é inválido', async () => {
    const { r, c } = await cenario();
    expect((await novoPedido(c.token, { restaurant_id: r.restaurantId, retirada_em: futuro(), itens: [] })).status).toBe(400);
  });

  it.each([[10], [60 * 24 * 8], [-60]])('CA-004-04 retirada em %i min é inválida', async (min) => {
    const { r, m1, c } = await cenario();
    const res = await novoPedido(c.token, { restaurant_id: r.restaurantId, retirada_em: futuro(min), itens: [{ meal_id: m1.id, qtd: 1 }] });
    expect(res.status).toBe(400);
  });

  it('CA-004-05 cliente vê só os próprios pedidos e não cancela o de outro', async () => {
    const { r, m1, c } = await cenario();
    const outro = await createCliente();
    const p = await novoPedido(c.token, { restaurant_id: r.restaurantId, retirada_em: futuro(), itens: [{ meal_id: m1.id, qtd: 1 }] });

    expect((await api().get('/api/orders/mine').set(auth(outro.token))).body.pedidos).toHaveLength(0);
    expect((await api().patch(`/api/orders/${p.body.pedido.id}/cancel`).set(auth(outro.token))).status).toBe(404);
  });

  it('CA-004-06 restaurante vê e altera só pedidos da própria empresa', async () => {
    const { r, m1, c } = await cenario();
    const outro = await createRestaurante();
    const p = await novoPedido(c.token, { restaurant_id: r.restaurantId, retirada_em: futuro(), itens: [{ meal_id: m1.id, qtd: 1 }] });

    expect((await api().get('/api/orders/received').set(auth(r.token))).body.pedidos).toHaveLength(1);
    expect((await api().get('/api/orders/received').set(auth(outro.token))).body.pedidos).toHaveLength(0);
    expect((await setStatus(outro.token, p.body.pedido.id, 'em_preparo')).status).toBe(404);
  });

  it('CA-004-07 segue a máquina de estados até retirado', async () => {
    const { r, m1, c } = await cenario();
    const { body } = await novoPedido(c.token, { restaurant_id: r.restaurantId, retirada_em: futuro(), itens: [{ meal_id: m1.id, qtd: 1 }] });
    const id = body.pedido.id;

    expect((await setStatus(r.token, id, 'retirado')).status).toBe(409);
    for (const s of ['em_preparo', 'pronto_retirada', 'retirado']) {
      const res = await setStatus(r.token, id, s);
      expect(res.status).toBe(200);
      expect(res.body.pedido.status).toBe(s);
    }
    expect((await setStatus(r.token, id, 'cancelado')).status).toBe(409);
    const filtrados = await api().get('/api/orders/received?status=retirado').set(auth(r.token));
    expect(filtrados.body.pedidos).toHaveLength(1);
  });

  it('CA-004-08 cliente cancela apenas em recebido', async () => {
    const { r, m1, c } = await cenario();
    const p1 = await novoPedido(c.token, { restaurant_id: r.restaurantId, retirada_em: futuro(), itens: [{ meal_id: m1.id, qtd: 1 }] });
    const ok = await api().patch(`/api/orders/${p1.body.pedido.id}/cancel`).set(auth(c.token));
    expect(ok.status).toBe(200);
    expect(ok.body.pedido.status).toBe('cancelado');

    const p2 = await novoPedido(c.token, { restaurant_id: r.restaurantId, retirada_em: futuro(), itens: [{ meal_id: m1.id, qtd: 1 }] });
    await setStatus(r.token, p2.body.pedido.id, 'em_preparo');
    expect((await api().patch(`/api/orders/${p2.body.pedido.id}/cancel`).set(auth(c.token))).status).toBe(409);
  });

  it('CA-004-09 itens repetidos são somados e gravados de forma atômica', async () => {
    const { r, m1, c } = await cenario();
    const res = await novoPedido(c.token, {
      restaurant_id: r.restaurantId, retirada_em: futuro(),
      itens: [{ meal_id: m1.id, qtd: 2 }, { meal_id: m1.id, qtd: 3 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.pedido.itens).toEqual([expect.objectContaining({ meal_id: m1.id, qtd: 5 })]);
    expect(res.body.pedido.total_centavos).toBe(10000);
  });

  it('restaurante não pode fazer pedido', async () => {
    const { r, m1 } = await cenario();
    expect((await novoPedido(r.token, { restaurant_id: r.restaurantId, retirada_em: futuro(), itens: [{ meal_id: m1.id, qtd: 1 }] })).status).toBe(403);
  });
});

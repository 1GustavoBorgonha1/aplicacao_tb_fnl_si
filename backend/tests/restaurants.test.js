// Spec 002 — Restaurantes.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, auth, createCliente, createRestaurante, loginAdmin, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('Spec 002 — Restaurantes', () => {
  it('CA-002-01 lista apenas restaurantes aprovados', async () => {
    const aprovado = await createRestaurante();
    await createRestaurante({ aprovar: false });
    const res = await api().get('/api/restaurants');
    expect(res.status).toBe(200);
    expect(res.body.restaurantes.map((r) => r.id)).toEqual([aprovado.restaurantId]);
  });

  it('CA-002-02 detalhe de restaurante pendente retorna 404', async () => {
    const pendente = await createRestaurante({ aprovar: false });
    expect((await api().get(`/api/restaurants/${pendente.restaurantId}`)).status).toBe(404);
    expect((await api().get('/api/restaurants/abc')).status).toBe(400);
  });

  it('CA-002-03 restaurante edita só os próprios dados e não altera cnpj/status', async () => {
    const r = await createRestaurante({ aprovar: false });
    const res = await api()
      .put('/api/restaurants/me')
      .set(auth(r.token))
      .send({ nome: 'Novo Nome', telefone: '4733330000', endereco: 'Av. Brasil, 1', horario: '10h-15h', cnpj: '00000000000000', status: 'aprovado' });
    expect(res.status).toBe(200);
    expect(res.body.restaurante.nome).toBe('Novo Nome');
    expect(res.body.restaurante.status).toBe('pendente');
    expect(res.body.restaurante.cnpj).not.toBe('00000000000000');
  });

  it('CA-002-03 cliente não acessa /restaurants/me', async () => {
    const c = await createCliente();
    expect((await api().get('/api/restaurants/me').set(auth(c.token))).status).toBe(403);
  });

  it('CA-002-04 restaurante bloqueado recebe 403 na gestão, mas vê o status', async () => {
    const r = await createRestaurante();
    const admin = await loginAdmin();
    await api().patch(`/api/admin/restaurants/${r.restaurantId}/status`).set(auth(admin)).send({ status: 'bloqueado' });

    expect((await api().get('/api/meals/mine').set(auth(r.token))).status).toBe(403);
    expect((await api().get('/api/orders/received').set(auth(r.token))).status).toBe(403);
    const me = await api().get('/api/restaurants/me').set(auth(r.token));
    expect(me.status).toBe(200);
    expect(me.body.restaurante.status).toBe('bloqueado');
  });

  it('CA-002-05 listagem pública não expõe CNPJ nem e-mail', async () => {
    await createRestaurante();
    const res = await api().get('/api/restaurants');
    const r = res.body.restaurantes[0];
    expect(r.cnpj).toBeUndefined();
    expect(r.user_id).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('@');
  });
});

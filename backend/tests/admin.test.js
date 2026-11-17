// Spec 005 — Painel administrativo.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, auth, createCliente, createMeal, createRestaurante, loginAdmin, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('Spec 005 — Admin', () => {
  it('CA-005-01 restaurante e cliente recebem 403 em todas as rotas admin', async () => {
    const r = await createRestaurante();
    const c = await createCliente();
    const rotas = ['/api/admin/stats', '/api/admin/restaurants', '/api/admin/users', '/api/admin/orders', '/api/admin/meals'];
    for (const token of [r.token, c.token]) {
      for (const rota of rotas) expect((await api().get(rota).set(auth(token))).status).toBe(403);
    }
  });

  it('CA-005-02 aprovar empresa a torna visível', async () => {
    const r = await createRestaurante({ aprovar: false });
    expect((await api().get('/api/restaurants')).body.restaurantes).toHaveLength(0);
    const admin = await loginAdmin();
    const pend = await api().get('/api/admin/restaurants?status=pendente').set(auth(admin));
    expect(pend.body.restaurantes[0]).toMatchObject({ id: r.restaurantId, dono_email: r.email });

    await api().patch(`/api/admin/restaurants/${r.restaurantId}/status`).set(auth(admin)).send({ status: 'aprovado' });
    expect((await api().get('/api/restaurants')).body.restaurantes).toHaveLength(1);
  });

  it('CA-005-03 bloquear empresa a remove da listagem', async () => {
    const r = await createRestaurante();
    const admin = await loginAdmin();
    await api().patch(`/api/admin/restaurants/${r.restaurantId}/status`).set(auth(admin)).send({ status: 'bloqueado' });
    expect((await api().get('/api/restaurants')).body.restaurantes).toHaveLength(0);
    expect((await api().patch(`/api/admin/restaurants/${r.restaurantId}/status`).set(auth(admin)).send({ status: 'xpto' })).status).toBe(400);
  });

  it('CA-005-04 desativar usuário corta o acesso; reativar devolve', async () => {
    const c = await createCliente();
    const admin = await loginAdmin();
    const users = await api().get('/api/admin/users?role=cliente').set(auth(admin));
    const id = users.body.usuarios[0].id;
    expect(users.body.usuarios[0].senha_hash).toBeUndefined();

    await api().patch(`/api/admin/users/${id}/ativo`).set(auth(admin)).send({ ativo: false });
    expect((await api().get('/api/auth/me').set(auth(c.token))).status).toBe(403);
    await api().patch(`/api/admin/users/${id}/ativo`).set(auth(admin)).send({ ativo: true });
    expect((await api().get('/api/auth/me').set(auth(c.token))).status).toBe(200);
  });

  it('CA-005-05 admin não desativa a si mesmo', async () => {
    const admin = await loginAdmin();
    const me = await api().get('/api/auth/me').set(auth(admin));
    const res = await api().patch(`/api/admin/users/${me.body.user.id}/ativo`).set(auth(admin)).send({ ativo: false });
    expect(res.status).toBe(400);
  });

  it('HU-005-03 admin vê marmitas e pedidos e modera marmita', async () => {
    const r = await createRestaurante();
    const meal = await createMeal(r.token);
    const admin = await loginAdmin();

    const meals = await api().get('/api/admin/meals').set(auth(admin));
    expect(meals.body.marmitas[0]).toMatchObject({ id: meal.id, restaurante_nome: expect.any(String) });
    await api().patch(`/api/admin/meals/${meal.id}`).set(auth(admin)).send({ disponivel: false });
    expect((await api().get(`/api/restaurants/${r.restaurantId}/meals`)).body.marmitas).toHaveLength(0);

    expect((await api().get('/api/admin/orders').set(auth(admin))).status).toBe(200);
  });

  it('HU-005-04 estatísticas', async () => {
    await createRestaurante({ aprovar: false });
    await createCliente();
    const admin = await loginAdmin();
    const res = await api().get('/api/admin/stats').set(auth(admin));
    expect(res.body.usuarios).toMatchObject({ admin: 1, cliente: 1, restaurante: 1 });
    expect(res.body.restaurantes).toMatchObject({ pendente: 1 });
  });
});

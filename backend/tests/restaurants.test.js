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

  const dados = (extra = {}) => ({ nome: 'Fit Horário', telefone: '47999990000', endereco: 'Rua A, 100', ...extra });

  it('CA-002-06 cadastro com horário estruturado gera o texto no servidor (horario enviado é ignorado)', async () => {
    const res = await api()
      .post('/api/auth/register/restaurante')
      .send({
        nome: 'Dona Ana',
        email: 'ana@fit.com',
        senha: 'Senha123',
        restaurante: {
          ...dados(),
          cnpj: '11222333000144',
          horario: '<b>texto livre</b>',
          dias_retirada: [1, 2, 3, 4, 5],
          abre_as: '11:00',
          fecha_as: '14:00',
        },
      });
    expect(res.status).toBe(201);
    const login = await api().post('/api/auth/login').send({ email: 'ana@fit.com', senha: 'Senha123' });
    const me = await api().get('/api/restaurants/me').set(auth(login.body.token));
    expect(me.body.restaurante).toMatchObject({
      dias_retirada: [1, 2, 3, 4, 5],
      abre_as: '11:00',
      fecha_as: '14:00',
      horario: 'Seg a Sex · 11:00–14:00',
    });
  });

  it.each([
    [[1, 3, 5], 'Seg, Qua, Sex · 10:00–15:30'],
    [[0, 1, 2, 3, 4, 5, 6], 'Todos os dias · 10:00–15:30'],
    [[6, 0], 'Dom, Sáb · 10:00–15:30'],
  ])('CA-002-06 edição com dias %j gera "%s"', async (dias, texto) => {
    const r = await createRestaurante();
    const res = await api()
      .put('/api/restaurants/me')
      .set(auth(r.token))
      .send(dados({ dias_retirada: dias, abre_as: '10:00', fecha_as: '15:30' }));
    expect(res.status).toBe(200);
    expect(res.body.restaurante).toMatchObject({ abre_as: '10:00', fecha_as: '15:30', horario: texto });
    // A listagem pública traz os campos estruturados.
    const pub = await api().get(`/api/restaurants/${r.restaurantId}`);
    expect(pub.body.restaurante).toMatchObject({ abre_as: '10:00', fecha_as: '15:30', horario: texto });
  });

  it('CA-002-06 sem abertura/fechamento o restaurante fica sem horário configurado', async () => {
    const r = await createRestaurante();
    const res = await api().put('/api/restaurants/me').set(auth(r.token)).send(dados({ abre_as: '', fecha_as: '' }));
    expect(res.status).toBe(200);
    expect(res.body.restaurante).toMatchObject({ abre_as: null, fecha_as: null, horario: '', dias_retirada: [1, 2, 3, 4, 5] });
  });

  it.each([
    ['abertura depois do fechamento', { abre_as: '15:00', fecha_as: '11:00' }],
    ['abertura igual ao fechamento', { abre_as: '11:00', fecha_as: '11:00' }],
    ['só a abertura', { abre_as: '11:00' }],
    ['hora fora do formato', { abre_as: '25:00', fecha_as: '26:00' }],
    ['dia fora de 0–6', { dias_retirada: [7], abre_as: '11:00', fecha_as: '14:00' }],
    ['dia repetido', { dias_retirada: [1, 1], abre_as: '11:00', fecha_as: '14:00' }],
    ['nenhum dia', { dias_retirada: [], abre_as: '11:00', fecha_as: '14:00' }],
  ])('CA-002-07 %s → 400', async (_caso, extra) => {
    const r = await createRestaurante();
    const res = await api().put('/api/restaurants/me').set(auth(r.token)).send(dados(extra));
    expect(res.status).toBe(400);
  });
});

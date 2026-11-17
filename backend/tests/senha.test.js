// Spec 006 — Troca de senha.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { api, auth, createCliente, createRestaurante, login, loginAdmin, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const trocar = (token, body, app) =>
  (app ? request(app) : api()).patch('/api/auth/senha').set(auth(token)).send(body);

describe('Spec 006 — Troca de senha', () => {
  it('CA-006-01 cliente troca a senha: nova funciona, antiga não', async () => {
    const { email, token } = await createCliente();
    const res = await trocar(token, { senha_atual: 'Senha123', nova_senha: 'NovaSenha456' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');

    expect(await login(email, 'NovaSenha456')).toBeTypeOf('string');
    const antiga = await api().post('/api/auth/login').send({ email, senha: 'Senha123' });
    expect(antiga.status).toBe(401);
  });

  it('CA-006-01 restaurante e admin também trocam a senha', async () => {
    const rest = await createRestaurante({ aprovar: false });
    expect((await trocar(rest.token, { senha_atual: 'Senha123', nova_senha: 'Outra1234' })).status).toBe(200);

    const admin = await loginAdmin();
    const res = await trocar(admin, { senha_atual: process.env.ADMIN_PASSWORD, nova_senha: 'AdminNova999' });
    expect(res.status).toBe(200);
    expect(await login(process.env.ADMIN_EMAIL, 'AdminNova999')).toBeTypeOf('string');
  });

  it('CA-006-02 senha atual incorreta retorna 400 e não altera a senha', async () => {
    const { email, token } = await createCliente();
    const res = await trocar(token, { senha_atual: 'Errada999', nova_senha: 'NovaSenha456' });
    expect(res.status).toBe(400);
    expect(res.body.detalhes.senha_atual).toBeDefined();
    expect(await login(email, 'Senha123')).toBeTypeOf('string');
    // O token continua válido (falha não derruba a sessão)
    expect((await api().get('/api/auth/me').set(auth(token))).status).toBe(200);
  });

  it.each(['curta1', 'semnumeros', '12345678', 'a1'.repeat(37)])(
    'CA-006-03 nova senha fora da política "%s" retorna 400',
    async (nova) => {
      const { token } = await createCliente();
      const res = await trocar(token, { senha_atual: 'Senha123', nova_senha: nova });
      expect(res.status).toBe(400);
      expect(res.body.detalhes.nova_senha).toBeDefined();
    },
  );

  it('CA-006-04 nova senha igual à atual retorna 400', async () => {
    const { token } = await createCliente();
    const res = await trocar(token, { senha_atual: 'Senha123', nova_senha: 'Senha123' });
    expect(res.status).toBe(400);
    expect(res.body.detalhes.nova_senha).toBeDefined();
  });

  it('CA-006-05 tokens anteriores à troca deixam de valer; o novo vale', async () => {
    const { email, token } = await createCliente();
    const outraSessao = await login(email, 'Senha123');

    const res = await trocar(token, { senha_atual: 'Senha123', nova_senha: 'NovaSenha456' });
    expect(res.status).toBe(200);

    expect((await api().get('/api/auth/me').set(auth(token))).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth(outraSessao))).status).toBe(401);
    const me = await api().get('/api/auth/me').set(auth(res.body.token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  it('CA-006-06 sem token ou com token inválido retorna 401', async () => {
    const body = { senha_atual: 'Senha123', nova_senha: 'NovaSenha456' };
    expect((await api().patch('/api/auth/senha').send(body)).status).toBe(401);
    expect((await trocar('abc.def.ghi', body)).status).toBe(401);
  });

  it('CA-006-07 excesso de tentativas com senha errada retorna 429', async () => {
    const limited = createApp({ loginLimit: 3, loginWindowMin: 15 });
    const { token } = await createCliente();
    const errada = { senha_atual: 'Errada999', nova_senha: 'NovaSenha456' };
    for (let i = 0; i < 3; i++) expect((await trocar(token, errada, limited)).status).toBe(400);
    expect((await trocar(token, errada, limited)).status).toBe(429);
  });

  it('CA-006-07 o limite é por usuário: outro usuário não é afetado', async () => {
    const limited = createApp({ loginLimit: 2, loginWindowMin: 15 });
    const a = await createCliente();
    const b = await createCliente();
    const errada = { senha_atual: 'Errada999', nova_senha: 'NovaSenha456' };
    for (let i = 0; i < 2; i++) await trocar(a.token, errada, limited);
    expect((await trocar(a.token, errada, limited)).status).toBe(429);
    expect((await trocar(b.token, { senha_atual: 'Senha123', nova_senha: 'NovaSenha456' }, limited)).status).toBe(200);
  });

  it('RS-006-06 campos extras (role) são ignorados', async () => {
    const { email, token } = await createCliente();
    await trocar(token, { senha_atual: 'Senha123', nova_senha: 'NovaSenha456', role: 'admin' });
    const { rows } = await pool.query('SELECT role FROM users WHERE email = $1', [email]);
    expect(rows[0].role).toBe('cliente');
  });

  it('token antigo sem claim "tv" continua valendo enquanto a senha não muda', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const { email } = await createCliente();
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const legado = jwt.sign({ sub: String(rows[0].id), role: 'cliente' }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '5m',
      issuer: 'marmifit',
    });
    expect((await api().get('/api/auth/me').set(auth(legado))).status).toBe(200);
  });
});

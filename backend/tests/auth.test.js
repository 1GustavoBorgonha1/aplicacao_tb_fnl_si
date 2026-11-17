// Spec 001 — Autenticação e controle de acesso.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { api, auth, createCliente, loginAdmin, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const empresa = (over = {}) => ({
  nome: 'Maria',
  email: 'maria@fit.com',
  senha: 'Senha123',
  restaurante: { nome: 'Fit da Maria', cnpj: '12.345.678/0001-90', telefone: '(47) 99999-0000', endereco: 'Rua das Flores, 10', horario: '11h às 14h' },
  ...over,
});

describe('Spec 001 — Autenticação', () => {
  it('CA-001-01 cadastra cliente com role=cliente', async () => {
    const res = await api().post('/api/auth/register/cliente').send({ nome: 'João', email: ' Joao@Teste.com ', senha: 'Senha123' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'cliente', email: 'joao@teste.com' });
    expect(res.body.user.senha_hash).toBeUndefined();
  });

  it('CA-001-02 cadastra empresa com restaurante pendente', async () => {
    const res = await api().post('/api/auth/register/restaurante').send(empresa());
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('restaurante');
    expect(res.body.restaurante.status).toBe('pendente');
    const { rows } = await pool.query('SELECT cnpj, telefone FROM restaurants');
    expect(rows[0]).toEqual({ cnpj: '12345678000190', telefone: '47999990000' });
  });

  it('CA-001-03 e-mail ou CNPJ duplicado retorna 409', async () => {
    await api().post('/api/auth/register/restaurante').send(empresa());
    const dupEmail = await api().post('/api/auth/register/cliente').send({ nome: 'Xavier', email: 'maria@fit.com', senha: 'Senha123' });
    expect(dupEmail.status).toBe(409);
    const dupCnpj = await api().post('/api/auth/register/restaurante').send(empresa({ email: 'outra@fit.com' }));
    expect(dupCnpj.status).toBe(409);
    // A transação não deixou usuário órfão
    const { rowCount } = await pool.query("SELECT 1 FROM users WHERE email = 'outra@fit.com'");
    expect(rowCount).toBe(0);
  });

  it.each(['curta1', 'semnumeros', '12345678'])('CA-001-04 senha fraca "%s" retorna 400', async (senha) => {
    const res = await api().post('/api/auth/register/cliente').send({ nome: 'João', email: 'j@t.com', senha });
    expect(res.status).toBe(400);
    expect(res.body.detalhes.senha).toBeDefined();
  });

  it('CA-001-05 login correto retorna token sem senha_hash', async () => {
    const { email } = await createCliente();
    const res = await api().post('/api/auth/login').send({ email, senha: 'Senha123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.senha_hash).toBeUndefined();
  });

  it('CA-001-06 login incorreto tem a mesma mensagem para e-mail inexistente e senha errada', async () => {
    const { email } = await createCliente();
    const a = await api().post('/api/auth/login').send({ email, senha: 'Errada123' });
    const b = await api().post('/api/auth/login').send({ email: 'naoexiste@x.com', senha: 'Errada123' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('CA-001-06 payload de SQL injection no login não autentica', async () => {
    const res = await api().post('/api/auth/login').send({ email: "' OR 1=1 --", senha: "' OR '1'='1" });
    expect([400, 401]).toContain(res.status);
    expect(res.body.token).toBeUndefined();
  });

  it('CA-001-07 rota protegida sem token ou com token inválido retorna 401', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth('abc.def.ghi'))).status).toBe(401);
  });

  it('CA-001-07 token com alg "none" é rejeitado', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '1', role: 'admin', iss: 'marmifit' })}.`;
    expect((await api().get('/api/admin/stats').set(auth(forged))).status).toBe(401);
  });

  it('CA-001-08 cliente acessando rota de admin retorna 403', async () => {
    const { token } = await createCliente();
    expect((await api().get('/api/admin/stats').set(auth(token))).status).toBe(403);
  });

  it('CA-001-09 usuário desativado não loga e token antigo para de valer', async () => {
    const { email, token } = await createCliente();
    const admin = await loginAdmin();
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    await api().patch(`/api/admin/users/${rows[0].id}/ativo`).set(auth(admin)).send({ ativo: false });

    expect((await api().get('/api/auth/me').set(auth(token))).status).toBe(403);
    expect((await api().post('/api/auth/login').send({ email, senha: 'Senha123' })).status).toBe(403);
  });

  it('CA-001-10 excesso de tentativas de login retorna 429', async () => {
    const limited = createApp({ loginLimit: 3, loginWindowMin: 15 });
    const tentativa = () => request(limited).post('/api/auth/login').send({ email: 'x@x.com', senha: 'Errada123' });
    for (let i = 0; i < 3; i++) expect((await tentativa()).status).toBe(401);
    expect((await tentativa()).status).toBe(429);
  });

  it('CA-001-11 campo role do body é ignorado no cadastro', async () => {
    const res = await api().post('/api/auth/register/cliente').send({ nome: 'Hacker', email: 'h@x.com', senha: 'Senha123', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('cliente');
  });

  it('GET /me de restaurante inclui status da empresa', async () => {
    await api().post('/api/auth/register/restaurante').send(empresa());
    const login = await api().post('/api/auth/login').send({ email: 'maria@fit.com', senha: 'Senha123' });
    const me = await api().get('/api/auth/me').set(auth(login.body.token));
    expect(me.body.restaurante.status).toBe('pendente');
  });

  it('health check responde ok', async () => {
    expect((await api().get('/api/health')).body).toEqual({ status: 'ok' });
  });

  it('JSON malformado retorna 400 e não vaza stack', async () => {
    const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });
});

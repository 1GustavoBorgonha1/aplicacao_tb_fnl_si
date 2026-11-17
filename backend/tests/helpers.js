import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { seedAdmin } from '../src/db/seed.js';

export const app = createApp();
export const api = () => request(app);

/** Limpa o banco e recria o admin. Usar em beforeEach. */
export async function resetDb() {
  await pool.query('TRUNCATE order_items, orders, meals, restaurants, users RESTART IDENTITY CASCADE');
  await seedAdmin();
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

let seq = 0;
const unique = () => `${Date.now()}${++seq}`;

export async function login(email, senha) {
  const res = await api().post('/api/auth/login').send({ email, senha });
  return res.body.token;
}

export const loginAdmin = () => login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);

export async function createCliente() {
  const email = `cliente${unique()}@teste.com`;
  await api().post('/api/auth/register/cliente').send({ nome: 'Cliente Teste', email, senha: 'Senha123' });
  return { email, token: await login(email, 'Senha123') };
}

/** Cria restaurante (aprovado por padrão, via admin). */
export async function createRestaurante({ aprovar = true } = {}) {
  const email = `rest${unique()}@teste.com`;
  const cnpj = String(unique()).padStart(14, '0').slice(-14);
  const res = await api()
    .post('/api/auth/register/restaurante')
    .send({
      nome: 'Dono Teste',
      email,
      senha: 'Senha123',
      restaurante: { nome: `Fit ${cnpj}`, cnpj, telefone: '47999990000', endereco: 'Rua A, 100', horario: '11h-14h' },
    });
  const restaurantId = res.body.restaurante.id;
  if (aprovar) {
    const admin = await loginAdmin();
    await api().patch(`/api/admin/restaurants/${restaurantId}/status`).set(auth(admin)).send({ status: 'aprovado' });
  }
  return { email, restaurantId, userId: res.body.user.id, token: await login(email, 'Senha123') };
}

export async function createMeal(token, campos = {}) {
  const res = await api()
    .post('/api/meals')
    .set(auth(token))
    .field({ nome: 'Frango com batata doce', preco_centavos: '2590', categoria: 'low_carb', kcal: '450', ...campos });
  return res.body.marmita;
}

export const futuro = (min = 120) => new Date(Date.now() + min * 60_000).toISOString();

// PNG 1x1 válido
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

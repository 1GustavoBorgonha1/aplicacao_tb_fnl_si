// Tela de login: sucesso grava o token e redireciona; erro aparece para o usuário.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { tokenStore } from '../src/api.js';
import Login from '../src/pages/Login.jsx';
import { mockFetch, renderComRotas, resposta } from './helpers.jsx';

async function preencher(user, email, senha) {
  await user.type(screen.getByLabelText('E-mail'), email);
  await user.type(screen.getByLabelText('Senha'), senha);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('Login', () => {
  it('login correto grava o token e leva para a área do perfil', async () => {
    const user = userEvent.setup();
    const fetch = mockFetch({
      'POST /auth/login': resposta(200, { token: 'novo-token' }),
      'GET /auth/me': resposta(200, { user: { id: 1, nome: 'Rest', email: 'r@r.com', role: 'restaurante' } }),
    });
    renderComRotas(<Login />, { rota: '/login', caminho: '/login' });
    await preencher(user, 'r@r.com', 'Senha123');

    expect(await screen.findByTestId('rota')).toHaveTextContent('/restaurante');
    expect(tokenStore.get()).toBe('novo-token');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email: 'r@r.com', senha: 'Senha123' });
  });

  it('login errado mostra a mensagem do servidor e não grava token', async () => {
    const user = userEvent.setup();
    mockFetch({ 'POST /auth/login': resposta(401, { erro: 'E-mail ou senha inválidos' }) });
    renderComRotas(<Login />, { rota: '/login', caminho: '/login' });
    await preencher(user, 'x@x.com', 'Errada123');

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos');
    expect(tokenStore.get()).toBeNull();
  });

  it('excesso de tentativas (429) também é mostrado', async () => {
    const user = userEvent.setup();
    mockFetch({ 'POST /auth/login': resposta(429, { erro: 'Muitas tentativas. Tente novamente mais tarde.' }) });
    renderComRotas(<Login />, { rota: '/login', caminho: '/login' });
    await preencher(user, 'x@x.com', 'Errada123');
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');
  });
});

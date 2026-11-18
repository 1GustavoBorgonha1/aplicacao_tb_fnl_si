// Spec 006 — tela Minha conta (troca de senha).
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { tokenStore } from '../src/api.js';
import { Protected } from '../src/auth.jsx';
import MinhaConta from '../src/pages/MinhaConta.jsx';
import { mockFetch, renderComRotas, resposta } from './helpers.jsx';

const ME = resposta(200, { user: { id: 7, nome: 'Bia', email: 'bia@fit.com', role: 'cliente' } });

async function preencher(user, atual, nova, confirmar = nova) {
  await user.type(screen.getByLabelText('Senha atual'), atual);
  await user.type(screen.getByLabelText(/^Nova senha/), nova);
  await user.type(screen.getByLabelText('Confirmar nova senha'), confirmar);
  await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
}

describe('Minha conta', () => {
  beforeEach(() => tokenStore.set('token-antigo'));

  it('mostra nome e e-mail do usuário logado', async () => {
    mockFetch({ 'GET /auth/me': ME });
    renderComRotas(<Protected><MinhaConta /></Protected>, { rota: '/conta', caminho: '/conta' });
    expect(await screen.findByText(/bia@fit\.com/)).toBeInTheDocument();
  });

  it('CA-006-01 troca com sucesso: grava o novo token e avisa que as outras sessões caíram', async () => {
    const user = userEvent.setup();
    const fetch = mockFetch({ 'GET /auth/me': ME, 'PATCH /auth/senha': resposta(200, { token: 'token-novo' }) });
    renderComRotas(<Protected><MinhaConta /></Protected>, { rota: '/conta', caminho: '/conta' });
    await screen.findByText(/bia@fit\.com/);
    await preencher(user, 'Senha123', 'NovaSenha456');

    expect(await screen.findByRole('status')).toHaveTextContent('Senha alterada');
    expect(tokenStore.get()).toBe('token-novo');
    const chamada = fetch.mock.calls.find(([url]) => url === '/api/auth/senha');
    expect(JSON.parse(chamada[1].body)).toEqual({ senha_atual: 'Senha123', nova_senha: 'NovaSenha456' });
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
  });

  it('confirmação diferente não chama a API', async () => {
    const user = userEvent.setup();
    const fetch = mockFetch({ 'GET /auth/me': ME });
    renderComRotas(<Protected><MinhaConta /></Protected>, { rota: '/conta', caminho: '/conta' });
    await screen.findByText(/bia@fit\.com/);
    await preencher(user, 'Senha123', 'NovaSenha456', 'OutraCoisa789');

    expect(await screen.findByRole('alert')).toHaveTextContent('confirmação não confere');
    expect(fetch.mock.calls.some(([url]) => url === '/api/auth/senha')).toBe(false);
  });

  it('CA-006-02 senha atual incorreta mostra o erro e mantém o token', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /auth/me': ME,
      'PATCH /auth/senha': resposta(400, { erro: 'Dados inválidos', detalhes: { senha_atual: ['senha atual incorreta'] } }),
    });
    renderComRotas(<Protected><MinhaConta /></Protected>, { rota: '/conta', caminho: '/conta' });
    await screen.findByText(/bia@fit\.com/);
    await preencher(user, 'Errada999', 'NovaSenha456');

    expect(await screen.findByRole('alert')).toHaveTextContent('senha_atual: senha atual incorreta');
    expect(tokenStore.get()).toBe('token-antigo');
  });
});

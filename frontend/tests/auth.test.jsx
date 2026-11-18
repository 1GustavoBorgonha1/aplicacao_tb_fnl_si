// Proteção de rotas no React (só UX — quem autoriza é o backend) e sessão.
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Protected } from '../src/auth.jsx';
import { tokenStore } from '../src/api.js';
import { mockFetch, renderComRotas, resposta } from './helpers.jsx';

const me = (role) => resposta(200, { user: { id: 1, nome: 'Ana', email: 'a@a.com', role } });

describe('<Protected>', () => {
  it('sem login redireciona para /login', async () => {
    renderComRotas(<Protected role="cliente">área do cliente</Protected>, { rota: '/cliente', caminho: '/cliente' });
    expect(await screen.findByTestId('rota')).toHaveTextContent('/login');
  });

  it('perfil certo vê o conteúdo', async () => {
    tokenStore.set('t');
    mockFetch({ 'GET /auth/me': me('cliente') });
    renderComRotas(<Protected role="cliente">área do cliente</Protected>, { rota: '/cliente', caminho: '/cliente' });
    expect(await screen.findByText('área do cliente')).toBeInTheDocument();
  });

  it('perfil errado é mandado para a própria área', async () => {
    tokenStore.set('t');
    mockFetch({ 'GET /auth/me': me('restaurante') });
    renderComRotas(<Protected role="admin">painel</Protected>, { rota: '/admin', caminho: '/admin' });
    expect(await screen.findByTestId('rota')).toHaveTextContent('/restaurante');
    expect(screen.queryByText('painel')).not.toBeInTheDocument();
  });

  it('sem role definida aceita qualquer perfil logado (ex.: Minha conta)', async () => {
    tokenStore.set('t');
    mockFetch({ 'GET /auth/me': me('admin') });
    renderComRotas(<Protected>minha conta</Protected>, { rota: '/conta', caminho: '/conta' });
    expect(await screen.findByText('minha conta')).toBeInTheDocument();
  });

  it('token inválido é descartado e manda para o login', async () => {
    tokenStore.set('velho');
    mockFetch({ 'GET /auth/me': resposta(401, { erro: 'Token inválido ou expirado' }) });
    renderComRotas(<Protected role="cliente">x</Protected>, { rota: '/cliente', caminho: '/cliente' });
    expect(await screen.findByTestId('rota')).toHaveTextContent('/login');
    await waitFor(() => expect(tokenStore.get()).toBeNull());
  });
});

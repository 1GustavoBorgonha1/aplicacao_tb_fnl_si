// Telas do cliente, do restaurante, do admin e páginas públicas.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { tokenStore } from '../src/api.js';
import { Protected } from '../src/auth.jsx';
import Layout from '../src/components/Layout.jsx';
import CadastroCliente from '../src/pages/CadastroCliente.jsx';
import Home from '../src/pages/Home.jsx';
import Painel from '../src/pages/admin/Painel.jsx';
import MeusPedidos from '../src/pages/cliente/MeusPedidos.jsx';
import Restaurantes from '../src/pages/cliente/Restaurantes.jsx';
import PedidosRecebidos from '../src/pages/restaurante/PedidosRecebidos.jsx';
import { mockFetch, renderComRotas, resposta } from './helpers.jsx';

const me = (role, extra = {}) => resposta(200, { user: { id: 1, nome: 'Ana', email: 'ana@fit.com', role }, ...extra });
const pedido = (id, status, extra = {}) => ({
  id,
  status,
  retirada_em: '2026-11-20T15:00:00.000Z',
  observacao: '',
  total_centavos: 2590,
  itens: [{ nome: 'Frango', qtd: 1, preco_unit_centavos: 2590 }],
  cliente_nome: 'João',
  restaurante_nome: 'Fit da Maria',
  restaurante_endereco: 'Rua A, 10',
  ...extra,
});
const logado = (role, ui, rota = '/x', extra) => {
  tokenStore.set('t');
  return { rota, caminho: rota, ui: <Protected role={role}>{ui}</Protected>, extra };
};
const corpo = (fetch, metodo, url) => {
  const c = fetch.mock.calls.find(([u, o]) => u === `/api${url}` && o.method === metodo);
  return c && c[1].body ? JSON.parse(c[1].body) : c;
};

describe('Páginas públicas', () => {
  it('Home oferece "Sou cliente" e "Sou empresa" ao visitante', () => {
    renderComRotas(<Home />);
    expect(screen.getByRole('link', { name: /Sou cliente/ })).toHaveAttribute('href', '/cadastro/cliente');
    expect(screen.getByRole('link', { name: /Sou empresa/ })).toHaveAttribute('href', '/cadastro/empresa');
  });

  it('Home redireciona quem já está logado para a própria área', async () => {
    tokenStore.set('t');
    mockFetch({ 'GET /auth/me': me('admin') });
    renderComRotas(<Home />);
    expect(await screen.findByTestId('rota')).toHaveTextContent('/admin');
  });

  it('CA-001-01 cadastro de cliente envia os dados e vai para o login', async () => {
    const user = userEvent.setup();
    const fetch = mockFetch({ 'POST /auth/register/cliente': resposta(201, { user: {} }) });
    renderComRotas(<CadastroCliente />);
    await user.type(screen.getByLabelText('Nome'), 'João');
    await user.type(screen.getByLabelText('E-mail'), 'joao@fit.com');
    await user.type(screen.getByLabelText(/^Senha/), 'Senha123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByTestId('rota')).toHaveTextContent('/login');
    expect(corpo(fetch, 'POST', '/auth/register/cliente')).toEqual({ nome: 'João', email: 'joao@fit.com', senha: 'Senha123' });
  });

  it('CA-001-03 e-mail duplicado mostra o erro do servidor', async () => {
    const user = userEvent.setup();
    mockFetch({ 'POST /auth/register/cliente': resposta(409, { erro: 'E-mail já cadastrado' }) });
    renderComRotas(<CadastroCliente />);
    await user.type(screen.getByLabelText('Nome'), 'João');
    await user.type(screen.getByLabelText('E-mail'), 'joao@fit.com');
    await user.type(screen.getByLabelText(/^Senha/), 'Senha123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail já cadastrado');
  });
});

describe('Layout', () => {
  it('menu muda conforme o perfil e "Sair" apaga o token', async () => {
    const user = userEvent.setup();
    tokenStore.set('t');
    mockFetch({ 'GET /auth/me': me('restaurante', { restaurante: { id: 3, nome: 'Fit', status: 'aprovado' } }) });
    renderComRotas(<Layout />, { rota: '/', caminho: '/' });
    expect(await screen.findByRole('link', { name: 'Marmitas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Minha empresa' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Painel' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(tokenStore.get()).toBeNull();
    expect(await screen.findByRole('link', { name: 'Entrar' })).toBeInTheDocument();
  });
});

describe('Cliente', () => {
  it('lista os restaurantes aprovados com link para o catálogo', async () => {
    const t = logado('cliente', <Restaurantes />);
    mockFetch({
      'GET /auth/me': me('cliente'),
      'GET /restaurants': resposta(200, { restaurantes: [{ id: 3, nome: 'Fit da Maria', endereco: 'Rua A, 10', horario: 'Seg a Sex · 11:00–14:00' }] }),
    });
    renderComRotas(t.ui, t);
    const link = await screen.findByRole('link', { name: /Fit da Maria/ });
    expect(link).toHaveAttribute('href', '/cliente/restaurantes/3');
    expect(link).toHaveTextContent('Seg a Sex · 11:00–14:00');
  });

  it('sem restaurantes mostra aviso', async () => {
    const t = logado('cliente', <Restaurantes />);
    mockFetch({ 'GET /auth/me': me('cliente'), 'GET /restaurants': resposta(200, { restaurantes: [] }) });
    renderComRotas(t.ui, t);
    expect(await screen.findByText('Nenhum restaurante disponível no momento.')).toBeInTheDocument();
  });

  it('CA-004-06 só pedido "recebido" pode ser cancelado pelo cliente', async () => {
    const user = userEvent.setup();
    const t = logado('cliente', <MeusPedidos />);
    let cancelado = false;
    const fetch = mockFetch({
      'GET /auth/me': me('cliente'),
      'GET /orders/mine': () => resposta(200, { pedidos: [pedido(1, cancelado ? 'cancelado' : 'recebido'), pedido(2, 'em_preparo')] }),
      'PATCH /orders/1/cancel': () => {
        cancelado = true;
        return resposta(200, {});
      },
    });
    renderComRotas(t.ui, t);
    const botoes = await screen.findAllByRole('button', { name: 'Cancelar pedido' });
    expect(botoes).toHaveLength(1);
    await user.click(botoes[0]);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument());
    expect(fetch.mock.calls.some(([u, o]) => u === '/api/orders/1/cancel' && o.method === 'PATCH')).toBe(true);
    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0);
  });

  it('erro ao cancelar aparece na tela', async () => {
    const user = userEvent.setup();
    const t = logado('cliente', <MeusPedidos />);
    mockFetch({
      'GET /auth/me': me('cliente'),
      'GET /orders/mine': resposta(200, { pedidos: [pedido(1, 'recebido')] }),
      'PATCH /orders/1/cancel': resposta(409, { erro: 'Pedido não pode mais ser cancelado' }),
    });
    renderComRotas(t.ui, t);
    await user.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pedido não pode mais ser cancelado');
  });
});

describe('Restaurante — pedidos recebidos', () => {
  it('CA-004-07 avança o status pelo próximo passo e permite cancelar só antes de pronto', async () => {
    const user = userEvent.setup();
    const t = logado('restaurante', <PedidosRecebidos />);
    const fetch = mockFetch({
      'GET /auth/me': me('restaurante', { restaurante: { id: 3, nome: 'Fit', status: 'aprovado' } }),
      'GET /orders/received': resposta(200, { pedidos: [pedido(1, 'recebido'), pedido(2, 'pronto_retirada')] }),
      'GET /orders/received?status=pronto_retirada': resposta(200, { pedidos: [pedido(2, 'pronto_retirada')] }),
      'PATCH /orders/1/status': resposta(200, {}),
    });
    renderComRotas(t.ui, t);

    await user.click(await screen.findByRole('button', { name: 'Iniciar preparo' }));
    expect(corpo(fetch, 'PATCH', '/orders/1/status')).toEqual({ status: 'em_preparo' });
    expect(screen.getByRole('button', { name: 'Confirmar retirada' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText('Filtrar por status'), 'pronto_retirada');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Iniciar preparo' })).not.toBeInTheDocument());
  });

  it('transição recusada pelo servidor mostra o erro; lista vazia mostra aviso', async () => {
    const user = userEvent.setup();
    const t = logado('restaurante', <PedidosRecebidos />);
    mockFetch({
      'GET /auth/me': me('restaurante', { restaurante: { id: 3, nome: 'Fit', status: 'aprovado' } }),
      'GET /orders/received': resposta(200, { pedidos: [pedido(1, 'em_preparo')] }),
      'GET /orders/received?status=retirado': resposta(200, { pedidos: [] }),
      'PATCH /orders/1/status': resposta(409, { erro: 'Transição de status inválida' }),
    });
    renderComRotas(t.ui, t);
    await user.click(await screen.findByRole('button', { name: 'Marcar como pronto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Transição de status inválida');
    await user.selectOptions(screen.getByLabelText('Filtrar por status'), 'retirado');
    expect(await screen.findByText('Nenhum pedido.')).toBeInTheDocument();
  });
});

describe('Admin — painel', () => {
  const ME_ADMIN = me('admin');

  it('resumo soma os números do /admin/stats', async () => {
    const t = logado('admin', <Painel />);
    mockFetch({
      'GET /auth/me': ME_ADMIN,
      'GET /admin/stats': resposta(200, {
        usuarios: { cliente: 7, restaurante: 3, admin: 1 },
        restaurantes: { pendente: 1, aprovado: 2 },
        pedidos: { recebido: 2, em_preparo: 1, retirado: 5 },
      }),
    });
    renderComRotas(t.ui, t);
    await screen.findByText('Clientes');
    const card = async (rotulo) => screen.getAllByText(rotulo).map((e) => e.closest('.stat')).find(Boolean);
    expect(await card('Clientes')).toHaveTextContent('7');
    expect(await card('Empresas')).toHaveTextContent('3');
    expect(await card('Aguardando aprovação')).toHaveTextContent('1');
    expect(await card('Pedidos')).toHaveTextContent('8');
    expect(await card('Pedidos em aberto')).toHaveTextContent('3');
  });

  it('CA-005-01 aprova empresa pendente', async () => {
    const user = userEvent.setup();
    const t = logado('admin', <Painel />);
    const fetch = mockFetch({
      'GET /auth/me': ME_ADMIN,
      'GET /admin/stats': resposta(200, { usuarios: {}, restaurantes: {}, pedidos: {} }),
      'GET /admin/restaurants?status=pendente': resposta(200, {
        restaurantes: [{ id: 3, nome: 'Fit da Maria', endereco: 'Rua A', cnpj: '12345678000190', dono_nome: 'Maria', dono_email: 'm@fit.com', status: 'pendente' }],
      }),
      'PATCH /admin/restaurants/3/status': resposta(200, {}),
    });
    renderComRotas(t.ui, t);
    await user.click(await screen.findByRole('tab', { name: 'Empresas' }));
    const linha = (await screen.findByText('Fit da Maria')).closest('tr');
    await user.click(within(linha).getByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(corpo(fetch, 'PATCH', '/admin/restaurants/3/status')).toEqual({ status: 'aprovado' }));
  });

  it('desativa usuário, mas não oferece o botão para o próprio admin', async () => {
    const user = userEvent.setup();
    const t = logado('admin', <Painel />);
    const fetch = mockFetch({
      'GET /auth/me': ME_ADMIN,
      'GET /admin/stats': resposta(200, { usuarios: {}, restaurantes: {}, pedidos: {} }),
      'GET /admin/users': resposta(200, {
        usuarios: [
          { id: 1, nome: 'Ana', email: 'ana@fit.com', role: 'admin', ativo: true, criado_em: '2026-11-01T10:00:00Z' },
          { id: 9, nome: 'Zé', email: 'ze@fit.com', role: 'cliente', ativo: true, criado_em: '2026-11-02T10:00:00Z' },
        ],
      }),
      'PATCH /admin/users/9/ativo': resposta(200, {}),
    });
    renderComRotas(t.ui, t);
    await user.click(await screen.findByRole('tab', { name: 'Usuários' }));
    const linhaAdmin = (await screen.findByText('ana@fit.com')).closest('tr');
    expect(within(linhaAdmin).queryByRole('button')).not.toBeInTheDocument();
    await user.click(within(screen.getByText('ze@fit.com').closest('tr')).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(corpo(fetch, 'PATCH', '/admin/users/9/ativo')).toEqual({ ativo: false }));
  });

  it('lista pedidos com filtro e oculta marmita; erro de ação aparece no topo', async () => {
    const user = userEvent.setup();
    const t = logado('admin', <Painel />);
    mockFetch({
      'GET /auth/me': ME_ADMIN,
      'GET /admin/stats': resposta(200, { usuarios: {}, restaurantes: {}, pedidos: {} }),
      'GET /admin/orders': resposta(200, { pedidos: [pedido(4, 'retirado')] }),
      'GET /admin/orders?status=cancelado': resposta(200, { pedidos: [] }),
      'GET /admin/meals': resposta(200, {
        marmitas: [{ id: 5, nome: 'Frango', restaurante_nome: 'Fit da Maria', categoria: 'low_carb', preco_centavos: 2590, disponivel: true }],
      }),
      'PATCH /admin/meals/5': resposta(403, { erro: 'Acesso negado' }),
    });
    renderComRotas(t.ui, t);

    await user.click(await screen.findByRole('tab', { name: 'Pedidos' }));
    expect(await screen.findByText(/Cliente: João/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filtrar pedidos'), 'cancelado');
    expect(await screen.findByText('Nenhum pedido.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Marmitas' }));
    const linha = (await screen.findByText('Frango')).closest('tr');
    expect(linha).toHaveTextContent('Low carb');
    expect(linha).toHaveTextContent(/R\$\s25,90/);
    await user.click(within(linha).getByRole('button', { name: 'Ocultar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado');
  });
});

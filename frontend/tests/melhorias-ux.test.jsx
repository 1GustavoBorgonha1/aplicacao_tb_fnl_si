// Melhorias de UX: máscara de preço (UX-003-01) e horário de retirada estruturado (CA-002-06).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { tokenStore } from '../src/api.js';
import { Protected } from '../src/auth.jsx';
import HorarioRetirada, { HORARIO_PADRAO, horarioDoRestaurante } from '../src/components/HorarioRetirada.jsx';
import MoneyInput from '../src/components/MoneyInput.jsx';
import { centavosDeTexto, PRECO_MAX_CENTAVOS } from '../src/format.js';
import Catalogo from '../src/pages/cliente/Catalogo.jsx';
import MinhaEmpresa from '../src/pages/restaurante/MinhaEmpresa.jsx';
import MinhasMarmitas from '../src/pages/restaurante/MinhasMarmitas.jsx';
import { mockFetch, renderComRotas, resposta } from './helpers.jsx';

/** Campo de dinheiro controlado, como nas telas. */
function Dinheiro({ inicial = null }) {
  const [v, setV] = useState(inicial);
  return (
    <label>
      Preço
      <MoneyInput value={v} max={PRECO_MAX_CENTAVOS} onChange={setV} />
      <output>{String(v)}</output>
    </label>
  );
}

describe('UX-003-01 máscara de dinheiro', () => {
  it('centavosDeTexto: só dígitos contam, zeros à esquerda somem, vazio vira null', () => {
    expect(centavosDeTexto('R$ 25,90')).toBe(2590);
    expect(centavosDeTexto('2590')).toBe(2590);
    expect(centavosDeTexto('R$ 0,05')).toBe(5);
    expect(centavosDeTexto('abc')).toBeNull();
    expect(centavosDeTexto(undefined)).toBeNull();
  });

  it('digitar 2-5-9-0 mostra R$ 25,90 (a vírgula anda da direita)', async () => {
    const user = userEvent.setup();
    render(<Dinheiro />);
    const campo = screen.getByLabelText(/Preço/);
    await user.type(campo, '2590');
    expect(campo.value).toMatch(/R\$\s25,90/);
    expect(screen.getByRole('status')).toHaveTextContent('2590');
  });

  it('backspace remove o último dígito e apagar tudo deixa vazio', async () => {
    const user = userEvent.setup();
    render(<Dinheiro inicial={2590} />);
    const campo = screen.getByLabelText(/Preço/);
    await user.click(campo);
    await user.keyboard('{Backspace}');
    expect(campo.value).toMatch(/R\$\s2,59/);
    await user.keyboard('{Backspace}{Backspace}{Backspace}');
    expect(campo.value).toBe('');
    expect(screen.getByRole('status')).toHaveTextContent('null');
  });

  it('não passa de R$ 1.000,00 e aceita colar texto com símbolos', async () => {
    const user = userEvent.setup();
    render(<Dinheiro inicial={100000} />);
    const campo = screen.getByLabelText(/Preço/);
    await user.type(campo, '9');
    expect(screen.getByRole('status')).toHaveTextContent('100000');

    await user.clear(campo);
    await user.paste('R$ 12,34');
    expect(screen.getByRole('status')).toHaveTextContent('1234');
  });
});

describe('CA-002-06 horário de retirada estruturado', () => {
  it('horarioDoRestaurante converte null da API em campos vazios e usa dias padrão', () => {
    expect(horarioDoRestaurante({ dias_retirada: null, abre_as: null, fecha_as: null })).toEqual(HORARIO_PADRAO);
    expect(horarioDoRestaurante({ dias_retirada: [6], abre_as: '11:00', fecha_as: '14:00' })).toEqual({
      dias_retirada: [6],
      abre_as: '11:00',
      fecha_as: '14:00',
    });
  });

  function Horario() {
    const [v, setV] = useState(HORARIO_PADRAO);
    return (
      <>
        <HorarioRetirada value={v} onChange={setV} />
        <output>{JSON.stringify(v)}</output>
      </>
    );
  }

  it('marcar/desmarcar dias mantém a lista ordenada; abre exige fecha', async () => {
    const user = userEvent.setup();
    render(<Horario />);
    const dias = within(screen.getByRole('group', { name: 'Dias de retirada' }));

    await user.click(dias.getByLabelText('Sáb'));
    await user.click(dias.getByLabelText('Dom'));
    await user.click(dias.getByLabelText('Seg'));
    expect(JSON.parse(screen.getByRole('status').textContent).dias_retirada).toEqual([0, 2, 3, 4, 5, 6]);

    const fecha = screen.getByLabelText('Fecha às');
    expect(fecha).not.toBeRequired();
    await user.type(screen.getByLabelText('Abre às'), '11:00');
    expect(fecha).toBeRequired();
    expect(fecha).toHaveAttribute('min', '11:00');
    await user.type(fecha, '14:00');
    expect(JSON.parse(screen.getByRole('status').textContent)).toMatchObject({ abre_as: '11:00', fecha_as: '14:00' });
  });
});

const RESTAURANTE = {
  id: 3,
  nome: 'Fit da Maria',
  cnpj: '12345678000190',
  telefone: '47999990000',
  endereco: 'Rua das Flores, 10',
  status: 'aprovado',
  horario: 'Seg a Sex · 11:00–14:00',
  dias_retirada: [1, 2, 3, 4, 5],
  abre_as: '11:00',
  fecha_as: '14:00',
};
const ME_RESTAURANTE = resposta(200, {
  user: { id: 9, nome: 'Maria', email: 'm@fit.com', role: 'restaurante' },
  restaurante: { id: 3, nome: 'Fit da Maria', status: 'aprovado' },
});

describe('Minha empresa', () => {
  it('carrega o horário estruturado e envia os campos ao salvar', async () => {
    const user = userEvent.setup();
    tokenStore.set('t');
    const fetch = mockFetch({
      'GET /auth/me': ME_RESTAURANTE,
      'GET /restaurants/me': resposta(200, { restaurante: RESTAURANTE }),
      'PUT /restaurants/me': resposta(200, { restaurante: RESTAURANTE }),
    });
    renderComRotas(<Protected role="restaurante"><MinhaEmpresa /></Protected>, { rota: '/e', caminho: '/e' });

    expect(await screen.findByLabelText('Abre às')).toHaveValue('11:00');
    expect(screen.getByText(/Exibido aos clientes: Seg a Sex/)).toBeInTheDocument();
    expect(screen.getByText(/12\.345\.678\/0001-90/)).toBeInTheDocument();

    await user.click(screen.getByLabelText('Sáb'));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Dados atualizados');
    const put = fetch.mock.calls.find(([url, o]) => url === '/api/restaurants/me' && o.method === 'PUT');
    expect(JSON.parse(put[1].body)).toMatchObject({
      nome: 'Fit da Maria',
      dias_retirada: [1, 2, 3, 4, 5, 6],
      abre_as: '11:00',
      fecha_as: '14:00',
    });
  });

  it('erro do servidor (ex.: abre depois de fechar) aparece na tela', async () => {
    const user = userEvent.setup();
    tokenStore.set('t');
    mockFetch({
      'GET /auth/me': ME_RESTAURANTE,
      'GET /restaurants/me': resposta(200, { restaurante: RESTAURANTE }),
      'PUT /restaurants/me': resposta(400, { erro: 'Dados inválidos', detalhes: { fecha_as: ['deve ser depois da abertura'] } }),
    });
    renderComRotas(<Protected role="restaurante"><MinhaEmpresa /></Protected>, { rota: '/e', caminho: '/e' });
    await user.click(await screen.findByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('fecha_as: deve ser depois da abertura');
  });
});

describe('Minhas marmitas — preço em centavos', () => {
  const MARMITA = { id: 5, nome: 'Frango', descricao: '', preco_centavos: 2590, kcal: 450, proteina_g: null, categoria: 'low_carb', disponivel: true, imagem_url: null };

  it('nova marmita: digita 3490 e envia preco_centavos=3490', async () => {
    const user = userEvent.setup();
    tokenStore.set('t');
    const fetch = mockFetch({
      'GET /auth/me': ME_RESTAURANTE,
      'GET /meals/mine': resposta(200, { marmitas: [] }),
      'POST /meals': resposta(201, { marmita: MARMITA }),
    });
    renderComRotas(<Protected role="restaurante"><MinhasMarmitas /></Protected>, { rota: '/m', caminho: '/m' });

    await user.click(await screen.findByRole('button', { name: '+ Nova marmita' }));
    await user.type(screen.getByLabelText('Nome'), 'Carne com legumes');
    await user.type(screen.getByLabelText(/^Preço/), '3490');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Marmita cadastrada');
    const post = fetch.mock.calls.find(([url, o]) => url === '/api/meals' && o.method === 'POST');
    expect(post[1].body.get('preco_centavos')).toBe('3490');
    expect(post[1].body.get('nome')).toBe('Carne com legumes');
  });

  it('editar preenche o preço a partir dos centavos', async () => {
    const user = userEvent.setup();
    tokenStore.set('t');
    mockFetch({ 'GET /auth/me': ME_RESTAURANTE, 'GET /meals/mine': resposta(200, { marmitas: [MARMITA] }) });
    renderComRotas(<Protected role="restaurante"><MinhasMarmitas /></Protected>, { rota: '/m', caminho: '/m' });
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText(/^Preço/).value).toMatch(/R\$\s25,90/);
  });
});

describe('Catálogo — janela de retirada', () => {
  it('mostra o horário do restaurante na dica e limita o campo entre 30 min e 7 dias', async () => {
    tokenStore.set('t');
    mockFetch({
      'GET /auth/me': resposta(200, { user: { id: 1, nome: 'Cli', email: 'c@c.com', role: 'cliente' } }),
      'GET /restaurants/3': resposta(200, { restaurante: RESTAURANTE }),
      'GET /restaurants/3/meals': resposta(200, {
        marmitas: [{ id: 5, nome: 'Frango', descricao: '', preco_centavos: 2590, categoria: 'low_carb', imagem_url: null }],
      }),
    });
    renderComRotas(<Protected role="cliente"><Catalogo /></Protected>, {
      rota: '/cliente/restaurantes/3',
      caminho: '/cliente/restaurantes/:id',
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Adicionar Frango' }));
    const campo = await screen.findByLabelText(/^Data e hora da retirada/);
    await waitFor(() => expect(screen.getByText(/no horário do restaurante: Seg a Sex · 11:00–14:00/)).toBeInTheDocument());
    const min = new Date(campo.getAttribute('min')).getTime();
    const max = new Date(campo.getAttribute('max')).getTime();
    expect(min - Date.now()).toBeGreaterThan(25 * 60_000);
    expect(max - min).toBeGreaterThan(6 * 24 * 60 * 60_000);
  });
});

describe('Cadastro de empresa — horário estruturado', () => {
  it('envia dias e horários junto com os dados da empresa e vai para o login', async () => {
    const { default: CadastroEmpresa } = await import('../src/pages/CadastroEmpresa.jsx');
    const user = userEvent.setup();
    const fetch = mockFetch({ 'POST /auth/register/restaurante': resposta(201, { user: {}, restaurante: {} }) });
    renderComRotas(<CadastroEmpresa />, { rota: '/cadastro/empresa', caminho: '/cadastro/empresa' });

    await user.type(screen.getByLabelText('Nome'), 'Maria');
    await user.type(screen.getByLabelText('E-mail'), 'maria@fit.com');
    await user.type(screen.getByLabelText(/^Senha/), 'Senha123');
    await user.type(screen.getByLabelText('Nome fantasia'), 'Fit da Maria');
    await user.type(screen.getByLabelText('CNPJ'), '12345678000190');
    await user.type(screen.getByLabelText('Telefone'), '47999990000');
    await user.type(screen.getByLabelText('Endereço de retirada'), 'Rua das Flores, 10');
    await user.click(screen.getByLabelText('Sáb'));
    await user.type(screen.getByLabelText('Abre às'), '11:00');
    await user.type(screen.getByLabelText('Fecha às'), '14:00');
    await user.click(screen.getByRole('button', { name: 'Cadastrar empresa' }));

    expect(await screen.findByTestId('rota')).toHaveTextContent('/login');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.restaurante).toMatchObject({ dias_retirada: [1, 2, 3, 4, 5, 6], abre_as: '11:00', fecha_as: '14:00' });
  });
});

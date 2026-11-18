// Componentes de exibição: cartão de pedido e alertas.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PedidoCard from '../src/components/PedidoCard.jsx';
import { Alert, Badge } from '../src/components/ui.jsx';

const pedido = {
  id: 42,
  status: 'pronto_retirada',
  retirada_em: '2026-11-20T15:30:00.000Z',
  observacao: 'Sem cebola',
  total_centavos: 7770,
  itens: [
    { nome: 'Frango com batata doce', qtd: 2, preco_unit_centavos: 2590 },
    { nome: 'Strogonoff fit', qtd: 1, preco_unit_centavos: 2590 },
  ],
};

describe('PedidoCard', () => {
  it('mostra número, itens com subtotal, observação, status e total em reais', () => {
    render(<PedidoCard pedido={pedido} titulo="Fit da Maria" subtitulo="Cliente: João" />);
    expect(screen.getByRole('heading', { name: /#42 · Fit da Maria/ })).toBeInTheDocument();
    expect(screen.getByText('Cliente: João')).toBeInTheDocument();

    const itens = screen.getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(within(itens[0]).getByText(/2× Frango com batata doce/)).toBeInTheDocument();
    expect(itens[0]).toHaveTextContent(/R\$\s51,80/);

    expect(screen.getByText(/Sem cebola/)).toBeInTheDocument();
    expect(screen.getByText('Pronto p/ retirada')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s77,70/)).toBeInTheDocument();
  });

  it('renderiza as ações recebidas (ex.: botão de cancelar)', () => {
    render(
      <PedidoCard pedido={{ ...pedido, observacao: '' }} titulo="X">
        <button type="button">Cancelar</button>
      </PedidoCard>,
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.queryByText(/📝/)).not.toBeInTheDocument();
  });
});

describe('ui', () => {
  it('Alert de erro usa role=alert e de sucesso role=status; vazio não renderiza', () => {
    const { rerender, container } = render(<Alert>Falhou</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
    rerender(<Alert type="success">Ok</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Ok');
    rerender(<Alert>{''}</Alert>);
    expect(container).toBeEmptyDOMElement();
  });

  it('Badge traduz o valor e cai no próprio valor se não houver rótulo', () => {
    render(<Badge value="aprovado" labels={{ aprovado: 'Aprovada' }} />);
    expect(screen.getByText('Aprovada')).toHaveClass('badge-aprovado');
    render(<Badge value="desconhecido" labels={{}} />);
    expect(screen.getByText('desconhecido')).toBeInTheDocument();
  });
});

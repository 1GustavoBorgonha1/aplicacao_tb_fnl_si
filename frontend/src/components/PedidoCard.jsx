import { brl, dataHora, STATUS_PEDIDO } from '../format.js';
import { Badge } from './ui.jsx';

/** Cartão de pedido usado por cliente, restaurante e admin. */
export default function PedidoCard({ pedido: p, titulo, subtitulo, children }) {
  return (
    <article className="card pedido">
      <header className="pedido-head">
        <div>
          <h3>
            #{p.id} · {titulo}
          </h3>
          {subtitulo && <p className="muted small">{subtitulo}</p>}
        </div>
        <Badge value={p.status} labels={STATUS_PEDIDO} />
      </header>
      <ul className="cart-list">
        {p.itens.map((i, idx) => (
          <li key={idx}>
            <span>
              {i.qtd}× {i.nome}
            </span>
            <span>{brl(i.preco_unit_centavos * i.qtd)}</span>
          </li>
        ))}
      </ul>
      {p.observacao && <p className="small">📝 {p.observacao}</p>}
      <footer className="pedido-foot">
        <span className="small">
          🕒 Retirada: <strong>{dataHora(p.retirada_em)}</strong>
        </span>
        <strong>{brl(p.total_centavos)}</strong>
      </footer>
      {children && <div className="actions">{children}</div>}
    </article>
  );
}

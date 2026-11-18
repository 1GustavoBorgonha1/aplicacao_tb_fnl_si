import { useState } from 'react';
import { api, errorText } from '../../api.js';
import PedidoCard from '../../components/PedidoCard.jsx';
import StatusEmpresa from '../../components/StatusEmpresa.jsx';
import { Alert, useLoad } from '../../components/ui.jsx';
import { STATUS_PEDIDO } from '../../format.js';

// Próximo passo de cada status (espelha TRANSICOES do backend).
const PROXIMO = {
  recebido: ['em_preparo', 'Iniciar preparo'],
  em_preparo: ['pronto_retirada', 'Marcar como pronto'],
  pronto_retirada: ['retirado', 'Confirmar retirada'],
};
const PODE_CANCELAR = ['recebido', 'em_preparo'];

// Spec 004 — HU-004-03.
export default function PedidosRecebidos() {
  const [filtro, setFiltro] = useState('');
  const { data, error, reload } = useLoad(
    () => api(`/orders/received${filtro ? `?status=${filtro}` : ''}`),
    [filtro],
  );
  const [erro, setErro] = useState('');

  async function mudar(id, status) {
    setErro('');
    try {
      await api(`/orders/${id}/status`, { method: 'PATCH', body: { status } });
      reload();
    } catch (err) {
      setErro(errorText(err));
    }
  }

  return (
    <section>
      <StatusEmpresa />
      <div className="row-between">
        <h1>Pedidos recebidos</h1>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por status">
          <option value="">Todos</option>
          {Object.entries(STATUS_PEDIDO).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <Alert>{error || erro}</Alert>
      {data?.pedidos.length === 0 && <p className="muted">Nenhum pedido.</p>}
      <div className="stack">
        {data?.pedidos.map((p) => (
          <PedidoCard key={p.id} pedido={p} titulo={p.cliente_nome} subtitulo="Pagamento na retirada">
            {PROXIMO[p.status] && (
              <button type="button" className="btn btn-sm" onClick={() => mudar(p.id, PROXIMO[p.status][0])}>
                {PROXIMO[p.status][1]}
              </button>
            )}
            {PODE_CANCELAR.includes(p.status) && (
              <button type="button" className="btn btn-sm btn-danger" onClick={() => mudar(p.id, 'cancelado')}>
                Cancelar
              </button>
            )}
          </PedidoCard>
        ))}
      </div>
    </section>
  );
}

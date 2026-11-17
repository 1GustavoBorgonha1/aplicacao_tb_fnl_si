import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, errorText } from '../../api.js';
import { Alert, useLoad } from '../../components/ui.jsx';
import PedidoCard from '../../components/PedidoCard.jsx';

// Spec 004 — HU-004-02: acompanhar e cancelar.
export default function MeusPedidos() {
  const location = useLocation();
  const { data, error, reload } = useLoad(() => api('/orders/mine'));
  const [erro, setErro] = useState('');

  async function cancelar(id) {
    setErro('');
    try {
      await api(`/orders/${id}/cancel`, { method: 'PATCH' });
      reload();
    } catch (err) {
      setErro(errorText(err));
    }
  }

  return (
    <section>
      <h1>Meus pedidos</h1>
      {location.state?.criado && <Alert type="success">Pedido enviado! Acompanhe o status abaixo.</Alert>}
      <Alert>{error || erro}</Alert>
      {data?.pedidos.length === 0 && <p className="muted">Você ainda não fez pedidos.</p>}
      <div className="stack">
        {data?.pedidos.map((p) => (
          <PedidoCard key={p.id} pedido={p} titulo={p.restaurante_nome} subtitulo={`📍 ${p.restaurante_endereco}`}>
            {p.status === 'recebido' && (
              <button className="btn btn-danger btn-sm" onClick={() => cancelar(p.id)}>
                Cancelar pedido
              </button>
            )}
          </PedidoCard>
        ))}
      </div>
    </section>
  );
}

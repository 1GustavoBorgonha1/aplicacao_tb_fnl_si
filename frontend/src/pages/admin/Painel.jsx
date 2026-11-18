import { useState } from 'react';
import { api, errorText } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import PedidoCard from '../../components/PedidoCard.jsx';
import { Alert, Badge, useLoad } from '../../components/ui.jsx';
import { brl, CATEGORIAS, dataHora, STATUS_EMPRESA, STATUS_PEDIDO } from '../../format.js';

const ABAS = [
  ['resumo', 'Resumo'],
  ['empresas', 'Empresas'],
  ['usuarios', 'Usuários'],
  ['pedidos', 'Pedidos'],
  ['marmitas', 'Marmitas'],
];

// Spec 005 — Painel administrativo.
export default function Painel() {
  const [aba, setAba] = useState('resumo');
  const [erro, setErro] = useState('');

  /** Executa uma ação e recarrega a aba; mostra erro se falhar. */
  const acao = (fn, reload) => async () => {
    setErro('');
    try {
      await fn();
      reload();
    } catch (err) {
      setErro(errorText(err));
    }
  };

  return (
    <section>
      <h1>Painel administrativo</h1>
      <div className="tabs" role="tablist">
        {ABAS.map(([k, l]) => (
          <button type="button" key={k} role="tab" aria-selected={aba === k} className={`tab ${aba === k ? 'active' : ''}`} onClick={() => setAba(k)}>
            {l}
          </button>
        ))}
      </div>
      <Alert>{erro}</Alert>
      {aba === 'resumo' && <Resumo />}
      {aba === 'empresas' && <Empresas acao={acao} />}
      {aba === 'usuarios' && <Usuarios acao={acao} />}
      {aba === 'pedidos' && <Pedidos />}
      {aba === 'marmitas' && <Marmitas acao={acao} />}
    </section>
  );
}

function Resumo() {
  const { data, error } = useLoad(() => api('/admin/stats'));
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const soma = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const stats = [
    ['Clientes', data.usuarios.cliente ?? 0],
    ['Empresas', soma(data.restaurantes)],
    ['Aguardando aprovação', data.restaurantes.pendente ?? 0],
    ['Pedidos', soma(data.pedidos)],
    ['Pedidos em aberto', (data.pedidos.recebido ?? 0) + (data.pedidos.em_preparo ?? 0) + (data.pedidos.pronto_retirada ?? 0)],
  ];
  return (
    <div className="stats">
      {stats.map(([l, v]) => (
        <div key={l} className="card stat">
          <span className="muted small">{l}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}

function Empresas({ acao }) {
  const [status, setStatus] = useState('pendente');
  const { data, error, reload } = useLoad(() => api(`/admin/restaurants${status ? `?status=${status}` : ''}`), [status]);
  const set = (id, s) => acao(() => api(`/admin/restaurants/${id}/status`, { method: 'PATCH', body: { status: s } }), reload);

  return (
    <>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar empresas">
        <option value="">Todas</option>
        {Object.entries(STATUS_EMPRESA).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <Alert>{error}</Alert>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>CNPJ</th>
              <th>Responsável</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.restaurantes.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.nome}
                  <div className="muted small">{r.endereco}</div>
                </td>
                <td>{r.cnpj}</td>
                <td>
                  {r.dono_nome}
                  <div className="muted small">{r.dono_email}</div>
                </td>
                <td>
                  <Badge value={r.status} labels={STATUS_EMPRESA} />
                </td>
                <td className="actions">
                  {r.status !== 'aprovado' && (
                    <button type="button" className="btn btn-sm" onClick={set(r.id, 'aprovado')}>
                      Aprovar
                    </button>
                  )}
                  {r.status !== 'bloqueado' && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={set(r.id, 'bloqueado')}>
                      Bloquear
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.restaurantes.length === 0 && <p className="muted">Nenhuma empresa.</p>}
    </>
  );
}

function Usuarios({ acao }) {
  const { user } = useAuth();
  const { data, error, reload } = useLoad(() => api('/admin/users'));
  const toggle = (u) => acao(() => api(`/admin/users/${u.id}/ativo`, { method: 'PATCH', body: { ativo: !u.ativo } }), reload);

  return (
    <>
      <Alert>{error}</Alert>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Desde</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{dataHora(u.criado_em)}</td>
                <td>{u.ativo ? 'Ativo' : 'Desativado'}</td>
                <td>
                  {u.id !== user.id && (
                    <button type="button" className={`btn btn-sm ${u.ativo ? 'btn-danger' : ''}`} onClick={toggle(u)}>
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Pedidos() {
  const [status, setStatus] = useState('');
  const { data, error } = useLoad(() => api(`/admin/orders${status ? `?status=${status}` : ''}`), [status]);
  return (
    <>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar pedidos">
        <option value="">Todos</option>
        {Object.entries(STATUS_PEDIDO).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <Alert>{error}</Alert>
      <div className="stack">
        {data?.pedidos.map((p) => (
          <PedidoCard key={p.id} pedido={p} titulo={p.restaurante_nome} subtitulo={`Cliente: ${p.cliente_nome}`} />
        ))}
      </div>
      {data?.pedidos.length === 0 && <p className="muted">Nenhum pedido.</p>}
    </>
  );
}

function Marmitas({ acao }) {
  const { data, error, reload } = useLoad(() => api('/admin/meals'));
  const toggle = (m) => acao(() => api(`/admin/meals/${m.id}`, { method: 'PATCH', body: { disponivel: !m.disponivel } }), reload);
  return (
    <>
      <Alert>{error}</Alert>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Marmita</th>
              <th>Restaurante</th>
              <th>Categoria</th>
              <th>Preço</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.marmitas.map((m) => (
              <tr key={m.id}>
                <td>{m.nome}</td>
                <td>{m.restaurante_nome}</td>
                <td>{CATEGORIAS[m.categoria]}</td>
                <td>{brl(m.preco_centavos)}</td>
                <td>
                  <button type="button" className={`btn btn-sm ${m.disponivel ? 'btn-danger' : ''}`} onClick={toggle(m)}>
                    {m.disponivel ? 'Ocultar' : 'Liberar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

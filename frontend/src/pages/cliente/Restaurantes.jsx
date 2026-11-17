import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, useLoad } from '../../components/ui.jsx';

// Spec 002 — HU-002-03: cliente escolhe a empresa.
export default function Restaurantes() {
  const { data, error, loading } = useLoad(() => api('/restaurants'));

  return (
    <section>
      <h1>Escolha um restaurante</h1>
      <Alert>{error}</Alert>
      {loading && <p className="muted">Carregando…</p>}
      {data?.restaurantes.length === 0 && <p className="muted">Nenhum restaurante disponível no momento.</p>}
      <div className="cards">
        {data?.restaurantes.map((r) => (
          <Link key={r.id} to={`/cliente/restaurantes/${r.id}`} className="card card-link">
            <h2>{r.nome}</h2>
            <p className="muted">📍 {r.endereco}</p>
            {r.horario && <p className="muted">🕒 {r.horario}</p>}
            <span className="link">Ver cardápio →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { api, errorText } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import StatusEmpresa from '../../components/StatusEmpresa.jsx';
import { Alert, Badge, Field, useLoad } from '../../components/ui.jsx';
import { STATUS_EMPRESA } from '../../format.js';

// Spec 002 — HU-002-01/02.
export default function MinhaEmpresa() {
  const { refresh } = useAuth();
  const { data, error } = useLoad(() => api('/restaurants/me'));
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState({ type: 'error', text: '' });

  useEffect(() => {
    if (data) {
      const { nome, telefone, endereco, horario } = data.restaurante;
      setForm({ nome, telefone, endereco, horario });
    }
  }, [data]);

  async function salvar(e) {
    e.preventDefault();
    try {
      await api('/restaurants/me', { method: 'PUT', body: form });
      setMsg({ type: 'success', text: 'Dados atualizados.' });
      refresh();
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) });
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!form) return <p className="muted">Carregando…</p>;
  const r = data.restaurante;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <section>
      <StatusEmpresa />
      <form className="card form" onSubmit={salvar}>
        <div className="row-between">
          <h1>Minha empresa</h1>
          <Badge value={r.status} labels={STATUS_EMPRESA} />
        </div>
        <p className="muted small">CNPJ: {r.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')} (não editável)</p>
        <Alert type={msg.type}>{msg.text}</Alert>
        <div className="grid-2">
          <Field label="Nome fantasia">
            <input required minLength={2} maxLength={100} value={form.nome} onChange={set('nome')} />
          </Field>
          <Field label="Telefone">
            <input required value={form.telefone} onChange={set('telefone')} />
          </Field>
        </div>
        <Field label="Endereço de retirada">
          <input required minLength={5} maxLength={200} value={form.endereco} onChange={set('endereco')} />
        </Field>
        <Field label="Horário de retirada">
          <input maxLength={100} value={form.horario} onChange={set('horario')} />
        </Field>
        <button className="btn" disabled={r.status === 'bloqueado'}>
          Salvar
        </button>
      </form>
    </section>
  );
}

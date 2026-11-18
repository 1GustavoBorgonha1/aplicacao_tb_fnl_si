import { useState } from 'react';
import { api, errorText } from '../../api.js';
import MoneyInput from '../../components/MoneyInput.jsx';
import StatusEmpresa from '../../components/StatusEmpresa.jsx';
import { Alert, Field, useLoad } from '../../components/ui.jsx';
import { brl, CATEGORIAS, PRECO_MAX_CENTAVOS } from '../../format.js';

const VAZIO = { nome: '', descricao: '', preco_centavos: null, kcal: '', proteina_g: '', categoria: 'tradicional', disponivel: true };
const MAX_IMG = 2 * 1024 * 1024;

// Spec 003 — HU-003-01/02.
export default function MinhasMarmitas() {
  const { data, error, reload } = useLoad(() => api('/meals/mine'));
  const [form, setForm] = useState(VAZIO);
  const [editId, setEditId] = useState(null);
  const [imagem, setImagem] = useState(null);
  const [removerImagem, setRemoverImagem] = useState(false);
  const [msg, setMsg] = useState({ type: 'error', text: '' });
  const [aberto, setAberto] = useState(false);

  function novo() {
    setForm(VAZIO);
    setEditId(null);
    setImagem(null);
    setRemoverImagem(false);
    setAberto(true);
  }

  function editar(m) {
    setForm({
      nome: m.nome,
      descricao: m.descricao,
      preco_centavos: m.preco_centavos,
      kcal: m.kcal ?? '',
      proteina_g: m.proteina_g ?? '',
      categoria: m.categoria,
      disponivel: m.disponivel,
    });
    setEditId(m.id);
    setImagem(null);
    setRemoverImagem(false);
    setAberto(true);
  }

  async function salvar(e) {
    e.preventDefault();
    setMsg({ text: '' });
    if (imagem && imagem.size > MAX_IMG) return setMsg({ type: 'error', text: 'Imagem maior que 2 MB' });

    const fd = new FormData();
    fd.append('nome', form.nome);
    fd.append('descricao', form.descricao);
    fd.append('preco_centavos', String(form.preco_centavos ?? ''));
    fd.append('kcal', form.kcal);
    fd.append('proteina_g', form.proteina_g);
    fd.append('categoria', form.categoria);
    fd.append('disponivel', String(form.disponivel));
    fd.append('remover_imagem', String(removerImagem));
    if (imagem) fd.append('imagem', imagem);

    try {
      await api(editId ? `/meals/${editId}` : '/meals', { method: editId ? 'PUT' : 'POST', form: fd });
      setAberto(false);
      setMsg({ type: 'success', text: editId ? 'Marmita atualizada.' : 'Marmita cadastrada.' });
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) });
    }
  }

  async function remover(m) {
    if (!window.confirm(`Remover "${m.nome}"?`)) return;
    try {
      await api(`/meals/${m.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) });
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <section>
      <StatusEmpresa />
      <div className="row-between">
        <h1>Minhas marmitas</h1>
        <button type="button" className="btn" onClick={novo}>
          + Nova marmita
        </button>
      </div>
      <Alert type={msg.type}>{msg.text}</Alert>
      <Alert>{error}</Alert>

      {aberto && (
        <form className="card form" onSubmit={salvar}>
          <h2>{editId ? 'Editar marmita' : 'Nova marmita'}</h2>
          <div className="grid-2">
            <Field label="Nome">
              <input required minLength={2} maxLength={100} value={form.nome} onChange={set('nome')} />
            </Field>
            <Field label="Categoria">
              <select value={form.categoria} onChange={set('categoria')}>
                {Object.entries(CATEGORIAS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Preço" hint="Digite só os números: 2590 vira R$ 25,90 (máx. R$ 1.000,00).">
              <MoneyInput
                required
                max={PRECO_MAX_CENTAVOS}
                value={form.preco_centavos}
                onChange={(preco_centavos) => setForm({ ...form, preco_centavos })}
              />
            </Field>
            <Field label="Calorias (kcal)">
              <input type="number" min={0} max={5000} value={form.kcal} onChange={set('kcal')} />
            </Field>
            <Field label="Proteína (g)">
              <input type="number" min={0} max={500} value={form.proteina_g} onChange={set('proteina_g')} />
            </Field>
            <Field label="Foto" hint="JPEG, PNG ou WEBP até 2 MB">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImagem(e.target.files[0] ?? null)} />
            </Field>
          </div>
          <Field label="Descrição">
            <textarea maxLength={500} rows={2} value={form.descricao} onChange={set('descricao')} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={form.disponivel} onChange={set('disponivel')} /> Disponível para pedidos
          </label>
          {editId && (
            <label className="check">
              <input type="checkbox" checked={removerImagem} onChange={(e) => setRemoverImagem(e.target.checked)} /> Remover foto atual
            </label>
          )}
          <div className="actions">
            <button type="submit" className="btn">Salvar</button>
            <button type="button" className="btn btn-ghost" onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {data?.marmitas.length === 0 && <p className="muted">Nenhuma marmita cadastrada.</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Foto</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Preço</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.marmitas.map((m) => (
              <tr key={m.id}>
                <td>{m.imagem_url ? <img className="thumb" src={m.imagem_url} alt="" /> : '🍱'}</td>
                <td>{m.nome}</td>
                <td>{CATEGORIAS[m.categoria]}</td>
                <td>{brl(m.preco_centavos)}</td>
                <td>{m.disponivel ? 'Disponível' : 'Indisponível'}</td>
                <td className="actions">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => editar(m)}>
                    Editar
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => remover(m)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

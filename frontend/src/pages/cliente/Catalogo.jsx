import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../../api.js';
import { Alert, Field, useLoad } from '../../components/ui.jsx';
import { brl, CATEGORIAS } from '../../format.js';

// Valor padrão do campo de retirada: daqui a 1h, no formato do <input type="datetime-local">.
function retiradaPadrao() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Spec 003 (catálogo) + Spec 004 (pedido para retirada).
export default function Catalogo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [categoria, setCategoria] = useState('');
  const [carrinho, setCarrinho] = useState({}); // { mealId: qtd }
  const [retirada, setRetirada] = useState(retiradaPadrao);
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');

  const rest = useLoad(() => api(`/restaurants/${id}`), [id]);
  const meals = useLoad(
    () => api(`/restaurants/${id}/meals${categoria ? `?categoria=${encodeURIComponent(categoria)}` : ''}`),
    [id, categoria],
  );

  // Mantém o preço das marmitas já adicionadas mesmo quando o filtro muda.
  const [conhecidas, setConhecidas] = useState({});
  const lista = meals.data?.marmitas ?? [];

  const alterar = (meal, delta) => {
    setConhecidas((c) => ({ ...c, [meal.id]: meal }));
    setCarrinho((c) => {
      const qtd = Math.min(20, Math.max(0, (c[meal.id] ?? 0) + delta));
      const novo = { ...c, [meal.id]: qtd };
      if (qtd === 0) delete novo[meal.id];
      return novo;
    });
  };

  const itens = Object.entries(carrinho).map(([mealId, qtd]) => ({ meal: conhecidas[mealId], qtd }));
  // Total exibido é apenas estimativa; o valor oficial é calculado no servidor (RS-004-01).
  const total = itens.reduce((acc, i) => acc + i.meal.preco_centavos * i.qtd, 0);

  async function finalizar(e) {
    e.preventDefault();
    setErro('');
    try {
      await api('/orders', {
        method: 'POST',
        body: {
          restaurant_id: Number(id),
          retirada_em: new Date(retirada).toISOString(),
          observacao,
          itens: itens.map((i) => ({ meal_id: i.meal.id, qtd: i.qtd })),
        },
      });
      navigate('/cliente/pedidos', { state: { criado: true } });
    } catch (err) {
      setErro(errorText(err));
    }
  }

  if (rest.error) return <Alert>{rest.error}</Alert>;

  return (
    <div className="split">
      <section>
        <h1>{rest.data?.restaurante.nome ?? '…'}</h1>
        {rest.data && (
          <p className="muted">
            📍 {rest.data.restaurante.endereco} {rest.data.restaurante.horario && `· 🕒 ${rest.data.restaurante.horario}`}
          </p>
        )}

        <div className="chips" role="group" aria-label="Filtrar por categoria">
          <button type="button" className={`chip ${categoria === '' ? 'active' : ''}`} onClick={() => setCategoria('')}>
            Todas
          </button>
          {Object.entries(CATEGORIAS).map(([k, label]) => (
            <button type="button" key={k} className={`chip ${categoria === k ? 'active' : ''}`} onClick={() => setCategoria(k)}>
              {label}
            </button>
          ))}
        </div>

        <Alert>{meals.error}</Alert>
        {!meals.loading && lista.length === 0 && <p className="muted">Nenhuma marmita nesta categoria.</p>}
        <div className="meal-grid">
          {lista.map((m) => (
            <article key={m.id} className="card meal">
              {m.imagem_url ? (
                <img src={m.imagem_url} alt={m.nome} loading="lazy" />
              ) : (
                <div className="meal-placeholder" aria-hidden>🍱</div>
              )}
              <div className="meal-body">
                <span className="tag">{CATEGORIAS[m.categoria]}</span>
                <h3>{m.nome}</h3>
                {m.descricao && <p className="muted small">{m.descricao}</p>}
                <p className="small">
                  {m.kcal != null && <>🔥 {m.kcal} kcal </>}
                  {m.proteina_g != null && <>💪 {m.proteina_g} g proteína</>}
                </p>
                <div className="meal-foot">
                  <strong>{brl(m.preco_centavos)}</strong>
                  <div className="qty">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => alterar(m, -1)} disabled={!carrinho[m.id]} aria-label={`Remover ${m.nome}`}>
                      −
                    </button>
                    <span>{carrinho[m.id] ?? 0}</span>
                    <button type="button" className="btn btn-sm" onClick={() => alterar(m, 1)} aria-label={`Adicionar ${m.nome}`}>
                      +
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="card cart">
        <h2>Seu pedido</h2>
        {itens.length === 0 ? (
          <p className="muted">Adicione marmitas do cardápio.</p>
        ) : (
          <form className="form" onSubmit={finalizar}>
            <ul className="cart-list">
              {itens.map((i) => (
                <li key={i.meal.id}>
                  <span>
                    {i.qtd}× {i.meal.nome}
                  </span>
                  <span>{brl(i.meal.preco_centavos * i.qtd)}</span>
                </li>
              ))}
            </ul>
            <p className="cart-total">
              Total estimado <strong>{brl(total)}</strong>
            </p>
            <Field label="Horário de retirada" hint="Entre 30 minutos e 7 dias a partir de agora.">
              <input type="datetime-local" required value={retirada} onChange={(e) => setRetirada(e.target.value)} />
            </Field>
            <Field label="Observação">
              <textarea maxLength={300} rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </Field>
            <Alert>{erro}</Alert>
            <button type="submit" className="btn">Fazer pedido</button>
            <p className="muted small">💵 Pagamento no local, na retirada.</p>
          </form>
        )}
      </aside>
    </div>
  );
}

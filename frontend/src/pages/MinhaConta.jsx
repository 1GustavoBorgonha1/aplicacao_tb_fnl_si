// Spec 006 — Troca de senha (qualquer perfil).
import { useState } from 'react';
import { api, errorText, tokenStore } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Field } from '../components/ui.jsx';

const VAZIO = { senha_atual: '', nova_senha: '', confirmar: '' };

export default function MinhaConta() {
  const { user } = useAuth();
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErro('');
    setOk('');
    // Só UX: quem valida a política é o backend (CA-006-03/04).
    if (form.nova_senha !== form.confirmar) return setErro('A confirmação não confere com a nova senha.');
    setEnviando(true);
    try {
      const { token } = await api('/auth/senha', {
        method: 'PATCH',
        body: { senha_atual: form.senha_atual, nova_senha: form.nova_senha },
      });
      tokenStore.set(token); // os tokens antigos deixaram de valer (CA-006-05)
      setForm(VAZIO);
      setOk('Senha alterada! As outras sessões abertas foram encerradas.');
    } catch (err) {
      setErro(errorText(err));
    } finally {
      setEnviando(false);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form className="card form narrow" onSubmit={submit}>
      <h1>Minha conta</h1>
      <p className="muted">
        {user.nome} · {user.email}
      </p>
      <h2>Trocar senha</h2>
      <Alert>{erro}</Alert>
      <Alert type="success">{ok}</Alert>
      <Field label="Senha atual">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={form.senha_atual}
          onChange={set('senha_atual')}
        />
      </Field>
      <Field label="Nova senha" hint="Mínimo de 8 caracteres, com letras e números.">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          value={form.nova_senha}
          onChange={set('nova_senha')}
        />
      </Field>
      <Field label="Confirmar nova senha">
        <input
          type="password"
          autoComplete="new-password"
          required
          value={form.confirmar}
          onChange={set('confirmar')}
        />
      </Field>
      <button className="btn" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Trocar senha'}
      </button>
    </form>
  );
}

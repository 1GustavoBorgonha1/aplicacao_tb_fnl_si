import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorText } from '../api.js';
import { Alert, Field } from '../components/ui.jsx';

export const SENHA_HINT = 'Mínimo 8 caracteres, com letras e números.';

export default function CadastroCliente() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ nome: '', email: '', senha: '' });
  const [erro, setErro] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErro('');
    try {
      await api('/auth/register/cliente', { method: 'POST', body: form });
      navigate('/login', { state: { cadastrado: true } });
    } catch (err) {
      setErro(errorText(err));
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form className="card form narrow" onSubmit={submit}>
      <h1>Cadastro de cliente</h1>
      <Alert>{erro}</Alert>
      <Field label="Nome">
        <input required minLength={2} maxLength={100} value={form.nome} onChange={set('nome')} />
      </Field>
      <Field label="E-mail">
        <input type="email" required maxLength={150} autoComplete="email" value={form.email} onChange={set('email')} />
      </Field>
      <Field label="Senha" hint={SENHA_HINT}>
        <input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={form.senha} onChange={set('senha')} />
      </Field>
      <button className="btn">Criar conta</button>
      <p className="muted">
        É uma empresa? <Link to="/cadastro/empresa">Cadastre sua empresa</Link>
      </p>
    </form>
  );
}

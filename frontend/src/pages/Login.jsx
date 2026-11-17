import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { errorText } from '../api.js';
import { HOME_POR_PERFIL, useAuth } from '../auth.jsx';
import { Alert, Field } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', senha: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (user) return <Navigate to={location.state?.from ?? HOME_POR_PERFIL[user.role]} replace />;

  async function submit(e) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await login(form.email, form.senha);
    } catch (err) {
      setErro(errorText(err));
    } finally {
      setEnviando(false);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form className="card form narrow" onSubmit={submit}>
      <h1>Entrar</h1>
      {location.state?.cadastrado && <Alert type="success">Cadastro realizado! Faça login.</Alert>}
      <Alert>{erro}</Alert>
      <Field label="E-mail">
        <input type="email" autoComplete="username" required value={form.email} onChange={set('email')} />
      </Field>
      <Field label="Senha">
        <input type="password" autoComplete="current-password" required value={form.senha} onChange={set('senha')} />
      </Field>
      <button className="btn" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
      <p className="muted">
        Não tem conta? <Link to="/cadastro/cliente">Sou cliente</Link> · <Link to="/cadastro/empresa">Sou empresa</Link>
      </p>
    </form>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorText } from '../api.js';
import { Alert, Field } from '../components/ui.jsx';
import { SENHA_HINT } from './CadastroCliente.jsx';

const VAZIO = { nome: '', cnpj: '', telefone: '', endereco: '', horario: '' };

export default function CadastroEmpresa() {
  const navigate = useNavigate();
  const [user, setUser] = useState({ nome: '', email: '', senha: '' });
  const [rest, setRest] = useState(VAZIO);
  const [erro, setErro] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErro('');
    try {
      await api('/auth/register/restaurante', { method: 'POST', body: { ...user, restaurante: rest } });
      navigate('/login', { state: { cadastrado: true } });
    } catch (err) {
      setErro(errorText(err));
    }
  }

  const setU = (k) => (e) => setUser({ ...user, [k]: e.target.value });
  const setR = (k) => (e) => setRest({ ...rest, [k]: e.target.value });

  return (
    <form className="card form" onSubmit={submit}>
      <h1>Cadastro de empresa</h1>
      <p className="muted">Após o cadastro, sua empresa passa por aprovação do administrador antes de aparecer para os clientes.</p>
      <Alert>{erro}</Alert>

      <fieldset>
        <legend>Responsável (login)</legend>
        <div className="grid-2">
          <Field label="Nome">
            <input required minLength={2} maxLength={100} value={user.nome} onChange={setU('nome')} />
          </Field>
          <Field label="E-mail">
            <input type="email" required maxLength={150} autoComplete="email" value={user.email} onChange={setU('email')} />
          </Field>
        </div>
        <Field label="Senha" hint={SENHA_HINT}>
          <input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={user.senha} onChange={setU('senha')} />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Dados da empresa</legend>
        <div className="grid-2">
          <Field label="Nome fantasia">
            <input required minLength={2} maxLength={100} value={rest.nome} onChange={setR('nome')} />
          </Field>
          <Field label="CNPJ">
            <input required inputMode="numeric" placeholder="00.000.000/0000-00" value={rest.cnpj} onChange={setR('cnpj')} />
          </Field>
          <Field label="Telefone">
            <input required inputMode="tel" placeholder="(47) 99999-0000" value={rest.telefone} onChange={setR('telefone')} />
          </Field>
          <Field label="Horário de retirada">
            <input maxLength={100} placeholder="Seg a sex, 11h às 14h" value={rest.horario} onChange={setR('horario')} />
          </Field>
        </div>
        <Field label="Endereço de retirada">
          <input required minLength={5} maxLength={200} value={rest.endereco} onChange={setR('endereco')} />
        </Field>
      </fieldset>

      <button type="submit" className="btn">Cadastrar empresa</button>
      <p className="muted">
        É cliente? <Link to="/cadastro/cliente">Crie uma conta de cliente</Link>
      </p>
    </form>
  );
}

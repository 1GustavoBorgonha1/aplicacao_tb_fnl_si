import { Link, Navigate } from 'react-router-dom';
import { HOME_POR_PERFIL, useAuth } from '../auth.jsx';

// Spec 001 — tela inicial: o visitante escolhe entrar como cliente ou empresa.
export default function Home() {
  const { user } = useAuth();
  if (user) return <Navigate to={HOME_POR_PERFIL[user.role]} replace />;

  return (
    <section className="hero">
      <img
        src="/marmifit-arte.webp"
        alt="Marmitas fitness da MarmiFit: frango com batata-doce, salmão com aspargos, arroz integral com lentilha e carne com legumes"
        className="hero-arte"
        width="360"
        height="360"
      />
      <h1>Comida saudável, sem precisar cozinhar.</h1>
      <p className="lead">
        Escolha um restaurante parceiro, monte seu pedido de marmitas fitness e retire no horário que
        preferir. O pagamento é feito na retirada.
      </p>

      <div className="choice-grid">
        <Link to="/cadastro/cliente" className="choice">
          <span className="choice-icon" aria-hidden>🥗</span>
          <strong>Sou cliente</strong>
          <span className="muted">Quero pedir marmitas</span>
        </Link>
        <Link to="/cadastro/empresa" className="choice">
          <span className="choice-icon" aria-hidden>🏪</span>
          <strong>Sou empresa</strong>
          <span className="muted">Quero vender minhas marmitas</span>
        </Link>
      </div>

      <p className="muted">
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </section>
  );
}

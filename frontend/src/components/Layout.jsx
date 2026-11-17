import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const MENUS = {
  cliente: [
    ['/cliente', 'Restaurantes'],
    ['/cliente/pedidos', 'Meus pedidos'],
  ],
  restaurante: [
    ['/restaurante', 'Pedidos'],
    ['/restaurante/marmitas', 'Marmitas'],
    ['/restaurante/empresa', 'Minha empresa'],
  ],
  admin: [['/admin', 'Painel']],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const sair = () => {
    logout();
    navigate('/');
  };

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand">
            <img src="/favicon.svg" alt="" width="28" height="28" /> MarmiFit
          </Link>
          <nav className="nav">
            {user ? (
              <>
                {MENUS[user.role].map(([to, label]) => (
                  <NavLink key={to} to={to} end>
                    {label}
                  </NavLink>
                ))}
                <span className="muted hide-sm">{user.nome}</span>
                <button className="btn btn-ghost" onClick={sair}>
                  Sair
                </button>
              </>
            ) : (
              <NavLink to="/login">Entrar</NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
      <footer className="container footer muted">
        MarmiFit · retirada e pagamento no local · projeto acadêmico UNIDAVI
      </footer>
    </>
  );
}

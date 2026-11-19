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
            <img src="/logo-marmifit.webp" alt="MarmiFit" className="brand-logo" width="151" height="38" />
          </Link>
          <nav className="nav">
            {user ? (
              <>
                {MENUS[user.role].map(([to, label]) => (
                  <NavLink key={to} to={to} end>
                    {label}
                  </NavLink>
                ))}
                <NavLink to="/conta" end title="Minha conta">
                  <span className="hide-sm">{user.nome}</span>
                  <span className="show-sm">Conta</span>
                </NavLink>
                <button type="button" className="btn btn-ghost" onClick={sair}>
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

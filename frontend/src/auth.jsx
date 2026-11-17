// Contexto de autenticação. A proteção das rotas aqui é só UX:
// quem garante a autorização é o backend (constituição II.3).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, setUnauthorizedHandler, tokenStore } from './api.js';

const AuthContext = createContext(null);

export const HOME_POR_PERFIL = {
  cliente: '/cliente',
  restaurante: '/restaurante',
  admin: '/admin',
};

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, restaurante: null, loading: true });

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return setState({ user: null, restaurante: null, loading: false });
    try {
      const me = await api('/auth/me');
      setState({ user: me.user, restaurante: me.restaurante ?? null, loading: false });
    } catch {
      tokenStore.clear();
      setState({ user: null, restaurante: null, loading: false });
    }
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setState({ user: null, restaurante: null, loading: false });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    refresh();
  }, [refresh, logout]);

  const login = useCallback(
    async (email, senha) => {
      const { token } = await api('/auth/login', { method: 'POST', body: { email, senha } });
      tokenStore.set(token);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(() => ({ ...state, login, logout, refresh }), [state, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function Protected({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="muted center">Carregando…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role && user.role !== role) return <Navigate to={HOME_POR_PERFIL[user.role]} replace />;
  return children;
}

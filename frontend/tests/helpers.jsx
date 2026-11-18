import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../src/auth.jsx';

/** Resposta falsa do fetch. */
export const resposta = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

/**
 * Substitui o fetch global por um roteador simples: `rotas` mapeia "METODO /caminho"
 * para uma resposta (ou função que recebe as opções do fetch e devolve a resposta).
 */
export function mockFetch(rotas) {
  const fn = vi.fn(async (url, opts = {}) => {
    const chave = `${opts.method ?? 'GET'} ${url.replace(/^\/api/, '')}`;
    const r = rotas[chave];
    if (!r) throw new Error(`rota não mockada: ${chave}`);
    return typeof r === 'function' ? r(opts) : r;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Mostra a rota atual (para conferir redirecionamentos). */
export function OndeEstou() {
  return <p data-testid="rota">{useLocation().pathname}</p>;
}

/** Renderiza `ui` em `rota` com AuthProvider e um catch-all que mostra a rota atual. */
export function renderComRotas(ui, { rota = '/', caminho = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <AuthProvider>
        <Routes>
          <Route path={caminho} element={ui} />
          <Route path="*" element={<OndeEstou />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

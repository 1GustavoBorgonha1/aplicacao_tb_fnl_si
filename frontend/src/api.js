// Cliente HTTP único. O token fica no sessionStorage (some ao fechar a aba)
// e só é enviado para a própria origem (/api), nunca para terceiros.
const TOKEN_KEY = 'marmifit_token';

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.erro || 'Erro inesperado');
    this.status = status;
    this.detalhes = body?.detalhes;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) payload = form; // FormData: o navegador define o Content-Type (multipart)
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Junta mensagem e detalhes de validação em um texto legível. */
export function errorText(err) {
  if (!(err instanceof ApiError) || !err.detalhes) return err.message;
  const campos = Object.entries(err.detalhes)
    .map(([campo, msgs]) => `${campo}: ${[].concat(msgs).join(', ')}`)
    .join(' · ');
  return `${err.message} — ${campos}`;
}

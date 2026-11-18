// Cliente HTTP único (src/api.js): token, erros e sessão expirada.
import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorText, setUnauthorizedHandler, tokenStore } from '../src/api.js';
import { mockFetch, resposta } from './helpers.jsx';

describe('api()', () => {
  it('envia o token no header Authorization quando existe', async () => {
    tokenStore.set('abc');
    const fetch = mockFetch({ 'GET /auth/me': resposta(200, { user: { id: 1 } }) });
    await api('/auth/me');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
  });

  it('sem token não envia Authorization', async () => {
    const fetch = mockFetch({ 'GET /restaurants': resposta(200, { restaurantes: [] }) });
    await api('/restaurants');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('serializa o body como JSON', async () => {
    const fetch = mockFetch({ 'POST /auth/login': resposta(200, { token: 't' }) });
    await api('/auth/login', { method: 'POST', body: { email: 'a@a.com' } });
    const opts = fetch.mock.calls[0][1];
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual({ email: 'a@a.com' });
  });

  it('envia FormData sem definir Content-Type (o navegador define o multipart)', async () => {
    const fetch = mockFetch({ 'POST /meals': resposta(201, {}) });
    const form = new FormData();
    await api('/meals', { method: 'POST', form });
    expect(fetch.mock.calls[0][1].body).toBe(form);
    expect(fetch.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
  });

  it('204 devolve null', async () => {
    mockFetch({ 'DELETE /meals/1': resposta(204) });
    expect(await api('/meals/1', { method: 'DELETE' })).toBeNull();
  });

  it('erro HTTP vira ApiError com status, mensagem e detalhes', async () => {
    mockFetch({ 'POST /orders': resposta(400, { erro: 'Dados inválidos', detalhes: { qtd: ['máximo 20'] } }) });
    const err = await api('/orders', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Dados inválidos');
    expect(err.detalhes).toEqual({ qtd: ['máximo 20'] });
  });

  it('401 com token chama o handler de sessão expirada', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    tokenStore.set('expirado');
    mockFetch({ 'GET /auth/me': resposta(401, { erro: 'Token inválido ou expirado' }) });
    await expect(api('/auth/me')).rejects.toThrow('Token inválido ou expirado');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('401 sem token (login errado) não chama o handler', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch({ 'POST /auth/login': resposta(401, { erro: 'E-mail ou senha inválidos' }) });
    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('resposta sem JSON vira mensagem genérica', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 502, ok: false, json: async () => { throw new Error('html'); } })));
    await expect(api('/health')).rejects.toThrow('Erro inesperado');
  });
});

describe('errorText()', () => {
  it('junta mensagem e detalhes de validação', () => {
    const err = new ApiError(400, { erro: 'Dados inválidos', detalhes: { senha: ['curta', 'sem número'], email: 'inválido' } });
    expect(errorText(err)).toBe('Dados inválidos — senha: curta, sem número · email: inválido');
  });

  it('sem detalhes devolve só a mensagem', () => {
    expect(errorText(new Error('Falha de rede'))).toBe('Falha de rede');
  });
});

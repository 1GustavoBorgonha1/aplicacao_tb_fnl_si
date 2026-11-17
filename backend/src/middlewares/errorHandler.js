// Constituição II.6 — erros genéricos para o cliente, detalhes só no log.
import { HttpError } from '../errors.js';
import { logger } from '../logger.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ erro: 'Rota não encontrada' });
}

// Express identifica o handler de erro pelos 4 parâmetros — `_next` é obrigatório.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    const body = { erro: err.message };
    if (err.detalhes) body.detalhes = err.detalhes;
    return res.status(err.status).json(body);
  }
  // JSON malformado no body
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Requisição muito grande' });
  // Violação de UNIQUE no Postgres
  if (err.code === '23505') return res.status(409).json({ erro: 'Registro já existe' });
  // Erros 4xx de bibliotecas (ex.: express.static → 404 de arquivo inexistente)
  const status = err.status ?? err.statusCode;
  if (status >= 400 && status < 500) {
    return res.status(status).json({ erro: status === 404 ? 'Não encontrado' : 'Requisição inválida' });
  }

  logger.error({ err, path: req.path, method: req.method }, 'erro não tratado');
  return res.status(500).json({ erro: 'Erro interno' });
}

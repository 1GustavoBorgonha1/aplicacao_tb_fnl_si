/** Erro HTTP com mensagem segura para o cliente. */
export class HttpError extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

export const badRequest = (msg, detalhes) => new HttpError(400, msg, detalhes);
export const unauthorized = (msg = 'Não autenticado') => new HttpError(401, msg);
export const forbidden = (msg = 'Acesso negado') => new HttpError(403, msg);
export const notFound = (msg = 'Não encontrado') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

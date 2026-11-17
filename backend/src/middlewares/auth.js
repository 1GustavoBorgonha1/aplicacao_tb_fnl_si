// CA-001-07/08/09 — Autenticação e RBAC no servidor (constituição II.3).
import { query } from '../db/pool.js';
import { verifyToken } from '../services/token.js';
import { forbidden, unauthorized } from '../errors.js';

export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  const payload = verifyToken(token);
  if (!payload) throw unauthorized('Token inválido ou expirado');

  // ADR-04: revalida no banco — usuário desativado perde acesso na hora,
  // e a role usada é a do banco (não a do token).
  const { rows } = await query(
    'SELECT id, nome, email, role, ativo, token_versao FROM users WHERE id = $1',
    [Number(payload.sub)],
  );
  const user = rows[0];
  if (!user) throw unauthorized('Token inválido ou expirado');
  // RS-006-03 — token emitido antes da última troca de senha não vale mais (CA-006-05).
  if ((payload.tv ?? 0) !== user.token_versao) throw unauthorized('Sessão encerrada. Faça login novamente');
  if (!user.ativo) throw forbidden('Usuário desativado');

  req.user = user;
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user?.role)) throw forbidden();
    next();
  };

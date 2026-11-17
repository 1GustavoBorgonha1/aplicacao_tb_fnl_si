// RS-001-02 — JWT assinado (HS256) com expiração curta.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.JWT_EXPIRES_IN,
    issuer: 'marmifit',
  });
}

/** Retorna o payload ou `null` se o token for inválido/expirado. */
export function verifyToken(token) {
  try {
    // `algorithms` fixo impede ataque de troca para "none"/RS256.
    return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'marmifit' });
  } catch {
    return null;
  }
}

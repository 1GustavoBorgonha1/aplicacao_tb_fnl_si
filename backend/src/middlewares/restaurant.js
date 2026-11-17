// Spec 002 — carrega o restaurante do usuário logado (ADR-03: nunca vem do body/params).
import { query } from '../db/pool.js';
import { forbidden } from '../errors.js';

/**
 * @param {{ allowBlocked?: boolean }} opts allowBlocked=true só para o restaurante ver o próprio status.
 */
export const loadRestaurant =
  ({ allowBlocked = false } = {}) =>
  async (req, _res, next) => {
    const { rows } = await query('SELECT * FROM restaurants WHERE user_id = $1', [req.user.id]);
    const restaurant = rows[0];
    if (!restaurant) throw forbidden('Empresa não encontrada para este usuário');
    if (restaurant.status === 'bloqueado' && !allowBlocked) {
      throw forbidden('Empresa bloqueada. Entre em contato com o administrador.'); // CA-002-04
    }
    req.restaurant = restaurant;
    next();
  };

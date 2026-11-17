// Validação de entrada com zod (constituição II.1).
import { z } from 'zod';
import { badRequest } from './errors.js';

// Mensagens de validação em português.
z.config(z.locales.pt());

/** Valida `data` com `schema`; lança 400 com os campos inválidos. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Dados inválidos', z.flattenError(result.error).fieldErrors);
  }
  return result.data;
}

/** `:id` de rota: inteiro positivo (evita erro de cast virar 500). */
export const idParam = z.coerce.number().int().positive();

export const parseId = (value) => parse(idParam, value);

/** Texto: remove espaços nas pontas e caracteres de controle. */
export const texto = (min, max) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .pipe(z.string().min(min).max(max));

export const brl = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Maior preço aceito pelo backend (CA-003-08): R$ 1.000,00. */
export const PRECO_MAX_CENTAVOS = 100_000;

/**
 * Máscara "caixa registradora" (UX-003-01): só os dígitos contam e os dois últimos são os centavos.
 * "R$ 25,90" → 2590 · "2590" → 2590 · "abc" → null (campo vazio).
 */
export function centavosDeTexto(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return digitos ? Number(digitos) : null;
}

export const dataHora = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const CATEGORIAS = {
  tradicional: 'Tradicional',
  low_carb: 'Low carb',
  vegana: 'Vegana',
  vegetariana: 'Vegetariana',
  sem_gluten: 'Sem glúten',
};

export const STATUS_PEDIDO = {
  recebido: 'Recebido',
  em_preparo: 'Em preparo',
  pronto_retirada: 'Pronto p/ retirada',
  retirado: 'Retirado',
  cancelado: 'Cancelado',
};

export const STATUS_EMPRESA = { pendente: 'Pendente', aprovado: 'Aprovada', bloqueado: 'Bloqueada' };

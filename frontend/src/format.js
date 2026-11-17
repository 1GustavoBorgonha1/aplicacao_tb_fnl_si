export const brl = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "25,90" → 2590 */
export const toCentavos = (valor) => Math.round(Number(String(valor).replace(',', '.')) * 100);

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

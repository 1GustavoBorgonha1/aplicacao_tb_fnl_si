// Spec 002 (CA-002-06) e spec 004 (CA-004-10) — horário de retirada estruturado.
// O servidor roda em UTC; as regras de negócio valem no horário de Brasília.
export const FUSO = 'America/Sao_Paulo';

/** 0 = domingo … 6 = sábado (mesma convenção de Date.getDay). */
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const NUM_DIA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const partesSP = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "11:00:00" (TIME do Postgres) ou "11:00" → "11:00"; vazio/nulo → null. */
export const hhmm = (t) => (t ? String(t).slice(0, 5) : null);

/** Dia da semana (0–6) e hora "HH:MM" de um instante, no fuso de São Paulo. */
export function horaLocal(data) {
  const p = Object.fromEntries(partesSP.formatToParts(data).map(({ type, value }) => [type, value]));
  return { dia: NUM_DIA[p.weekday], hora: `${p.hour}:${p.minute}` };
}

/** Texto de exibição: "Seg a Sex · 11:00–14:00", "Seg, Qua, Sex · …", "Todos os dias · …". */
export function formatarHorario(dias, abre, fecha) {
  if (!abre || !fecha) return '';
  const ord = [...new Set(dias)].sort((a, b) => a - b);
  let texto;
  if (ord.length === 7) texto = 'Todos os dias';
  else if (ord.length >= 3 && ord.every((d, i) => i === 0 || d === ord[i - 1] + 1)) {
    texto = `${DIAS_CURTOS[ord[0]]} a ${DIAS_CURTOS[ord.at(-1)]}`;
  } else texto = ord.map((d) => DIAS_CURTOS[d]).join(', ');
  return `${texto} · ${hhmm(abre)}–${hhmm(fecha)}`;
}

/**
 * CA-004-10 — a retirada cai num dia permitido e dentro da janela (inclusive)?
 * Restaurante sem horário configurado aceita qualquer horário (vale só o CA-004-04).
 */
export function dentroDoHorario(data, { dias_retirada: dias, abre_as: abre, fecha_as: fecha }) {
  if (!abre || !fecha) return true;
  const { dia, hora } = horaLocal(data);
  return dias.includes(dia) && hora >= hhmm(abre) && hora <= hhmm(fecha);
}

/** Campos de horário prontos para a API (TIME → "HH:MM"). */
export const serializeRestaurante = (r) => ({ ...r, abre_as: hhmm(r.abre_as), fecha_as: hhmm(r.fecha_as) });

// Spec 002/004 — funções puras do horário de retirada (fuso de São Paulo).
import { describe, expect, it } from 'vitest';
import { dentroDoHorario, formatarHorario, horaLocal, hhmm } from '../src/horario.js';

describe('horario.js', () => {
  it('CA-004-10 converte o instante UTC para dia e hora de São Paulo', () => {
    // 18/11/2026 é quarta-feira: 15:30 UTC = 12:30 em Brasília.
    expect(horaLocal(new Date('2026-11-18T15:30:00Z'))).toEqual({ dia: 3, hora: '12:30' });
    // 02:00 UTC de quinta ainda é 23:00 de quarta em Brasília.
    expect(horaLocal(new Date('2026-11-19T02:00:00Z'))).toEqual({ dia: 3, hora: '23:00' });
  });

  it('CA-004-10 dentroDoHorario respeita dia e janela inclusiva', () => {
    const r = { dias_retirada: [3], abre_as: '11:00:00', fecha_as: '14:00:00' };
    expect(dentroDoHorario(new Date('2026-11-18T14:00:00Z'), r)).toBe(true); // 11:00
    expect(dentroDoHorario(new Date('2026-11-18T17:00:00Z'), r)).toBe(true); // 14:00
    expect(dentroDoHorario(new Date('2026-11-18T17:01:00Z'), r)).toBe(false); // 14:01
    expect(dentroDoHorario(new Date('2026-11-19T15:00:00Z'), r)).toBe(false); // quinta
    expect(dentroDoHorario(new Date('2026-11-19T15:00:00Z'), { dias_retirada: [1], abre_as: null, fecha_as: null })).toBe(true);
  });

  it('CA-002-06 formata o texto de exibição', () => {
    expect(formatarHorario([5, 4, 3, 2, 1], '11:00', '14:00')).toBe('Seg a Sex · 11:00–14:00');
    expect(formatarHorario([1, 2], '11:00', '14:00')).toBe('Seg, Ter · 11:00–14:00');
    expect(formatarHorario([1], null, null)).toBe('');
    expect(hhmm('09:05:00')).toBe('09:05');
    expect(hhmm(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { addDays, dowOf, getMonthMatrix, shiftMonth, startOfMonth, startOfWeek } from './date';

describe('virada de ano e mês', () => {
  it('addDays atravessa dezembro → janeiro corretamente', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('shiftMonth de dezembro para o próximo ano', () => {
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-01');
  });

  it('shiftMonth de janeiro para o ano anterior', () => {
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01');
  });
});

describe('ano bissexto', () => {
  it('2028 é bissexto: 29/02 existe e o dia seguinte é 01/03', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('2026 não é bissexto: 28/02 vai direto para 01/03', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('geração de agenda mensal', () => {
  it('getMonthMatrix cobre o mês inteiro em semanas de Segunda a Domingo', () => {
    const weeks = getMonthMatrix('2026-02-01'); // fevereiro 2026, não bissexto
    const flat = weeks.flat();
    expect(flat).toContain('2026-02-01');
    expect(flat).toContain('2026-02-28');
    expect(flat.length % 7).toBe(0);
  });

  it('getMonthMatrix funciona em fevereiro de ano bissexto (29 dias)', () => {
    const weeks = getMonthMatrix('2028-02-01');
    const flat = weeks.flat();
    expect(flat).toContain('2028-02-29');
  });

  it('startOfWeek retorna sempre uma Segunda-feira (dow = 1)', () => {
    for (const iso of ['2026-07-05', '2026-01-01', '2026-12-31']) {
      const monday = startOfWeek(iso);
      expect(dowOf(monday)).toBe(1);
    }
  });

  it('startOfMonth sempre retorna o dia 01', () => {
    expect(startOfMonth('2026-07-17')).toBe('2026-07-01');
  });
});

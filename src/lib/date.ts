import type { DiaSemana } from '../types';

export const DIA_LABELS: Record<DiaSemana, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

/** Ordem de exibição: Segunda a Domingo */
export const ORDEM_SEMANA: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0];

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function todayDow(): DiaSemana {
  return new Date().getDay() as DiaSemana;
}

export function dowOf(iso: string): DiaSemana {
  return fromISODate(iso).getDay() as DiaSemana;
}

export function addDays(iso: string, amount: number): string {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
}

/** Retorna a data (ISO) da Segunda-feira da semana que contém a data informada. */
export function startOfWeek(iso: string): string {
  const dow = dowOf(iso);
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(iso, diffToMonday);
}

export function formatDateLabel(iso: string): string {
  const date = fromISODate(iso);
  const dow = DIA_LABELS[date.getDay() as DiaSemana];
  const [, m, d] = iso.split('-').map(Number);
  return `${dow}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Primeiro dia (ISO, dia=01) do mês da data informada. */
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Soma (ou subtrai) meses, mantendo o dia 01. */
export function shiftMonth(iso: string, amount: number): string {
  const date = fromISODate(startOfMonth(iso));
  date.setMonth(date.getMonth() + amount);
  return toISODate(date);
}

export function monthLabel(iso: string): string {
  const date = fromISODate(startOfMonth(iso));
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/**
 * Monta a grade de semanas (Segunda a Domingo) que cobre o mês da data
 * informada, incluindo dias de meses adjacentes para completar as semanas.
 */
export function getMonthMatrix(iso: string): string[][] {
  const monthStart = startOfMonth(iso);
  const monthEnd = addDays(shiftMonth(iso, 1), -1);

  const weeks: string[][] = [];
  let cursor = startOfWeek(monthStart);
  while (cursor <= monthEnd) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

export function currentTimeHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

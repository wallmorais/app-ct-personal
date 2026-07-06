import type { AppData, Aluno, Registro, StatusAula } from '../types';
import { addDays, shiftMonth, startOfMonth, todayISO } from './date';

export interface DateRange {
  start: string; // YYYY-MM-DD (inclusivo)
  end: string; // YYYY-MM-DD (inclusivo)
}

export function currentMonthRange(): DateRange {
  const start = startOfMonth(todayISO());
  const end = addDays(shiftMonth(start, 1), -1);
  return { start, end };
}

export function previousMonthRange(): DateRange {
  const start = shiftMonth(startOfMonth(todayISO()), -1);
  const end = addDays(shiftMonth(start, 1), -1);
  return { start, end };
}

export interface ReposicaoStats {
  pendentes: number;
  concluidas: number;
  naoCompareceu: number;
  canceladas: number;
  total: number;
}

export interface AlunoStats {
  aluno: Aluno;
  presencas: number;
  faltas: number;
  reposicoes: number;
  reposicaoStats: ReposicaoStats;
  totalPlano: number;
  taxaPresenca: number; // 0-100
  faturamento: number;
}

export interface OverviewStats {
  totalPresencas: number;
  totalFaltas: number;
  totalReposicoes: number;
  faturamentoTotal: number;
  porAluno: AlunoStats[];
}

export function registrosNoPeriodo(registros: Registro[], range: DateRange = currentMonthRange()): Registro[] {
  return registros.filter((r) => r.data >= range.start && r.data <= range.end);
}

export function statsDoAluno(aluno: Aluno, registros: Registro[], range: DateRange = currentMonthRange()): AlunoStats {
  const doAluno = registros.filter((r) => r.alunoId === aluno.id);
  const doPeriodo = registrosNoPeriodo(doAluno, range);

  const presencasRegulares = doPeriodo.filter((r) => r.status === 'presente' && !r.reposicaoData).length;
  const presencasReposicao = doAluno.filter(
    (r) =>
      r.reposicaoStatus === 'concluida' &&
      !!r.reposicaoData &&
      r.reposicaoData >= range.start &&
      r.reposicaoData <= range.end,
  ).length;
  const presencas = presencasRegulares + presencasReposicao;

  const faltasRegulares = doPeriodo.filter((r) => r.status === 'falta' && !r.reposicaoData).length;
  const faltasReposicao = doAluno.filter(
    (r) =>
      r.reposicaoStatus === 'nao_compareceu' &&
      !!r.reposicaoData &&
      r.reposicaoData >= range.start &&
      r.reposicaoData <= range.end,
  ).length;
  const faltas = faltasRegulares + faltasReposicao;

  const reposicoesNoPeriodo = doAluno.filter(
    (r) => !!r.reposicaoData && r.reposicaoData >= range.start && r.reposicaoData <= range.end,
  );
  const reposicoes = reposicoesNoPeriodo.length;

  const reposicaoStats: ReposicaoStats = { pendentes: 0, concluidas: 0, naoCompareceu: 0, canceladas: 0, total: reposicoes };
  for (const r of reposicoesNoPeriodo) {
    const rs = r.reposicaoStatus ?? 'pendente';
    if (rs === 'concluida') reposicaoStats.concluidas++;
    else if (rs === 'nao_compareceu') reposicaoStats.naoCompareceu++;
    else if (rs === 'cancelada') reposicaoStats.canceladas++;
    else reposicaoStats.pendentes++;
  }

  const taxaPresenca = aluno.plano > 0 ? Math.round((presencas / aluno.plano) * 100) : 0;
  const faturamento = presencas * aluno.valorAula;

  return {
    aluno,
    presencas,
    faltas,
    reposicoes,
    reposicaoStats,
    totalPlano: aluno.plano,
    taxaPresenca,
    faturamento,
  };
}

export function overviewStats(data: AppData, range: DateRange = currentMonthRange()): OverviewStats {
  const porAluno = data.alunos.map((aluno) => statsDoAluno(aluno, data.registros, range));

  return {
    totalPresencas: porAluno.reduce((acc, s) => acc + s.presencas, 0),
    totalFaltas: porAluno.reduce((acc, s) => acc + s.faltas, 0),
    totalReposicoes: porAluno.reduce((acc, s) => acc + s.reposicoes, 0),
    faturamentoTotal: porAluno.reduce((acc, s) => acc + s.faturamento, 0),
    porAluno,
  };
}

export interface HistoricoEntry {
  id: string;
  data: string;
  horario: string;
  status: StatusAula;
  /** 'reagendamento' = esta linha representa o dia/horário da reposição (data de destino) */
  tipo: 'normal' | 'reagendamento';
  /** Para entradas 'reagendamento': de onde a aula foi remarcada */
  origem?: { data: string; horario: string };
  /** Para entradas 'normal' com reposição marcada: para onde a aula foi remarcada */
  reagendadoPara?: { data: string; horario: string };
  /** Observação opcional registrada ao marcar falta. */
  faltaObservacao?: string;
}

export function historicoDoAluno(
  aluno: Aluno,
  registros: Registro[],
  range: DateRange = currentMonthRange(),
): HistoricoEntry[] {
  const entries: HistoricoEntry[] = [];

  for (const r of registros) {
    if (r.alunoId !== aluno.id) continue;

    if (r.data >= range.start && r.data <= range.end) {
      entries.push({
        id: r.id,
        data: r.data,
        horario: r.horario,
        status: r.status,
        tipo: 'normal',
        reagendadoPara:
          r.reposicaoData && r.reposicaoHorario
            ? { data: r.reposicaoData, horario: r.reposicaoHorario }
            : undefined,
        faltaObservacao: r.faltaObservacao,
      });
    }

    if (
      r.reposicaoData &&
      r.reposicaoHorario &&
      r.reposicaoData >= range.start &&
      r.reposicaoData <= range.end
    ) {
      entries.push({
        id: `${r.id}-reagendamento`,
        data: r.reposicaoData,
        horario: r.reposicaoHorario,
        status: r.status,
        tipo: 'reagendamento',
        origem: { data: r.data, horario: r.horario },
        faltaObservacao: r.faltaObservacao,
      });
    }
  }

  return entries.sort((a, b) => a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario));
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

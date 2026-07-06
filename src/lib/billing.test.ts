import { describe, expect, it } from 'vitest';
import { overviewStats, statsDoAluno } from './billing';
import { buildAluno, buildEmptyData, uid } from './testFixtures';
import type { Registro } from '../types';

const range = { start: '2026-07-01', end: '2026-07-31' };

function buildRegistro(overrides: Partial<Registro> & Pick<Registro, 'alunoId'>): Registro {
  return {
    id: uid(),
    slotId: 'slot-1',
    data: '2026-07-06',
    horario: '07:00',
    status: 'pendente',
    ...overrides,
  };
}

describe('statsDoAluno — cálculos financeiros', () => {
  it('conta presenças regulares e calcula faturamento com o valor/aula do aluno', () => {
    const aluno = buildAluno({ valorAula: 150, plano: 8 });
    const registros = [
      buildRegistro({ alunoId: aluno.id, data: '2026-07-06', status: 'presente' }),
      buildRegistro({ alunoId: aluno.id, data: '2026-07-08', status: 'presente' }),
      buildRegistro({ alunoId: aluno.id, data: '2026-07-10', status: 'falta' }),
    ];
    const stats = statsDoAluno(aluno, registros, range);
    expect(stats.presencas).toBe(2);
    expect(stats.faltas).toBe(1);
    expect(stats.faturamento).toBe(300);
  });

  it('dois alunos com valores/aula diferentes no mesmo horário não se misturam', () => {
    const alunoA = buildAluno({ nome: 'A', valorAula: 100 });
    const alunoB = buildAluno({ nome: 'B', valorAula: 200 });
    const registros = [
      buildRegistro({ alunoId: alunoA.id, status: 'presente' }),
      buildRegistro({ alunoId: alunoB.id, status: 'presente' }),
    ];
    const overview = overviewStats(
      buildEmptyData({ alunos: [alunoA, alunoB], registros }),
      range,
    );
    const statsA = overview.porAluno.find((s) => s.aluno.id === alunoA.id)!;
    const statsB = overview.porAluno.find((s) => s.aluno.id === alunoB.id)!;
    expect(statsA.faturamento).toBe(100);
    expect(statsB.faturamento).toBe(200);
    expect(overview.faturamentoTotal).toBe(300);
  });

  it('conta reposição concluída com presença pela data em que ocorreu, não pela data original', () => {
    const aluno = buildAluno({ valorAula: 100 });
    const registros = [
      buildRegistro({
        alunoId: aluno.id,
        data: '2026-06-29',
        status: 'presente',
        reposicaoData: '2026-07-15',
        reposicaoHorario: '07:00',
        reposicaoStatus: 'concluida',
      }),
    ];
    const stats = statsDoAluno(aluno, registros, range);
    expect(stats.presencas).toBe(1);
    expect(stats.faturamento).toBe(100);
    expect(stats.reposicoes).toBe(1);
    expect(stats.reposicaoStats.concluidas).toBe(1);
  });

  it('falta na reposição (não compareceu) é contabilizada como falta', () => {
    const aluno = buildAluno({ valorAula: 100 });
    const registros = [
      buildRegistro({
        alunoId: aluno.id,
        data: '2026-06-29',
        status: 'falta',
        reposicaoData: '2026-07-15',
        reposicaoHorario: '07:00',
        reposicaoStatus: 'nao_compareceu',
      }),
    ];
    const stats = statsDoAluno(aluno, registros, range);
    expect(stats.faltas).toBe(1);
    expect(stats.presencas).toBe(0);
    expect(stats.reposicaoStats.naoCompareceu).toBe(1);
  });

  it('reposição cancelada não conta como presença nem falta', () => {
    const aluno = buildAluno({ valorAula: 100 });
    const registros = [
      buildRegistro({
        alunoId: aluno.id,
        data: '2026-06-29',
        status: 'reposicao',
        reposicaoData: '2026-07-15',
        reposicaoHorario: '07:00',
        reposicaoStatus: 'cancelada',
      }),
    ];
    const stats = statsDoAluno(aluno, registros, range);
    expect(stats.faltas).toBe(0);
    expect(stats.presencas).toBe(0);
    expect(stats.reposicaoStats.canceladas).toBe(1);
  });
});

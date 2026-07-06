import { describe, expect, it } from 'vitest';
import {
  findOverlappingVacation,
  getStudentStatusOnDate,
  isProfessorOnVacation,
  isStudentActiveOnDate,
  isStudentOnVacation,
  vacationsOverlap,
} from './periods';
import { buildAluno, buildEmptyData, uid } from './testFixtures';

describe('isProfessorOnVacation', () => {
  it('detecta data dentro de um período de férias', () => {
    const data = buildEmptyData({
      feriasProfessor: [{ id: uid(), dataInicio: '2026-07-08', dataFim: '2026-07-12', createdAt: '' }],
    });
    expect(isProfessorOnVacation(data, '2026-07-10')).toBe(true);
    expect(isProfessorOnVacation(data, '2026-07-13')).toBe(false);
  });

  it('lida com múltiplos períodos não contíguos', () => {
    const data = buildEmptyData({
      feriasProfessor: [
        { id: uid(), dataInicio: '2026-01-05', dataFim: '2026-01-10', createdAt: '' },
        { id: uid(), dataInicio: '2026-12-20', dataFim: '2026-12-31', createdAt: '' },
      ],
    });
    expect(isProfessorOnVacation(data, '2026-01-07')).toBe(true);
    expect(isProfessorOnVacation(data, '2026-06-01')).toBe(false);
    expect(isProfessorOnVacation(data, '2026-12-25')).toBe(true);
  });
});

describe('vacationsOverlap', () => {
  it('bloqueia períodos sobrepostos', () => {
    const existentes = [{ id: uid(), dataInicio: '2026-07-01', dataFim: '2026-07-10', createdAt: '' }];
    expect(vacationsOverlap(existentes, '2026-07-05', '2026-07-15')).toBe(true);
  });

  it('permite períodos adjacentes sem sobreposição', () => {
    const existentes = [{ id: uid(), dataInicio: '2026-07-01', dataFim: '2026-07-10', createdAt: '' }];
    expect(vacationsOverlap(existentes, '2026-07-11', '2026-07-20')).toBe(false);
  });

  it('ignora o próprio período ao editar (excludeId)', () => {
    const id = uid();
    const existentes = [{ id, dataInicio: '2026-07-01', dataFim: '2026-07-10', createdAt: '' }];
    expect(vacationsOverlap(existentes, '2026-07-01', '2026-07-10', id)).toBe(false);
  });

  it('funciona também com férias do aluno (BUG-06) — mesma função, sem createdAt/observacao', () => {
    const existentes = [{ id: uid(), dataInicio: '2026-07-01', dataFim: '2026-07-10' }];
    expect(vacationsOverlap(existentes, '2026-07-05', '2026-07-15')).toBe(true);
    expect(vacationsOverlap(existentes, '2026-07-11', '2026-07-20')).toBe(false);
  });
});

describe('findOverlappingVacation', () => {
  it('retorna o período conflitante para permitir o fluxo de substituição', () => {
    const conflitante = { id: uid(), dataInicio: '2026-07-01', dataFim: '2026-07-10' };
    const existentes = [conflitante, { id: uid(), dataInicio: '2026-08-01', dataFim: '2026-08-10' }];
    expect(findOverlappingVacation(existentes, '2026-07-05', '2026-07-15')).toBe(conflitante);
  });

  it('retorna undefined quando não há sobreposição', () => {
    const existentes = [{ id: uid(), dataInicio: '2026-07-01', dataFim: '2026-07-10' }];
    expect(findOverlappingVacation(existentes, '2026-07-11', '2026-07-20')).toBeUndefined();
  });
});

describe('ciclo de vida do aluno — getStudentStatusOnDate / isStudentActiveOnDate', () => {
  it('aluno novo sem matrícula e sem dataAdesao é considerado ativo (fallback legado)', () => {
    const aluno = buildAluno();
    const data = buildEmptyData({ alunos: [aluno] });
    expect(isStudentActiveOnDate(data, aluno.id, '2026-07-06')).toBe(true);
  });

  it('aluno com contrato encerrado some da agenda após a data de encerramento', () => {
    const aluno = buildAluno();
    const data = buildEmptyData({
      alunos: [aluno],
      matriculas: [
        { id: uid(), alunoId: aluno.id, dataInicio: '2026-01-05', dataFim: '2026-03-01', tipo: 'ATIVO', createdAt: '' },
        { id: uid(), alunoId: aluno.id, dataInicio: '2026-03-01', tipo: 'INATIVO', createdAt: '' },
      ],
    });
    expect(isStudentActiveOnDate(data, aluno.id, '2026-02-15')).toBe(true);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-03-01')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-06-01')).toBe(false);
  });

  it('aluno com múltiplos períodos de férias — status FERIAS só durante os períodos', () => {
    const aluno = buildAluno();
    const data = buildEmptyData({
      alunos: [aluno],
      matriculas: [
        { id: uid(), alunoId: aluno.id, dataInicio: '2026-01-01', tipo: 'ATIVO', createdAt: '' },
        { id: uid(), alunoId: aluno.id, dataInicio: '2026-02-01', dataFim: '2026-02-10', tipo: 'FERIAS', createdAt: '' },
        { id: uid(), alunoId: aluno.id, dataInicio: '2026-07-08', dataFim: '2026-07-12', tipo: 'FERIAS', createdAt: '' },
      ],
    });
    expect(isStudentOnVacation(data, aluno.id, '2026-02-05')).toBe(true);
    expect(isStudentOnVacation(data, aluno.id, '2026-03-01')).toBe(false);
    expect(isStudentOnVacation(data, aluno.id, '2026-07-10')).toBe(true);
    expect(getStudentStatusOnDate(data, aluno.id, '2026-03-01')).toBe('ATIVO');
  });

  it(
    'BUG-04 (conhecido): reativar um aluno sem atualizar dataAdesao preenche retroativamente o período de inatividade como ATIVO',
    () => {
      const aluno = buildAluno();
      // Simula exatamente o rebuild feito por AlunosView.handleSave ao "limpar" dataEncerramento
      // sem tocar em dataAdesao: sobra um único registro ATIVO sem dataFim, cobrindo o gap.
      const data = buildEmptyData({
        alunos: [aluno],
        matriculas: [{ id: uid(), alunoId: aluno.id, dataInicio: '2026-01-05', tipo: 'ATIVO', createdAt: '' }],
      });

      // Comportamento correto esperado: o aluno deveria estar INATIVO durante o "gap"
      // (o período em que o contrato esteve encerrado antes da reativação).
      const statusNoGap = isStudentActiveOnDate(data, aluno.id, '2026-03-15');

      // Este teste documenta o bug atual (ver relatório de auditoria, BUG-04) — ele passa
      // hoje confirmando que o comportamento é o INCORRETO. Quando a estrutura de matrículas
      // passar a suportar múltiplos períodos ATIVO, troque para `.not.fails` / remova o `.fails`
      // e ajuste a asserção para `toBe(false)`.
      expect(statusNoGap).toBe(true);
    },
  );
});

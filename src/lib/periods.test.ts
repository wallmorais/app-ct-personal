import { describe, expect, it } from 'vitest';
import {
  applyProfessorAbsence,
  cancelProfessorAbsence,
  findHorarioConflict,
  findOverlappingVacation,
  getStudentStatusOnDate,
  isProfessorOnVacation,
  isStudentActiveOnDate,
  isStudentOnVacation,
  previewAbsenceCancel,
  previewProfessorAbsence,
  tipoMovimentacao,
  vacationsOverlap,
} from './periods';
import { buildAluno, buildEmptyData, uid } from './testFixtures';
import type { AulaSlot, Registro, StudentSchedule } from '../types';

function buildRegistro(overrides: Partial<Registro> & Pick<Registro, 'alunoId'>): Registro {
  return {
    id: uid(),
    slotId: 'slot-1',
    data: '2026-07-10',
    horario: '07:00',
    status: 'pendente',
    ...overrides,
  };
}

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

describe('tipoMovimentacao — derivado por comparação de datas (Antecipação de Aula)', () => {
  it('retorna null quando não há movimentação (reposicaoData ausente)', () => {
    const r = buildRegistro({ alunoId: uid(), data: '2026-07-10' });
    expect(tipoMovimentacao(r)).toBeNull();
  });

  it('reposicaoData posterior à data original => reposicao', () => {
    const r = buildRegistro({
      alunoId: uid(),
      data: '2026-07-10',
      reposicaoData: '2026-07-15',
      reposicaoHorario: '07:00',
    });
    expect(tipoMovimentacao(r)).toBe('reposicao');
  });

  it('reposicaoData anterior à data original => antecipacao', () => {
    const r = buildRegistro({
      alunoId: uid(),
      data: '2026-07-10',
      reposicaoData: '2026-07-08',
      reposicaoHorario: '07:00',
    });
    expect(tipoMovimentacao(r)).toBe('antecipacao');
  });
});

describe('findHorarioConflict — conflito só entre movimentações avulsas, não contra a grade regular', () => {
  it('detecta conflito quando OUTRO aluno já tem uma movimentação na mesma data+horário', () => {
    const alunoA = uid();
    const alunoB = uid();
    const data = buildEmptyData({
      registros: [
        buildRegistro({
          alunoId: alunoA,
          data: '2026-07-10',
          reposicaoData: '2026-08-06',
          reposicaoHorario: '07:00',
          reposicaoStatus: 'pendente',
        }),
      ],
    });
    const conflito = findHorarioConflict(data, '2026-08-06', '07:00', alunoB);
    expect(conflito).toBeDefined();
    expect(conflito?.alunoId).toBe(alunoA);
  });

  it('não considera conflito uma movimentação do MESMO aluno (reagendamento)', () => {
    const alunoA = uid();
    const data = buildEmptyData({
      registros: [
        buildRegistro({
          alunoId: alunoA,
          data: '2026-07-10',
          reposicaoData: '2026-08-06',
          reposicaoHorario: '07:00',
          reposicaoStatus: 'pendente',
        }),
      ],
    });
    expect(findHorarioConflict(data, '2026-08-06', '07:00', alunoA)).toBeUndefined();
  });

  it('ignora movimentações canceladas', () => {
    const alunoA = uid();
    const alunoB = uid();
    const data = buildEmptyData({
      registros: [
        buildRegistro({
          alunoId: alunoA,
          data: '2026-07-10',
          reposicaoData: '2026-08-06',
          reposicaoHorario: '07:00',
          reposicaoStatus: 'cancelada',
        }),
      ],
    });
    expect(findHorarioConflict(data, '2026-08-06', '07:00', alunoB)).toBeUndefined();
  });

  it('não bloqueia horários diferentes no mesmo dia', () => {
    const alunoA = uid();
    const alunoB = uid();
    const data = buildEmptyData({
      registros: [
        buildRegistro({
          alunoId: alunoA,
          data: '2026-07-10',
          reposicaoData: '2026-08-06',
          reposicaoHorario: '07:00',
          reposicaoStatus: 'pendente',
        }),
      ],
    });
    expect(findHorarioConflict(data, '2026-08-06', '08:00', alunoB)).toBeUndefined();
  });
});

describe('Ausência do Professor', () => {
  const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6] as const;

  function buildGroupFixture() {
    const alunoA = buildAluno({ nome: 'A' });
    const alunoB = buildAluno({ nome: 'B' });
    const alunoC = buildAluno({ nome: 'C' });
    const slot: AulaSlot = { id: uid(), horario: '08:00' };
    const schedules: StudentSchedule[] = [
      { id: uid(), alunoId: alunoA.id, slotId: slot.id, dias: [...TODOS_OS_DIAS] },
      { id: uid(), alunoId: alunoB.id, slotId: slot.id, dias: [...TODOS_OS_DIAS] },
      { id: uid(), alunoId: alunoC.id, slotId: slot.id, dias: [...TODOS_OS_DIAS] },
    ];
    const data = buildEmptyData({ alunos: [alunoA, alunoB, alunoC], slots: [slot], schedules });
    return { data, alunoA, alunoB, alunoC, slot };
  }

  it('uma única ausência afeta todos os alunos do mesmo slot compartilhado', () => {
    const { data, alunoA, alunoB, alunoC } = buildGroupFixture();
    const result = applyProfessorAbsence(data, '2026-07-08', 'doenca', 'Consulta médica');

    expect(result.registros).toHaveLength(3);
    for (const alunoId of [alunoA.id, alunoB.id, alunoC.id]) {
      const r = result.registros.find((x) => x.alunoId === alunoId);
      expect(r?.status).toBe('falta');
      expect(r?.faltaProfessor).toBe(true);
    }
    expect(result.ausenciasProfessor).toHaveLength(1);
    expect(result.ausenciasProfessor[0].data).toBe('2026-07-08');
    expect(result.ausenciasProfessor[0].motivo).toBe('doenca');
  });

  it('não sobrescreve registro que já tem status definido pelo professor', () => {
    const { data, alunoA, alunoB, slot } = buildGroupFixture();
    const jaPresente: Registro = {
      id: uid(),
      alunoId: alunoA.id,
      slotId: slot.id,
      data: '2026-07-08',
      horario: '08:00',
      status: 'presente',
    };
    const comRegistro = buildEmptyData({ ...data, registros: [jaPresente] });
    const result = applyProfessorAbsence(comRegistro, '2026-07-08', 'imprevisto');

    const rA = result.registros.find((r) => r.alunoId === alunoA.id);
    const rB = result.registros.find((r) => r.alunoId === alunoB.id);
    expect(rA?.status).toBe('presente');
    expect(rA?.faltaProfessor).toBeUndefined();
    expect(rB?.status).toBe('falta');
    expect(rB?.faltaProfessor).toBe(true);
  });

  it('atualiza registro pendente existente para falta + faltaProfessor, sem duplicar', () => {
    const { data, alunoA, slot } = buildGroupFixture();
    const pendente: Registro = {
      id: uid(),
      alunoId: alunoA.id,
      slotId: slot.id,
      data: '2026-07-08',
      horario: '08:00',
      status: 'pendente',
    };
    const comRegistro = buildEmptyData({ ...data, registros: [pendente] });
    const result = applyProfessorAbsence(comRegistro, '2026-07-08', 'outro');

    const registrosDoAluno = result.registros.filter((r) => r.alunoId === alunoA.id);
    expect(registrosDoAluno).toHaveLength(1);
    expect(registrosDoAluno[0].id).toBe(pendente.id);
    expect(registrosDoAluno[0].status).toBe('falta');
    expect(registrosDoAluno[0].faltaProfessor).toBe(true);
  });

  it('previewProfessorAbsence reporta quantas aulas serão afetadas vs. já registradas', () => {
    const { data, alunoA, slot } = buildGroupFixture();
    const jaFalta: Registro = {
      id: uid(),
      alunoId: alunoA.id,
      slotId: slot.id,
      data: '2026-07-08',
      horario: '08:00',
      status: 'falta',
      faltaTipo: 'avisada',
    };
    const comRegistro = buildEmptyData({ ...data, registros: [jaFalta] });
    const preview = previewProfessorAbsence(comRegistro, '2026-07-08');
    expect(preview.afetadas).toBe(2); // B e C, pendentes
    expect(preview.jaRegistradas).toBe(1); // A, já com falta avisada
  });

  it('cenário 1: ausência com reposição agendada não pode ser cancelada — ausência e reposição permanecem intactas', () => {
    const { data, alunoA } = buildGroupFixture();
    const comAusencia = applyProfessorAbsence(data, '2026-07-08', 'doenca');
    const absence = comAusencia.ausenciasProfessor[0];

    // Simula o professor agendando uma reposição para o aluno A (via updateRegistro em
    // App.tsx, que preserva faltaProfessor por não passar status='presente').
    const comReposicao = {
      ...comAusencia,
      registros: comAusencia.registros.map((r) =>
        r.alunoId === alunoA.id
          ? { ...r, status: 'reposicao' as const, reposicaoData: '2026-07-20', reposicaoHorario: '09:00', reposicaoStatus: 'pendente' as const }
          : r,
      ),
    };

    const preview = previewAbsenceCancel(comReposicao, absence);
    expect(preview.cancelable).toBe(false);
    expect(preview.blockedReason).toMatch(/não pode ser cancelada/i);

    const afterCancelAttempt = cancelProfessorAbsence(comReposicao, absence.id);
    // Nada muda: operação atômica, bloqueada por completo.
    expect(afterCancelAttempt.ausenciasProfessor).toHaveLength(1);
    expect(afterCancelAttempt.ausenciasProfessor[0].id).toBe(absence.id);
    const rA = afterCancelAttempt.registros.find((r) => r.alunoId === alunoA.id);
    expect(rA?.status).toBe('reposicao');
    expect(rA?.reposicaoData).toBe('2026-07-20');
    expect(rA?.faltaProfessor).toBe(true);
  });

  it('cenário 2: ausência cancelada antes de qualquer ação reverte tudo para pendente', () => {
    const { data, alunoA, alunoB, alunoC } = buildGroupFixture();
    const comAusencia = applyProfessorAbsence(data, '2026-07-08', 'compromisso_pessoal');
    const absence = comAusencia.ausenciasProfessor[0];

    const preview = previewAbsenceCancel(comAusencia, absence);
    expect(preview.cancelable).toBe(true);
    expect(preview.revertCount).toBe(3);

    const result = cancelProfessorAbsence(comAusencia, absence.id);

    expect(result.ausenciasProfessor).toHaveLength(0);
    for (const alunoId of [alunoA.id, alunoB.id, alunoC.id]) {
      const r = result.registros.find((x) => x.alunoId === alunoId);
      expect(r?.status).toBe('pendente');
      expect(r?.faltaProfessor).toBeUndefined();
    }
  });

  it('cancelamento parcialmente alterado (1 de 3 alunos com reposição) bloqueia o cancelamento inteiro', () => {
    const { data, alunoA, alunoB, alunoC } = buildGroupFixture();
    const comAusencia = applyProfessorAbsence(data, '2026-07-08', 'doenca');
    const absence = comAusencia.ausenciasProfessor[0];

    const misto = {
      ...comAusencia,
      registros: comAusencia.registros.map((r) =>
        r.alunoId === alunoB.id
          ? { ...r, status: 'reposicao' as const, reposicaoData: '2026-07-22', reposicaoHorario: '08:00', reposicaoStatus: 'pendente' as const }
          : r,
      ),
    };

    const preview = previewAbsenceCancel(misto, absence);
    expect(preview.cancelable).toBe(false);

    const result = cancelProfessorAbsence(misto, absence.id);
    // Atômico: nem os revertíveis (A e C) são tocados.
    const rA = result.registros.find((r) => r.alunoId === alunoA.id);
    const rC = result.registros.find((r) => r.alunoId === alunoC.id);
    expect(rA?.status).toBe('falta');
    expect(rA?.faltaProfessor).toBe(true);
    expect(rC?.status).toBe('falta');
    expect(rC?.faltaProfessor).toBe(true);
    expect(result.ausenciasProfessor).toHaveLength(1);
  });
});

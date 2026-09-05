import { describe, expect, it } from 'vitest';
import {
  applyProfessorAbsence,
  cancelProfessorAbsence,
  findHorarioConflict,
  findOverlappingVacation,
  getEtapasAtivas,
  getEtapaCorrente,
  getStudentStatusOnDate,
  isProfessorOnVacation,
  isStudentActiveOnDate,
  isStudentOnVacation,
  previewAbsenceCancel,
  previewProfessorAbsence,
  rebuildMatriculasDoAluno,
  tipoMovimentacao,
  vacationsOverlap,
  validarEtapas,
} from './periods';
import { historicoDoAluno, statsDoAluno } from './billing';
import { buildAluno, buildEmptyData, uid } from './testFixtures';
import type { AppData, AulaSlot, Registro, StudentEnrollment, StudentSchedule } from '../types';

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

  it('fallback escalar: aluno COM histórico e nenhuma matrícula cobrindo a data → inativo (não cai no escalar)', () => {
    // dataAdesao escalar aponta para a 1ª etapa; sem a correção, o gap viraria ativo (BUG-04).
    const aluno = buildAluno({ dataAdesao: '2026-01-01' });
    const data = buildEmptyData({
      alunos: [aluno],
      matriculas: [
        { id: uid(), alunoId: aluno.id, dataInicio: '2026-01-01', dataFim: '2026-06-30', tipo: 'ATIVO', createdAt: '1' },
        { id: uid(), alunoId: aluno.id, dataInicio: '2026-09-01', tipo: 'ATIVO', createdAt: '2' },
        // deliberadamente SEM INATIVO cobrindo 07/01..08/31
      ],
    });
    expect(getStudentStatusOnDate(data, aluno.id, '2026-07-15')).toBeNull();
    expect(isStudentActiveOnDate(data, aluno.id, '2026-07-15')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2025-12-31')).toBe(false); // antes da 1ª etapa
  });

  it('fallback escalar: aluno SEM histórico continua usando dataAdesao (dado legado)', () => {
    const aluno = buildAluno({ dataAdesao: '2026-03-01' });
    const data = buildEmptyData({ alunos: [aluno] });
    expect(isStudentActiveOnDate(data, aluno.id, '2026-02-28')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-03-01')).toBe(true);
  });

  it('1. sem nenhuma matrícula: fallback legado (sem dataAdesao, considera sempre ativo)', () => {
    const aluno = buildAluno(); // dataAdesao/matriculas ausentes
    const data = buildEmptyData({ alunos: [aluno] });
    expect(isStudentActiveOnDate(data, aluno.id, '2020-01-01')).toBe(true);
    expect(isStudentActiveOnDate(data, aluno.id, '2030-01-01')).toBe(true);
  });

  it('2. uma única matrícula ATIVO aberta (caso Rocilda): não conta como histórico real, mantém fallback legado', () => {
    // dataAdesao escalar nula + uma única ATIVO aberta criada pelo fluxo legado (ex.: buildSeedData
    // antigo, ou primeiro save de um aluno sem preencher "Data de adesão").
    const aluno = buildAluno({ dataAdesao: undefined });
    const data = buildEmptyData({
      alunos: [aluno],
      matriculas: [
        { id: uid(), alunoId: aluno.id, dataInicio: '2026-09-05', tipo: 'ATIVO', createdAt: '1' },
      ],
    });
    // Data anterior à matrícula: getStudentStatusOnDate → null (dataInicio > date).
    expect(getStudentStatusOnDate(data, aluno.id, '2026-07-15')).toBeNull();
    // Sem histórico real (1 única ATIVO aberta) e sem dataAdesao escalar → fallback = sempre ativo.
    expect(isStudentActiveOnDate(data, aluno.id, '2026-07-15')).toBe(true);
    expect(isStudentActiveOnDate(data, aluno.id, '2020-01-01')).toBe(true);
    // Dentro do período coberto pela matrícula, continua ativo normalmente.
    expect(isStudentActiveOnDate(data, aluno.id, '2026-09-05')).toBe(true);
  });

  it('3. uma única matrícula ATIVO fechada: já é histórico real — fora do período é inativo', () => {
    const aluno = buildAluno({ dataAdesao: '2026-01-01' });
    const data = buildEmptyData({
      alunos: [aluno],
      matriculas: [
        { id: uid(), alunoId: aluno.id, dataInicio: '2026-01-01', dataFim: '2026-06-30', tipo: 'ATIVO', createdAt: '1' },
      ],
    });
    expect(isStudentActiveOnDate(data, aluno.id, '2026-06-30')).toBe(true);
    // Depois do encerramento: histórico real (ATIVO com dataFim) → inativo, mesmo sem INATIVO explícito.
    expect(isStudentActiveOnDate(data, aluno.id, '2026-07-01')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2027-01-01')).toBe(false);
  });
});

/* ============================================================
 * BUG-04 — Reativação como nova etapa (matrículas ATIVO como histórico)
 * ============================================================ */

const NOW = '2026-09-05T12:00:00.000Z';

/** Estado com N etapas já persistidas, construído pelo próprio rebuild (write path real). */
function comEtapas(aluno: ReturnType<typeof buildAluno>, etapas: { inicio: string; fim?: string }[]): AppData {
  let data = buildEmptyData({ alunos: [aluno] });
  // 1ª etapa
  let r = rebuildMatriculasDoAluno([], {
    alunoId: aluno.id,
    anteriores: [],
    corrente: { dataInicio: etapas[0].inicio, dataFim: etapas[0].fim },
    ferias: [],
  }, NOW);
  data = { ...data, matriculas: r.matriculas, alunos: [{ ...aluno, dataAdesao: r.dataAdesao, dataEncerramento: r.dataEncerramento }] };
  // Demais etapas via reativação explícita, fechando cada uma antes da próxima
  for (let i = 1; i < etapas.length; i++) {
    const corrente = getEtapaCorrente(data, aluno.id)!;
    const anteriores = getEtapasAtivas(data, aluno.id).slice(0, -1).map((e) => ({ id: e.id, dataInicio: e.dataInicio, dataFim: e.dataFim }));
    r = rebuildMatriculasDoAluno(data.matriculas, {
      alunoId: aluno.id,
      anteriores,
      corrente: { id: corrente.id, dataInicio: corrente.dataInicio, dataFim: corrente.dataFim },
      reativacao: { dataInicio: etapas[i].inicio },
      ferias: [],
    }, NOW);
    data = { ...data, matriculas: r.matriculas, alunos: [{ ...data.alunos[0], dataAdesao: r.dataAdesao, dataEncerramento: r.dataEncerramento }] };
    if (etapas[i].fim) {
      // encerra a nova etapa corrente (edição normal da etapa aberta)
      const c = getEtapaCorrente(data, aluno.id)!;
      const ant = getEtapasAtivas(data, aluno.id).slice(0, -1).map((e) => ({ id: e.id, dataInicio: e.dataInicio, dataFim: e.dataFim }));
      r = rebuildMatriculasDoAluno(data.matriculas, {
        alunoId: aluno.id,
        anteriores: ant,
        corrente: { id: c.id, dataInicio: c.dataInicio, dataFim: etapas[i].fim },
        ferias: [],
      }, NOW);
      data = { ...data, matriculas: r.matriculas, alunos: [{ ...data.alunos[0], dataAdesao: r.dataAdesao, dataEncerramento: r.dataEncerramento }] };
    }
  }
  return data;
}

function ativos(data: AppData, alunoId: string): StudentEnrollment[] {
  return getEtapasAtivas(data, alunoId);
}
function inativos(data: AppData, alunoId: string): StudentEnrollment[] {
  return data.matriculas.filter((m) => m.alunoId === alunoId && m.tipo === 'INATIVO').sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
}

describe('BUG-04 — fronteiras inclusivas entre etapas ATIVO e gaps INATIVO', () => {
  it('A–E: 30/06 ativo, 01/07–31/08 inativo, 01/09 ativo', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [{ inicio: '2026-01-01', fim: '2026-06-30' }, { inicio: '2026-09-01' }]);

    expect(isStudentActiveOnDate(data, aluno.id, '2026-06-30')).toBe(true); // A
    expect(isStudentActiveOnDate(data, aluno.id, '2026-07-01')).toBe(false); // B
    expect(isStudentActiveOnDate(data, aluno.id, '2026-07-15')).toBe(false); // C
    expect(isStudentActiveOnDate(data, aluno.id, '2026-08-31')).toBe(false); // D
    expect(isStudentActiveOnDate(data, aluno.id, '2026-09-01')).toBe(true); // E

    // O INATIVO derivado nunca começa no dia do encerramento nem termina no dia da nova adesão.
    const [gap] = inativos(data, aluno.id);
    expect(gap.dataInicio).toBe('2026-07-01');
    expect(gap.dataFim).toBe('2026-08-31');
    expect(getStudentStatusOnDate(data, aluno.id, '2026-06-30')).toBe('ATIVO');
    expect(getStudentStatusOnDate(data, aluno.id, '2026-07-01')).toBe('INATIVO');
    expect(getStudentStatusOnDate(data, aluno.id, '2026-08-31')).toBe('INATIVO');
    expect(getStudentStatusOnDate(data, aluno.id, '2026-09-01')).toBe('ATIVO');
  });

  it('virada de mês: 31/01 ativo → 01/02 inativo; 28/02 inativo → 01/03 ativo (2026, não bissexto)', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [{ inicio: '2026-01-01', fim: '2026-01-31' }, { inicio: '2026-03-01' }]);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-01-31')).toBe(true);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-02-01')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-02-28')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-03-01')).toBe(true);
    const [gap] = inativos(data, aluno.id);
    expect(gap.dataInicio).toBe('2026-02-01');
    expect(gap.dataFim).toBe('2026-02-28');
  });

  it('ano bissexto: gap termina em 29/02/2028 quando a nova etapa começa em 01/03/2028', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [{ inicio: '2028-01-01', fim: '2028-01-31' }, { inicio: '2028-03-01' }]);
    expect(isStudentActiveOnDate(data, aluno.id, '2028-02-29')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2028-03-01')).toBe(true);
    const [gap] = inativos(data, aluno.id);
    expect(gap.dataFim).toBe('2028-02-29');
  });

  it('virada de ano: 31/12 ativo → 01/01 inativo', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [{ inicio: '2026-06-01', fim: '2026-12-31' }, { inicio: '2027-02-01' }]);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-12-31')).toBe(true);
    expect(isStudentActiveOnDate(data, aluno.id, '2027-01-01')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2027-01-31')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2027-02-01')).toBe(true);
    const [gap] = inativos(data, aluno.id);
    expect(gap.dataInicio).toBe('2027-01-01');
    expect(gap.dataFim).toBe('2027-01-31');
  });

  it('etapa encerrada sem reativação: INATIVO em aberto a partir do dia seguinte', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [{ inicio: '2026-01-01', fim: '2026-06-30' }]);
    const [gap] = inativos(data, aluno.id);
    expect(gap.dataInicio).toBe('2026-07-01');
    expect(gap.dataFim).toBeUndefined();
    expect(isStudentActiveOnDate(data, aluno.id, '2026-06-30')).toBe(true);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-07-01')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2027-12-31')).toBe(false);
  });

  it('etapas adjacentes (reativação no dia seguinte ao encerramento): sem INATIVO, sem sobreposição', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [{ inicio: '2026-01-01', fim: '2026-06-30' }, { inicio: '2026-07-01' }]);
    expect(inativos(data, aluno.id)).toHaveLength(0);
    expect(ativos(data, aluno.id)).toHaveLength(2);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-06-30')).toBe(true);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-07-01')).toBe(true);
  });
});

describe('BUG-04 — ciclo de vida das etapas (write path)', () => {
  it('F: ativo → encerrado → reativado produz 2 ATIVO + 1 INATIVO, sem alterar a etapa anterior', () => {
    const aluno = buildAluno();
    const soAtivo = comEtapas(aluno, [{ inicio: '2026-01-01' }]);
    const etapa1Id = ativos(soAtivo, aluno.id)[0].id;

    const data = comEtapas(aluno, [{ inicio: '2026-01-01', fim: '2026-06-30' }, { inicio: '2026-09-01' }]);
    const a = ativos(data, aluno.id);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ dataInicio: '2026-01-01', dataFim: '2026-06-30', tipo: 'ATIVO' });
    expect(a[1]).toMatchObject({ dataInicio: '2026-09-01', tipo: 'ATIVO' });
    expect(a[1].dataFim).toBeUndefined();
    expect(inativos(data, aluno.id)).toHaveLength(1);
    // escalares espelham a etapa corrente (a nova)
    expect(data.alunos[0].dataAdesao).toBe('2026-09-01');
    expect(data.alunos[0].dataEncerramento).toBeUndefined();
    // sanidade: o rebuild em separado gera ids distintos por execução, mas dentro de uma
    // mesma linha de estado a etapa 1 mantém o id desde a criação (ver teste K).
    expect(etapa1Id).toBeTruthy();
  });

  it('G: três etapas ATIVO → INATIVO → ATIVO → INATIVO → ATIVO, sem sobreposição e sem gap ativo', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [
      { inicio: '2026-01-01', fim: '2026-06-30' },
      { inicio: '2026-09-01', fim: '2026-11-30' },
      { inicio: '2027-03-01' },
    ]);
    const a = ativos(data, aluno.id);
    const i = inativos(data, aluno.id);
    expect(a.map((e) => [e.dataInicio, e.dataFim])).toEqual([
      ['2026-01-01', '2026-06-30'],
      ['2026-09-01', '2026-11-30'],
      ['2027-03-01', undefined],
    ]);
    expect(i.map((e) => [e.dataInicio, e.dataFim])).toEqual([
      ['2026-07-01', '2026-08-31'],
      ['2026-12-01', '2027-02-28'],
    ]);
    // janelas ativas
    for (const d of ['2026-01-01', '2026-06-30', '2026-09-01', '2026-11-30', '2027-03-01', '2027-12-31']) {
      expect(isStudentActiveOnDate(data, aluno.id, d), d).toBe(true);
    }
    // gaps
    for (const d of ['2026-07-01', '2026-08-31', '2026-12-01', '2027-01-15', '2027-02-28', '2025-12-31']) {
      expect(isStudentActiveOnDate(data, aluno.id, d), d).toBe(false);
    }
    expect(data.alunos[0].dataAdesao).toBe('2027-03-01');
  });

  it('H: edição normal da etapa atual (em aberto) NÃO cria nova matrícula — mesmo id', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [{ inicio: '2026-01-01' }]);
    const corrente = getEtapaCorrente(data, aluno.id)!;

    const r = rebuildMatriculasDoAluno(data.matriculas, {
      alunoId: aluno.id,
      anteriores: [],
      corrente: { id: corrente.id, dataInicio: '2026-01-05', dataFim: undefined }, // corrigiu a adesão
      ferias: [],
    }, NOW);
    const a = r.matriculas.filter((m) => m.alunoId === aluno.id && m.tipo === 'ATIVO');
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe(corrente.id);
    expect(a[0].createdAt).toBe(corrente.createdAt);
    expect(a[0].dataInicio).toBe('2026-01-05');
    expect(r.dataAdesao).toBe('2026-01-05');
  });

  it('I: correção da data de uma etapa antiga NÃO cria nova etapa nem altera a etapa corrente/escalares', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [{ inicio: '2026-01-01', fim: '2026-06-30' }, { inicio: '2026-09-01' }]);
    const [etapa1, etapa2] = ativos(data, aluno.id);

    // Professor corrige a etapa 1: 05/01 → 30/06 (sem tocar em nada da etapa 2)
    const r = rebuildMatriculasDoAluno(data.matriculas, {
      alunoId: aluno.id,
      anteriores: [{ id: etapa1.id, dataInicio: '2026-01-05', dataFim: '2026-06-30' }],
      corrente: { id: etapa2.id, dataInicio: etapa2.dataInicio, dataFim: etapa2.dataFim },
      ferias: [],
    }, NOW);
    const a = r.matriculas.filter((m) => m.alunoId === aluno.id && m.tipo === 'ATIVO').sort((x, y) => x.dataInicio.localeCompare(y.dataInicio));
    expect(a).toHaveLength(2); // nenhuma etapa nova
    expect(a[0]).toMatchObject({ id: etapa1.id, dataInicio: '2026-01-05', dataFim: '2026-06-30' });
    expect(a[1]).toMatchObject({ id: etapa2.id, dataInicio: '2026-09-01' });
    expect(a[1].dataFim).toBeUndefined();
    // escalares continuam sendo os da etapa corrente (etapa 2), não os da etapa corrigida
    expect(r.dataAdesao).toBe('2026-09-01');
    expect(r.dataEncerramento).toBeUndefined();
  });

  it('J: reativação cria exatamente UMA nova etapa e preserva a anterior byte a byte', () => {
    const aluno = buildAluno();
    const encerrado = comEtapas(aluno, [{ inicio: '2026-01-01', fim: '2026-06-30' }]);
    const etapa1Antes = ativos(encerrado, aluno.id)[0];

    const r = rebuildMatriculasDoAluno(encerrado.matriculas, {
      alunoId: aluno.id,
      anteriores: [],
      corrente: { id: etapa1Antes.id, dataInicio: etapa1Antes.dataInicio, dataFim: etapa1Antes.dataFim },
      reativacao: { dataInicio: '2026-09-01' },
      ferias: [],
    }, NOW);
    const a = r.matriculas.filter((m) => m.alunoId === aluno.id && m.tipo === 'ATIVO').sort((x, y) => x.dataInicio.localeCompare(y.dataInicio));
    expect(a).toHaveLength(2);
    expect(a[0]).toEqual(etapa1Antes); // intacta: id, datas, createdAt
    expect(a[1]).toMatchObject({ dataInicio: '2026-09-01', tipo: 'ATIVO' });
    expect(a[1].dataFim).toBeUndefined();
    expect(a[1].id).not.toBe(etapa1Antes.id);
  });

  it('K: histórico de etapas fechadas permanece inalterado após vários saves de outras etapas', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [
      { inicio: '2026-01-01', fim: '2026-06-30' },
      { inicio: '2026-09-01', fim: '2026-11-30' },
      { inicio: '2027-03-01' },
    ]);
    const [e1, e2, e3] = ativos(data, aluno.id);

    // save 1: edita só a etapa corrente (e3) — encerra em 31/05/2027
    let r = rebuildMatriculasDoAluno(data.matriculas, {
      alunoId: aluno.id,
      anteriores: [e1, e2].map((e) => ({ id: e.id, dataInicio: e.dataInicio, dataFim: e.dataFim })),
      corrente: { id: e3.id, dataInicio: e3.dataInicio, dataFim: '2027-05-31' },
      ferias: [],
    }, '2027-06-01T00:00:00.000Z');
    // save 2: reativa de novo em 01/08/2027
    const e3b = r.matriculas.find((m) => m.id === e3.id)!;
    r = rebuildMatriculasDoAluno(r.matriculas, {
      alunoId: aluno.id,
      anteriores: [e1, e2].map((e) => ({ id: e.id, dataInicio: e.dataInicio, dataFim: e.dataFim })),
      corrente: { id: e3b.id, dataInicio: e3b.dataInicio, dataFim: e3b.dataFim },
      reativacao: { dataInicio: '2027-08-01' },
      ferias: [],
    }, '2027-08-01T00:00:00.000Z');

    expect(r.matriculas.find((m) => m.id === e1.id)).toEqual(e1);
    expect(r.matriculas.find((m) => m.id === e2.id)).toEqual(e2);
    expect(r.matriculas.filter((m) => m.alunoId === aluno.id && m.tipo === 'ATIVO')).toHaveLength(4);
  });

  it('matrículas de OUTROS alunos não são tocadas pelo rebuild', () => {
    const a1 = buildAluno({ nome: 'A' });
    const a2 = buildAluno({ nome: 'B' });
    const d1 = comEtapas(a1, [{ inicio: '2026-01-01' }]);
    const outra: StudentEnrollment = { id: uid(), alunoId: a2.id, dataInicio: '2025-05-01', tipo: 'ATIVO', createdAt: 'x' };
    const r = rebuildMatriculasDoAluno([...d1.matriculas, outra], {
      alunoId: a1.id,
      anteriores: [],
      corrente: { id: getEtapaCorrente(d1, a1.id)!.id, dataInicio: '2026-01-01', dataFim: '2026-02-28' },
      ferias: [],
    }, NOW);
    expect(r.matriculas.find((m) => m.id === outra.id)).toEqual(outra);
  });

  it('FERIAS preservam id e convivem com múltiplas etapas', () => {
    const aluno = buildAluno();
    const data = comEtapas(aluno, [{ inicio: '2026-01-01', fim: '2026-06-30' }, { inicio: '2026-09-01' }]);
    const [e1, e2] = ativos(data, aluno.id);
    const feriasId = uid();
    const r = rebuildMatriculasDoAluno(data.matriculas, {
      alunoId: aluno.id,
      anteriores: [{ id: e1.id, dataInicio: e1.dataInicio, dataFim: e1.dataFim }],
      corrente: { id: e2.id, dataInicio: e2.dataInicio, dataFim: e2.dataFim },
      ferias: [{ id: feriasId, dataInicio: '2026-10-01', dataFim: '2026-10-10' }],
    }, NOW);
    const d = { ...data, matriculas: r.matriculas };
    expect(isStudentOnVacation(d, aluno.id, '2026-10-05')).toBe(true);
    expect(isStudentActiveOnDate(d, aluno.id, '2026-10-05')).toBe(false); // FERIAS ≠ ATIVO
    expect(isStudentActiveOnDate(d, aluno.id, '2026-10-11')).toBe(true);
    expect(r.matriculas.find((m) => m.id === feriasId)?.tipo).toBe('FERIAS');
  });
});

describe('BUG-04 — validarEtapas (mesma regra do formulário e do rebuild)', () => {
  it('bloqueia reativação com etapa corrente em aberto', () => {
    expect(validarEtapas({ anteriores: [], corrente: { dataInicio: '2026-01-01' }, reativacao: { dataInicio: '2026-09-01' } })).toMatch(/encerrada/);
  });
  it('bloqueia reativação no mesmo dia ou antes do encerramento', () => {
    const corrente = { dataInicio: '2026-01-01', dataFim: '2026-06-30' };
    expect(validarEtapas({ anteriores: [], corrente, reativacao: { dataInicio: '2026-06-30' } })).toMatch(/depois do encerramento/);
    expect(validarEtapas({ anteriores: [], corrente, reativacao: { dataInicio: '2026-03-01' } })).toMatch(/depois do encerramento/);
    expect(validarEtapas({ anteriores: [], corrente, reativacao: { dataInicio: '2026-07-01' } })).toBeNull();
  });
  it('bloqueia sobreposição entre etapa anterior corrigida e a corrente', () => {
    expect(validarEtapas({
      anteriores: [{ dataInicio: '2026-01-01', dataFim: '2026-09-15' }],
      corrente: { dataInicio: '2026-09-01' },
    })).toMatch(/sobrepor/);
  });
  it('bloqueia etapa anterior sem encerramento', () => {
    expect(validarEtapas({
      anteriores: [{ dataInicio: '2026-01-01' }],
      corrente: { dataInicio: '2026-09-01' },
    })).toMatch(/em aberto/);
  });
  it('bloqueia encerramento anterior à adesão', () => {
    expect(validarEtapas({ anteriores: [], corrente: { dataInicio: '2026-06-01', dataFim: '2026-05-01' } })).toMatch(/anterior à adesão/);
  });
  it('rebuild lança o mesmo erro que validarEtapas devolve', () => {
    expect(() => rebuildMatriculasDoAluno([], {
      alunoId: 'x', anteriores: [], corrente: { dataInicio: '2026-01-01' }, reativacao: { dataInicio: '2026-09-01' }, ferias: [],
    })).toThrow(/encerrada/);
  });
});

describe('BUG-04 — regressão: Agenda, Histórico, Relatórios, Reposição, Ausência', () => {
  function fixtureComAulas() {
    const aluno = buildAluno({ valorAula: 100, plano: 8 });
    const slot: AulaSlot = { id: uid(), horario: '08:00' };
    const schedule: StudentSchedule = { id: uid(), alunoId: aluno.id, slotId: slot.id, dias: [0, 1, 2, 3, 4, 5, 6] };
    const base = comEtapas(aluno, [{ inicio: '2026-01-01', fim: '2026-06-30' }, { inicio: '2026-09-01' }]);
    // Aulas históricas da etapa 1 (intactas) — incluindo uma falta avisada com reposição agendada
    const registros: Registro[] = [
      { id: uid(), alunoId: aluno.id, slotId: slot.id, data: '2026-06-10', horario: '08:00', status: 'presente' },
      { id: uid(), alunoId: aluno.id, slotId: slot.id, data: '2026-06-15', horario: '08:00', status: 'presente', faltaTipo: 'nao_avisada' },
      { id: uid(), alunoId: aluno.id, slotId: slot.id, data: '2026-06-20', horario: '08:00', status: 'reposicao', faltaTipo: 'avisada', reposicaoData: '2026-06-25', reposicaoHorario: '09:00', reposicaoStatus: 'pendente' },
    ];
    return { data: { ...base, slots: [slot], schedules: [schedule], registros }, aluno, slot };
  }

  it('L/M: mesma função da Agenda — aluno some no gap e volta na nova etapa', () => {
    const { data, aluno } = fixtureComAulas();
    expect(isStudentActiveOnDate(data, aluno.id, '2026-06-30')).toBe(true);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-07-15')).toBe(false);
    expect(isStudentActiveOnDate(data, aluno.id, '2026-09-01')).toBe(true);
  });

  it('N: ausência do professor no gap NÃO cria aula retroativa para o aluno inativo', () => {
    const { data, aluno } = fixtureComAulas();
    const r = applyProfessorAbsence(data, '2026-07-15', 'doenca');
    expect(r.registros.filter((x) => x.alunoId === aluno.id && x.data === '2026-07-15')).toHaveLength(0);
    // e na etapa nova, cria normalmente
    const r2 = applyProfessorAbsence(data, '2026-09-02', 'doenca');
    expect(r2.registros.filter((x) => x.alunoId === aluno.id && x.data === '2026-09-02')).toHaveLength(1);
  });

  it('O: relatório do gap não tem nada do aluno; relatório da etapa 1 continua íntegro', () => {
    const { data, aluno } = fixtureComAulas();
    const gap = statsDoAluno(aluno, data.registros, { start: '2026-07-01', end: '2026-08-31' });
    expect(gap.presencas).toBe(0);
    expect(gap.faltas).toBe(0);
    expect(gap.faturamento).toBe(0);
    expect(historicoDoAluno(aluno, data.registros, { start: '2026-07-01', end: '2026-08-31' })).toHaveLength(0);

    const etapa1 = statsDoAluno(aluno, data.registros, { start: '2026-06-01', end: '2026-06-30' });
    expect(etapa1.presencas).toBe(2); // presença + não avisada
    expect(etapa1.faltasNaoAvisadas).toBe(1);
    expect(etapa1.faturamento).toBe(200);
    expect(etapa1.reposicaoStats.pendentes).toBe(1);
  });

  it('P: reposição originada na etapa anterior permanece intacta (rebuild não toca registros)', () => {
    const { data, aluno } = fixtureComAulas();
    const antes = data.registros.find((r) => r.reposicaoData === '2026-06-25')!;
    const [e1, e2] = ativos(data, aluno.id);
    const r = rebuildMatriculasDoAluno(data.matriculas, {
      alunoId: aluno.id,
      anteriores: [{ id: e1.id, dataInicio: '2026-01-05', dataFim: e1.dataFim }],
      corrente: { id: e2.id, dataInicio: e2.dataInicio, dataFim: e2.dataFim },
      ferias: [],
    }, NOW);
    expect(r.matriculas.some((m) => m.alunoId === aluno.id)).toBe(true);
    expect(data.registros.find((x) => x.id === antes.id)).toEqual(antes);
    expect(historicoDoAluno(aluno, data.registros, { start: '2026-06-01', end: '2026-06-30' }).some((h) => h.tipo === 'reagendamento')).toBe(true);
  });
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

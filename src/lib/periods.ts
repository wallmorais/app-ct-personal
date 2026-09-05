import type {
  AppData,
  MotivoAusencia,
  ProfessorAbsence,
  ProfessorVacation,
  Registro,
  StudentEnrollment,
  StudentStatus,
  TipoMovimentacao,
} from '../types';
import { dowOf } from './date';

export function isProfessorOnVacation(data: AppData, date: string): boolean {
  if (!data.feriasProfessor) return false;
  return data.feriasProfessor.some((v) => date >= v.dataInicio && date <= v.dataFim);
}

/** Ausência pontual (dia inteiro) — distinta de férias. Uma ausência por data. */
export function isProfessorAbsent(data: AppData, date: string): boolean {
  if (!data.ausenciasProfessor) return false;
  return data.ausenciasProfessor.some((a) => a.data === date);
}

export function getAbsencesInRange(data: AppData, start: string, end: string): ProfessorAbsence[] {
  if (!data.ausenciasProfessor) return [];
  return data.ausenciasProfessor.filter((a) => a.data >= start && a.data <= end);
}

export function getStudentStatusOnDate(data: AppData, alunoId: string, date: string): StudentStatus | null {
  if (!data.matriculas) return null;
  const enrollments = data.matriculas
    .filter((m) => m.alunoId === alunoId && m.dataInicio <= date)
    .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio) || b.createdAt.localeCompare(a.createdAt));

  for (const e of enrollments) {
    if (!e.dataFim || e.dataFim >= date) return e.tipo;
  }

  return null;
}

export function isStudentActiveOnDate(data: AppData, alunoId: string, date: string): boolean {
  const status = getStudentStatusOnDate(data, alunoId, date);
  if (status === null) {
    // No enrollment records — check legacy dataAdesao, otherwise consider active
    const aluno = data.alunos.find((a) => a.id === alunoId);
    if (aluno?.dataAdesao) return date >= aluno.dataAdesao;
    return true;
  }
  return status === 'ATIVO';
}

export function isStudentOnVacation(data: AppData, alunoId: string, date: string): boolean {
  return getStudentStatusOnDate(data, alunoId, date) === 'FERIAS';
}

export interface VacationLike {
  id: string;
  dataInicio: string;
  dataFim: string;
}

/** Genérica: usada tanto para férias do professor quanto do aluno — mesma regra de interseção de datas. */
export function vacationsOverlap<T extends VacationLike>(existing: T[], newStart: string, newEnd: string, excludeId?: string): boolean {
  return existing.some((v) => {
    if (v.id === excludeId) return false;
    return newStart <= v.dataFim && newEnd >= v.dataInicio;
  });
}

/** Retorna o primeiro período conflitante (se houver), para permitir o fluxo de "substituir". */
export function findOverlappingVacation<T extends VacationLike>(existing: T[], newStart: string, newEnd: string, excludeId?: string): T | undefined {
  return existing.find((v) => {
    if (v.id === excludeId) return false;
    return newStart <= v.dataFim && newEnd >= v.dataInicio;
  });
}

export function getVacationsInRange(data: AppData, start: string, end: string): ProfessorVacation[] {
  return data.feriasProfessor.filter((v) => v.dataInicio <= end && v.dataFim >= start);
}

export function getEnrollmentsForStudent(data: AppData, alunoId: string): StudentEnrollment[] {
  if (!data.matriculas) return [];
  return data.matriculas
    .filter((m) => m.alunoId === alunoId)
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
}

export function getVacationsAll(data: AppData): ProfessorVacation[] {
  if (!data.feriasProfessor) return [];
  return [...data.feriasProfessor].sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
}

/**
 * Deriva o tipo de movimentação comparando a data de destino com a data original.
 * Nunca é persistido — sempre recalculado a partir de `data` e `reposicaoData`.
 * Retorna null se o registro não tem movimentação (reposicaoData não definida).
 */
export function tipoMovimentacao(registro: Registro): TipoMovimentacao | null {
  if (!registro.reposicaoData) return null;
  return registro.reposicaoData < registro.data ? 'antecipacao' : 'reposicao';
}

/**
 * Verifica se já existe, para OUTRO aluno, uma reposição/antecipação avulsa landing
 * na mesma data+horário. Deliberadamente NÃO verifica a grade regular (StudentSchedule),
 * pois o app suporta aulas em grupo (vários alunos no mesmo horário por design) — um
 * conflito só faz sentido entre movimentações avulsas, não contra a grade recorrente.
 */
export function findHorarioConflict(
  data: AppData,
  novaData: string,
  novoHorario: string,
  excludeAlunoId: string,
  excludeRegistroId?: string,
): Registro | undefined {
  return data.registros.find((r) => {
    if (r.id === excludeRegistroId) return false;
    if (r.alunoId === excludeAlunoId) return false;
    if (r.reposicaoStatus === 'cancelada') return false;
    return r.reposicaoData === novaData && r.reposicaoHorario === novoHorario;
  });
}

/* ============================================================
 * AUSÊNCIA DO PROFESSOR
 * ============================================================
 * Ausência de dia inteiro: uma única ProfessorAbsence, identificada por data,
 * afeta automaticamente todas as aulas daquele dia (todos os alunos, mesmo
 * slot compartilhado). Não há relação explícita ausência↔registro — a ligação
 * é implícita por `registro.data === ausencia.data && registro.faltaProfessor`.
 * Isso mantém a solução simples (sem nova entidade de "ocorrência" ou FK).
 * ============================================================ */

/** Preview do impacto de registrar uma ausência em `dataISO`, antes de aplicar. */
export interface AbsenceImpactPreview {
  /** Aulas que serão marcadas como Falta do Professor (estavam pendentes ou não existiam). */
  afetadas: number;
  /** Aulas que já tinham um status definido pelo professor — não serão alteradas. */
  jaRegistradas: number;
}

export function previewProfessorAbsence(data: AppData, dataISO: string): AbsenceImpactPreview {
  const dow = dowOf(dataISO);
  let afetadas = 0;
  let jaRegistradas = 0;

  for (const schedule of data.schedules) {
    if (!schedule.dias.includes(dow)) continue;
    if (!isStudentActiveOnDate(data, schedule.alunoId, dataISO)) continue;
    const slot = data.slots.find((s) => s.id === schedule.slotId);
    if (!slot) continue;

    const existing = data.registros.find(
      (r) => r.alunoId === schedule.alunoId && r.slotId === schedule.slotId && r.data === dataISO,
    );
    if (!existing || existing.status === 'pendente') afetadas++;
    else jaRegistradas++;
  }

  return { afetadas, jaRegistradas };
}

/**
 * Registra uma ausência do professor em `dataISO` e cria/atualiza os registros
 * das aulas afetadas. Nunca sobrescreve um registro com status já definido
 * pelo professor (presente/falta/reposicao) — apenas cria os inexistentes e
 * atualiza os que estavam 'pendente'.
 */
export function applyProfessorAbsence(
  data: AppData,
  dataISO: string,
  motivo: MotivoAusencia,
  observacao?: string,
): AppData {
  const dow = dowOf(dataISO);
  const registros = [...data.registros];

  for (const schedule of data.schedules) {
    if (!schedule.dias.includes(dow)) continue;
    if (!isStudentActiveOnDate(data, schedule.alunoId, dataISO)) continue;
    const slot = data.slots.find((s) => s.id === schedule.slotId);
    if (!slot) continue;

    const idx = registros.findIndex(
      (r) => r.alunoId === schedule.alunoId && r.slotId === schedule.slotId && r.data === dataISO,
    );

    if (idx === -1) {
      registros.push({
        id: crypto.randomUUID(),
        alunoId: schedule.alunoId,
        slotId: schedule.slotId,
        data: dataISO,
        horario: slot.horario,
        status: 'falta',
        faltaProfessor: true,
      });
    } else if (registros[idx].status === 'pendente') {
      registros[idx] = { ...registros[idx], status: 'falta', faltaProfessor: true };
    }
    // status já definido pelo professor (presente/falta/reposicao): não altera.
  }

  const novaAusencia: ProfessorAbsence = {
    id: crypto.randomUUID(),
    data: dataISO,
    motivo,
    observacao: observacao?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  return {
    ...data,
    registros,
    ausenciasProfessor: [...data.ausenciasProfessor, novaAusencia],
  };
}

export interface AbsenceCancelPreview {
  cancelable: boolean;
  revertCount: number;
  blockedReason?: string;
}

/**
 * Verifica se uma ausência pode ser cancelada: só é revertível se TODAS as
 * aulas que ela afetou continuarem exatamente no estado inicial (status='falta',
 * faltaProfessor=true, sem nenhuma reposição). Qualquer alteração posterior do
 * professor (reposição agendada/concluída/cancelada, ou reclassificação como
 * presença/falta do aluno) já limpa `faltaProfessor` ou seta `reposicaoData`
 * (ver updateRegistro em App.tsx) — o que torna o registro correspondente
 * detectável aqui sem precisar de um vínculo explícito ausência↔registro.
 */
export function previewAbsenceCancel(data: AppData, absence: ProfessorAbsence): AbsenceCancelPreview {
  const afetados = data.registros.filter((r) => r.faltaProfessor && r.data === absence.data);

  const alterado = afetados.some((r) => r.status !== 'falta' || !!r.reposicaoData || !!r.reposicaoStatus);
  if (alterado) {
    return {
      cancelable: false,
      revertCount: 0,
      blockedReason:
        'Esta ausência não pode ser cancelada porque uma ou mais aulas já foram alteradas ou possuem reposição agendada.',
    };
  }

  return { cancelable: true, revertCount: afetados.length };
}

/**
 * Cancela a ausência de forma atômica: OU remove a ausência e reverte todas as
 * aulas revertíveis para 'pendente', OU não faz nada (se previewAbsenceCancel
 * indicar bloqueio). O chamador deve checar `previewAbsenceCancel` antes de
 * chamar esta função e não permitir a ação na UI quando `cancelable=false`.
 */
export function cancelProfessorAbsence(data: AppData, absenceId: string): AppData {
  const absence = data.ausenciasProfessor.find((a) => a.id === absenceId);
  if (!absence) return data;

  const preview = previewAbsenceCancel(data, absence);
  if (!preview.cancelable) return data;

  const registros = data.registros.map((r) => {
    if (r.faltaProfessor && r.data === absence.data && r.status === 'falta' && !r.reposicaoData) {
      const { faltaProfessor: _drop, ...rest } = r;
      return { ...rest, status: 'pendente' as const };
    }
    return r;
  });

  return {
    ...data,
    registros,
    ausenciasProfessor: data.ausenciasProfessor.filter((a) => a.id !== absenceId),
  };
}

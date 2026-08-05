import type { AppData, ProfessorVacation, Registro, StudentEnrollment, StudentStatus, TipoMovimentacao } from '../types';

export function isProfessorOnVacation(data: AppData, date: string): boolean {
  if (!data.feriasProfessor) return false;
  return data.feriasProfessor.some((v) => date >= v.dataInicio && date <= v.dataFim);
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

import type { AppData, ProfessorVacation, StudentEnrollment, StudentStatus } from '../types';

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

export function vacationsOverlap(existing: ProfessorVacation[], newStart: string, newEnd: string, excludeId?: string): boolean {
  return existing.some((v) => {
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

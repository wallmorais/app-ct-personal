import type { AppData, Aluno } from '../types';

let seq = 0;
export function uid(): string {
  seq += 1;
  return `test-id-${seq}`;
}

export function buildEmptyData(overrides: Partial<AppData> = {}): AppData {
  return {
    alunos: [],
    slots: [],
    schedules: [],
    registros: [],
    config: {
      notificationTime: '21:00',
      nomeProfissional: 'Teste',
      registroProfissional: 'Personal Trainer',
    },
    pagamentos: [],
    feriasProfessor: [],
    matriculas: [],
    ...overrides,
  };
}

export function buildAluno(overrides: Partial<Aluno> = {}): Aluno {
  return {
    id: uid(),
    nome: 'Aluno Teste',
    telefone: '',
    plano: 8,
    valorAula: 100,
    observacoes: '',
    ...overrides,
  };
}

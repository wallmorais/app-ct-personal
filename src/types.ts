export interface Aluno {
  id: string;
  nome: string;
  telefone: string;
  plano: number; // nº de aulas contratadas no mês
  valorAula: number; // valor por aula em R$
  observacoes: string;
}

/** 0 = Domingo ... 6 = Sábado (compatível com Date.getDay()) */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface AulaSlot {
  id: string;
  horario: string; // "07:00"
  horarioFim?: string; // "08:00"
  dias: DiaSemana[];
  alunoIds: string[];
}

export type StatusAula = 'pendente' | 'presente' | 'falta' | 'reposicao';

export interface Registro {
  id: string;
  alunoId: string;
  slotId: string;
  data: string; // YYYY-MM-DD (data da aula original)
  horario: string;
  status: StatusAula;
  reposicaoData?: string;
  reposicaoHorario?: string;
}

export interface ConfigData {
  notificationTime: string; // "HH:MM"
}

export interface AppData {
  alunos: Aluno[];
  slots: AulaSlot[];
  registros: Registro[];
  config: ConfigData;
}

export type ViewName = 'agenda' | 'alunos' | 'relatorios' | 'config';

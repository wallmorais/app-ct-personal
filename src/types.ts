export interface Aluno {
  id: string;
  nome: string;
  telefone: string;
  plano: number; // nº de aulas contratadas no mês
  valorAula: number; // valor por aula em R$
  observacoes: string;
  aniversario?: string; // YYYY-MM-DD
  objetivo?: string; // ex: "Emagrecimento", "Hipertrofia"
  restricoes?: string; // restrições médicas
  dataAdesao?: string; // YYYY-MM-DD — aluno só aparece na agenda a partir desta data
}

export type StatusPagamento = 'pendente' | 'pago' | 'atrasado';

export interface Pagamento {
  alunoId: string;
  mes: string; // YYYY-MM
  status: StatusPagamento;
  dataPagamento?: string; // YYYY-MM-DD
  valor: number;
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
  /** Observação opcional registrada ao marcar falta (ex.: motivo, aviso prévio). */
  faltaObservacao?: string;
}

export interface FeriasPeriodo {
  inicio: string; // YYYY-MM-DD
  fim: string; // YYYY-MM-DD
}

export interface ProfessorVacation {
  id: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  observacao?: string;
  createdAt: string; // ISO
}

export type StudentStatus = 'ATIVO' | 'FERIAS' | 'INATIVO';

export interface StudentEnrollment {
  id: string;
  alunoId: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim?: string; // YYYY-MM-DD (null = período em aberto)
  tipo: StudentStatus;
  observacao?: string;
  createdAt: string; // ISO
}

export interface ConfigData {
  notificationTime: string; // "HH:MM"
  nomeProfissional: string;
  registroProfissional: string;
  ferias?: FeriasPeriodo; // legado — mantido para migração
}

export interface AppData {
  alunos: Aluno[];
  slots: AulaSlot[];
  registros: Registro[];
  config: ConfigData;
  pagamentos: Pagamento[];
  feriasProfessor: ProfessorVacation[];
  matriculas: StudentEnrollment[];
}

export type ViewName = 'hoje' | 'reposicoes' | 'alunos' | 'relatorios' | 'config';

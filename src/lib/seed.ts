import type { AppData, Aluno, AulaSlot } from '../types';

const uid = () => crypto.randomUUID();

export function buildSeedData(): AppData {
  const alunos: Aluno[] = [
    { id: uid(), nome: 'Mauricio', telefone: '(11) 90000-0001', plano: 12, valorAula: 100, observacoes: '' },
    { id: uid(), nome: 'Adriana', telefone: '(11) 90000-0002', plano: 12, valorAula: 100, observacoes: '' },
    { id: uid(), nome: 'Fernanda', telefone: '(11) 90000-0003', plano: 12, valorAula: 110, observacoes: '' },
    { id: uid(), nome: 'Rocilda', telefone: '(11) 90000-0004', plano: 8, valorAula: 100, observacoes: '' },
    { id: uid(), nome: 'Cris', telefone: '(11) 90000-0005', plano: 8, valorAula: 100, observacoes: '' },
    { id: uid(), nome: 'Maria Luiza', telefone: '(11) 90000-0006', plano: 8, valorAula: 120, observacoes: '' },
    { id: uid(), nome: 'Rodrigo', telefone: '(11) 90000-0007', plano: 12, valorAula: 90, observacoes: '' },
  ];

  const byName = (nome: string) => alunos.find((a) => a.nome === nome)!.id;

  // dias: 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado
  const slots: AulaSlot[] = [
    {
      id: uid(),
      horario: '07:00',
      dias: [1, 3, 5],
      alunoIds: [byName('Mauricio'), byName('Adriana')],
    },
    {
      id: uid(),
      horario: '08:00',
      dias: [1, 3, 5],
      alunoIds: [byName('Fernanda')],
    },
    {
      id: uid(),
      horario: '10:00',
      dias: [1, 3, 5],
      alunoIds: [byName('Rocilda'), byName('Cris')],
    },
    {
      id: uid(),
      horario: '09:00',
      dias: [1, 3],
      alunoIds: [byName('Maria Luiza')],
    },
    {
      id: uid(),
      horario: '07:00',
      dias: [2, 4],
      alunoIds: [byName('Rodrigo')],
    },
  ];

  return {
    alunos,
    slots,
    registros: [],
    pagamentos: [],
    feriasProfessor: [],
    matriculas: [],
    config: {
      notificationTime: '21:00',
      nomeProfissional: 'Wal Morais',
      registroProfissional: 'Personal Trainer',
    },
  };
}

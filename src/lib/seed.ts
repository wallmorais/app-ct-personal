import type { AppData, Aluno, AulaSlot, StudentSchedule } from '../types';

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

  const slot07MQS: AulaSlot = { id: uid(), horario: '07:00' };
  const slot08MQS: AulaSlot = { id: uid(), horario: '08:00' };
  const slot10MQS: AulaSlot = { id: uid(), horario: '10:00' };
  const slot09MQ: AulaSlot = { id: uid(), horario: '09:00' };
  const slot07TQ: AulaSlot = { id: uid(), horario: '07:00' };

  const slots: AulaSlot[] = [slot07MQS, slot08MQS, slot10MQS, slot09MQ, slot07TQ];

  const schedules: StudentSchedule[] = [
    { id: uid(), alunoId: byName('Mauricio'), slotId: slot07MQS.id, dias: [1, 3, 5] },
    { id: uid(), alunoId: byName('Adriana'), slotId: slot07MQS.id, dias: [1, 3, 5] },
    { id: uid(), alunoId: byName('Fernanda'), slotId: slot08MQS.id, dias: [1, 3, 5] },
    { id: uid(), alunoId: byName('Rocilda'), slotId: slot10MQS.id, dias: [1, 3, 5] },
    { id: uid(), alunoId: byName('Cris'), slotId: slot10MQS.id, dias: [1, 3, 5] },
    { id: uid(), alunoId: byName('Maria Luiza'), slotId: slot09MQ.id, dias: [1, 3] },
    { id: uid(), alunoId: byName('Rodrigo'), slotId: slot07TQ.id, dias: [2, 4] },
  ];

  return {
    alunos,
    slots,
    schedules,
    registros: [],
    pagamentos: [],
    feriasProfessor: [],
    matriculas: [],
    config: {
      notificationTime: '21:00',
      nomeProfissional: 'Professor(a) Demo',
      registroProfissional: 'Personal Trainer',
    },
  };
}

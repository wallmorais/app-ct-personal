// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import AlunoFormModal from './AlunoFormModal';
import type { Aluno, AulaSlot, Registro, StudentEnrollment, StudentSchedule } from '../types';

afterEach(cleanup);

type Props = Parameters<typeof AlunoFormModal>[0];

/** Renderiza o modal com props mínimas de criação, sobrepostas pelo cenário do teste. */
function renderModal(overrides: Partial<Props> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const onDelete = vi.fn();
  const props: Props = {
    aluno: null,
    slots: [],
    schedules: [],
    studentVacations: [],
    etapasAtivas: [],
    registros: [],
    onSave,
    onClose,
    onDelete,
    ...overrides,
  };
  render(<AlunoFormModal {...props} />);
  return { onSave, onClose, onDelete };
}

describe('AlunoFormModal — integração entre a UI e o callback onSave', () => {
  it('criação de aluno + agenda: nome, dia e horários selecionados chegam corretos no payload', () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo Aluno Teste' } });
    fireEvent.click(screen.getByLabelText('Seg'));
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Término'), { target: { value: '10:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [alunoArg, agendaArg] = onSave.mock.calls[0];
    expect(alunoArg.nome).toBe('Novo Aluno Teste');
    expect(agendaArg).toEqual([{ dia: 1, inicio: '09:00', fim: '10:00' }]);
  });

  it('edição de aluno: reconstrói a agenda existente (buildInitialAgenda) e preserva o dia/horário ao salvar', () => {
    const aluno: Aluno = { id: 'a1', nome: 'Rodrigo', telefone: '11900000000', plano: 8, valorAula: 100, observacoes: '' };
    const slots: AulaSlot[] = [{ id: 's1', horario: '09:00', horarioFim: '10:00' }];
    const schedules: StudentSchedule[] = [{ id: 'sch1', alunoId: 'a1', slotId: 's1', dias: [3] }]; // Quarta

    const { onSave } = renderModal({ aluno, slots, schedules });

    // A agenda já deve vir reconstruída a partir de schedules/slots existentes.
    const checkboxQua = screen.getByLabelText('Qua') as HTMLInputElement;
    expect(checkboxQua.checked).toBe(true);
    expect((screen.getByLabelText('Início') as HTMLInputElement).value).toBe('09:00');
    expect((screen.getByLabelText('Término') as HTMLInputElement).value).toBe('10:00');

    // Altera uma informação simples, sem tocar na agenda.
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11988887777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [alunoArg, agendaArg] = onSave.mock.calls[0];
    expect(alunoArg.telefone).toBe('11988887777');
    expect(alunoArg.nome).toBe('Rodrigo');
    expect(agendaArg).toEqual([{ dia: 3, inicio: '09:00', fim: '10:00' }]);
  });

  it('nome vazio bloqueia a submissão e exibe a mensagem de validação existente', () => {
    const { onSave } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Informe o nome do aluno.')).toBeTruthy();
  });

  it('horário inválido (término antes do início) bloqueia a submissão', () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Aluno Teste' } });
    fireEvent.click(screen.getByLabelText('Seg'));
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('Término'), { target: { value: '09:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('O término deve ser depois do início.')).toBeTruthy();
  });

  it('exclusão de etapa anterior com aula registrada no período é bloqueada na UI', () => {
    const aluno: Aluno = { id: 'a1', nome: 'Rodrigo', telefone: '', plano: 8, valorAula: 100, observacoes: '' };
    const etapaAntiga: StudentEnrollment = {
      id: 'e1', alunoId: 'a1', dataInicio: '2024-01-01', dataFim: '2024-06-30', tipo: 'ATIVO', createdAt: '2024-01-01T00:00:00.000Z',
    };
    const etapaCorrente: StudentEnrollment = {
      id: 'e2', alunoId: 'a1', dataInicio: '2024-08-01', tipo: 'ATIVO', createdAt: '2024-08-01T00:00:00.000Z',
    };
    const registros: Registro[] = [
      { id: 'r1', alunoId: 'a1', slotId: 's1', data: '2024-03-15', horario: '07:00', status: 'presente' },
    ];

    const { onSave } = renderModal({ aluno, etapasAtivas: [etapaAntiga, etapaCorrente], registros });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir etapa' }));

    expect(screen.getByText(/não pode ser excluída/)).toBeTruthy();
    // O diálogo de confirmação de exclusão (caminho "seguro") não deve aparecer.
    expect(screen.queryByText(/exclusão é segura/)).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('reativação exige data de início antes de permitir prosseguir', () => {
    const aluno: Aluno = { id: 'a1', nome: 'Rodrigo', telefone: '', plano: 8, valorAula: 100, observacoes: '' };
    const etapaEncerrada: StudentEnrollment = {
      id: 'e1', alunoId: 'a1', dataInicio: '2024-01-01', dataFim: '2024-06-30', tipo: 'ATIVO', createdAt: '2024-01-01T00:00:00.000Z',
    };

    const { onSave } = renderModal({ aluno, etapasAtivas: [etapaEncerrada] });

    fireEvent.click(screen.getByRole('button', { name: 'Reativar aluno' }));

    // Tenta salvar sem informar a data de início da nova etapa.
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Informe a data de início da nova etapa.')).toBeTruthy();

    // Informa uma data válida (após o encerramento) e tenta salvar novamente.
    fireEvent.change(screen.getByLabelText('Data de início da nova etapa'), { target: { value: '2024-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

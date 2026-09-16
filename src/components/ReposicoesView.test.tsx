// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import ReposicoesView from './ReposicoesView';
import type { AppData, Aluno, Registro } from '../types';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function makeData(overrides?: Partial<AppData>): AppData {
  return {
    alunos: [],
    slots: [],
    schedules: [],
    registros: [],
    config: { notificationTime: '21:00', nomeProfissional: '', registroProfissional: 'Personal Trainer' },
    pagamentos: [],
    feriasProfessor: [],
    matriculas: [],
    ausenciasProfessor: [],
    ...overrides,
  };
}

function makeAluno(overrides?: Partial<Aluno>): Aluno {
  return { id: 'a1', nome: 'Rodrigo', telefone: '', plano: 8, valorAula: 100, observacoes: '', ...overrides };
}

/** Reposição pendente padrão: aula original 01/09, movida para 20/09. */
function makeReposicao(overrides?: Partial<Registro>): Registro {
  return {
    id: 'r1',
    alunoId: 'a1',
    slotId: 's1',
    data: '2026-09-01',
    horario: '07:00',
    status: 'reposicao',
    reposicaoData: '2026-09-20',
    reposicaoHorario: '08:00',
    ...overrides,
  };
}

describe('ReposicoesView — filtros e navegação de mês', () => {
  it('cada filtro mostra somente as reposições do status correspondente', () => {
    const data = makeData({
      alunos: [
        makeAluno({ id: 'a1', nome: 'Rodrigo' }),
        makeAluno({ id: 'a2', nome: 'Adriana' }),
        makeAluno({ id: 'a3', nome: 'Fernanda' }),
        makeAluno({ id: 'a4', nome: 'Cris' }),
      ],
      registros: [
        makeReposicao({ id: 'r1', alunoId: 'a1', reposicaoData: '2026-09-10', reposicaoHorario: '08:00', status: 'reposicao' }),
        makeReposicao({ id: 'r2', alunoId: 'a2', reposicaoData: '2026-09-12', reposicaoHorario: '09:00', status: 'presente', reposicaoStatus: 'concluida' }),
        makeReposicao({ id: 'r3', alunoId: 'a3', reposicaoData: '2026-09-14', reposicaoHorario: '10:00', status: 'falta', reposicaoStatus: 'nao_compareceu' }),
        makeReposicao({ id: 'r4', alunoId: 'a4', reposicaoData: '2026-09-16', reposicaoHorario: '11:00', status: 'reposicao', reposicaoStatus: 'cancelada' }),
      ],
    });
    render(<ReposicoesView data={data} onUpdateRegistro={vi.fn()} />);

    // "Todas" (padrão): os 4 aparecem.
    expect(screen.getByText('Rodrigo')).toBeTruthy();
    expect(screen.getByText('Adriana')).toBeTruthy();
    expect(screen.getByText('Fernanda')).toBeTruthy();
    expect(screen.getByText('Cris')).toBeTruthy();
    expect(screen.getByText('4 reposições')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pendentes' }));
    expect(screen.getByText('Rodrigo')).toBeTruthy();
    expect(screen.queryByText('Adriana')).toBeNull();
    expect(screen.queryByText('Fernanda')).toBeNull();
    expect(screen.queryByText('Cris')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Concluídas' }));
    expect(screen.getByText('Adriana')).toBeTruthy();
    expect(screen.queryByText('Rodrigo')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Não Compareceu' }));
    expect(screen.getByText('Fernanda')).toBeTruthy();
    expect(screen.queryByText('Adriana')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Canceladas' }));
    expect(screen.getByText('Cris')).toBeTruthy();
    expect(screen.queryByText('Fernanda')).toBeNull();
  });

  it('reposição fora do mês corrente fica oculta até navegar para o mês dela', () => {
    const data = makeData({
      alunos: [makeAluno()],
      registros: [makeReposicao({ reposicaoData: '2026-10-05', reposicaoHorario: '08:00' })],
    });
    render(<ReposicoesView data={data} onUpdateRegistro={vi.fn()} />);

    expect(screen.getByText('Setembro de 2026')).toBeTruthy();
    expect(screen.queryByText('Rodrigo')).toBeNull();
    expect(screen.getByText('Nenhuma reposição registrada')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Próximo mês'));

    expect(screen.getByText('Outubro de 2026')).toBeTruthy();
    expect(screen.getByText('Rodrigo')).toBeTruthy();
  });
});

describe('ReposicoesView — transições de status', () => {
  it('"Concluída" registra presença na data da reposição', () => {
    const onUpdateRegistro = vi.fn();
    const data = makeData({ alunos: [makeAluno()], registros: [makeReposicao()] });
    render(<ReposicoesView data={data} onUpdateRegistro={onUpdateRegistro} />);

    fireEvent.click(screen.getByRole('button', { name: 'Concluída' }));

    expect(onUpdateRegistro).toHaveBeenCalledWith(
      'a1', 's1', '2026-09-01', '07:00', 'presente',
      { data: '2026-09-20', horario: '08:00', reposicaoStatus: 'concluida' },
    );
  });

  it('"Não Compareceu" pede observação e registra falta com reposicaoStatus "nao_compareceu"', () => {
    const onUpdateRegistro = vi.fn();
    const data = makeData({ alunos: [makeAluno()], registros: [makeReposicao()] });
    render(<ReposicoesView data={data} onUpdateRegistro={onUpdateRegistro} />);

    // "Não Compareceu" é ao mesmo tempo o nome do filtro e do botão de ação;
    // com um único card pendente na tela, o botão de ação é o segundo elemento
    // com esse nome acessível (o filtro é renderizado antes na árvore).
    const buttons = screen.getAllByRole('button', { name: 'Não Compareceu' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);

    expect(screen.getByText('Marcar falta')).toBeTruthy();
    expect(onUpdateRegistro).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Confirmar falta'));

    expect(onUpdateRegistro).toHaveBeenCalledWith(
      'a1', 's1', '2026-09-01', '07:00', 'falta',
      { data: '2026-09-20', horario: '08:00', reposicaoStatus: 'nao_compareceu' },
      '',
    );
  });

  it('"Cancelar" marca a reposição como cancelada', () => {
    const onUpdateRegistro = vi.fn();
    const data = makeData({ alunos: [makeAluno()], registros: [makeReposicao()] });
    render(<ReposicoesView data={data} onUpdateRegistro={onUpdateRegistro} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onUpdateRegistro).toHaveBeenCalledWith(
      'a1', 's1', '2026-09-01', '07:00', 'reposicao',
      { data: '2026-09-20', horario: '08:00', reposicaoStatus: 'cancelada' },
    );
  });
});

describe('ReposicoesView — "Reagendar" (validações do ReposicaoModal)', () => {
  it('bloqueia o reagendamento para uma data anterior à adesão do aluno', () => {
    const data = makeData({
      alunos: [makeAluno({ dataAdesao: '2026-09-25' })],
      registros: [makeReposicao()], // reposicaoData 2026-09-20, antes da adesão
    });
    render(<ReposicoesView data={data} onUpdateRegistro={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reagendar' }));

    expect(screen.getByText('Reagendar aula')).toBeTruthy();
    expect(
      screen.getByText('Não é possível agendar uma movimentação antes da data de adesão do aluno.'),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('avisa sobre férias do professor e só libera "Confirmar" após "Confirmar Exceção"', () => {
    const onUpdateRegistro = vi.fn();
    const data = makeData({
      alunos: [makeAluno()],
      registros: [makeReposicao()],
      feriasProfessor: [{ id: 'f1', dataInicio: '2026-09-18', dataFim: '2026-09-22', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    render(<ReposicoesView data={data} onUpdateRegistro={onUpdateRegistro} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reagendar' }));

    expect(screen.getByText('A data selecionada está dentro do período de férias do professor.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Exceção' }));
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onUpdateRegistro).toHaveBeenCalledWith(
      'a1', 's1', '2026-09-01', '07:00', 'reposicao',
      { data: '2026-09-20', horario: '08:00', excecao: ['ferias_professor'], reposicaoStatus: 'pendente' },
    );
  });

  it('impede reagendar para a mesma data/horário da aula original', () => {
    const data = makeData({ alunos: [makeAluno()], registros: [makeReposicao()] });
    render(<ReposicoesView data={data} onUpdateRegistro={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reagendar' }));
    fireEvent.change(screen.getByLabelText('Nova data'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Novo horário'), { target: { value: '07:00' } });

    expect(screen.getByText('A nova data/horário precisa ser diferente da aula original.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

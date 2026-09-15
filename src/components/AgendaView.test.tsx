// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import AgendaView from './AgendaView';
import { dowOf, todayISO } from '../lib/date';
import type { AppData } from '../types';

afterEach(cleanup);

/** Dados mínimos: 1 aluno com aula hoje, sem registro (pendente). */
function makeData(overrides?: Partial<AppData>): AppData {
  const today = todayISO();
  const dow = dowOf(today);
  return {
    alunos: [{ id: 'a1', nome: 'Rodrigo', telefone: '', plano: 8, valorAula: 100, observacoes: '' }],
    slots: [{ id: 's1', horario: '07:00' }],
    schedules: [{ id: 'sch1', alunoId: 'a1', slotId: 's1', dias: [dow] }],
    registros: [],
    config: { notificationTime: '21:00', nomeProfissional: '', registroProfissional: 'Personal Trainer' },
    pagamentos: [],
    feriasProfessor: [],
    matriculas: [],
    ausenciasProfessor: [],
    ...overrides,
  };
}

describe('AgendaView — comportamento observável do usuário', () => {
  it('renderiza o card da aula pendente com nome, horário e os três botões de ação', () => {
    render(<AgendaView data={makeData()} onUpdateRegistro={vi.fn()} />);

    expect(screen.getByText('Rodrigo')).toBeTruthy();
    expect(screen.getByText('07:00')).toBeTruthy();
    expect(screen.getByLabelText('Presença confirmada')).toBeTruthy();
    expect(screen.getByLabelText('Agendar reposição')).toBeTruthy();
    expect(screen.getByLabelText('Marcar falta')).toBeTruthy();
  });

  it('usuário consegue marcar presença: clicar em "Presente" confirma a aula', () => {
    const onUpdateRegistro = vi.fn();
    render(<AgendaView data={makeData()} onUpdateRegistro={onUpdateRegistro} />);

    fireEvent.click(screen.getByLabelText('Presença confirmada'));

    expect(onUpdateRegistro).toHaveBeenCalledWith('a1', 's1', todayISO(), '07:00', 'presente');
  });

  it('clicar em "Presente" quando já está presente desfaz a marcação (volta a pendente)', () => {
    const today = todayISO();
    const onUpdateRegistro = vi.fn();
    const data = makeData({
      registros: [
        { id: 'r1', alunoId: 'a1', slotId: 's1', data: today, horario: '07:00', status: 'presente' },
      ],
    });
    render(<AgendaView data={data} onUpdateRegistro={onUpdateRegistro} />);

    fireEvent.click(screen.getByLabelText('Presença confirmada'));

    expect(onUpdateRegistro).toHaveBeenCalledWith('a1', 's1', today, '07:00', 'pendente');
  });

  it('clicar em "Falta" abre a pergunta Avisada/Não avisada sem registrar nada ainda', () => {
    const onUpdateRegistro = vi.fn();
    render(<AgendaView data={makeData()} onUpdateRegistro={onUpdateRegistro} />);

    fireEvent.click(screen.getByLabelText('Marcar falta'));

    expect(screen.getByText('Como foi a falta?')).toBeTruthy();
    expect(onUpdateRegistro).not.toHaveBeenCalled();
  });

  it('falta avisada: abre observação opcional e, ao confirmar, registra falta com faltaTipo "avisada"', () => {
    const today = todayISO();
    const onUpdateRegistro = vi.fn();
    render(<AgendaView data={makeData()} onUpdateRegistro={onUpdateRegistro} />);

    fireEvent.click(screen.getByLabelText('Marcar falta'));
    fireEvent.click(screen.getByText('Avisada'));

    // Fluxo normal de falta pede observação opcional antes de confirmar.
    expect(screen.getByText('Confirmar falta')).toBeTruthy();
    fireEvent.click(screen.getByText('Confirmar falta'));

    expect(onUpdateRegistro).toHaveBeenCalledWith(
      'a1', 's1', today, '07:00', 'falta', undefined, '', 'avisada',
    );
  });

  it('falta não avisada: registra direto como presente (cobrada) com faltaTipo "nao_avisada", sem pedir observação', () => {
    const today = todayISO();
    const onUpdateRegistro = vi.fn();
    render(<AgendaView data={makeData()} onUpdateRegistro={onUpdateRegistro} />);

    fireEvent.click(screen.getByLabelText('Marcar falta'));
    fireEvent.click(screen.getByText('Não avisada'));

    expect(onUpdateRegistro).toHaveBeenCalledWith(
      'a1', 's1', today, '07:00', 'presente', undefined, undefined, 'nao_avisada',
    );
    // Não deve pedir observação neste caminho.
    expect(screen.queryByText('Confirmar falta')).toBeNull();
  });

  it('clicar em "Reposição" abre o modal de mover aula para outra data/horário', () => {
    const onUpdateRegistro = vi.fn();
    render(<AgendaView data={makeData()} onUpdateRegistro={onUpdateRegistro} />);

    fireEvent.click(screen.getByLabelText('Agendar reposição'));

    expect(screen.getByText('Mover aula')).toBeTruthy();
    expect(onUpdateRegistro).not.toHaveBeenCalled();
  });
});

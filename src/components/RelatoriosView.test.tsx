// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import RelatoriosView from './RelatoriosView';
import type { AppData, Aluno, Registro } from '../types';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
  window.print = vi.fn();
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

function makeRegistro(overrides?: Partial<Registro>): Registro {
  return {
    id: 'r1',
    alunoId: 'a1',
    slotId: 's1',
    data: '2026-09-10',
    horario: '07:00',
    status: 'presente',
    ...overrides,
  };
}

/** Retorna a seção visível na tela (print:hidden), excluindo o layout de impressão. */
function getScreenSection(container: HTMLElement): HTMLElement {
  const printHidden = container.querySelector('.print\\:hidden');
  if (!printHidden) throw new Error('Seção print:hidden não encontrada');
  return printHidden as HTMLElement;
}

describe('RelatoriosView — totais do mês atual (overview)', () => {
  it('exibe faturamento, presenças, faltas e reposições do período', () => {
    const data = makeData({
      alunos: [
        makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 }),
        makeAluno({ id: 'a2', nome: 'Ana', plano: 4, valorAula: 150 }),
      ],
      registros: [
        makeRegistro({ id: 'r1', alunoId: 'a1', data: '2026-09-02', status: 'presente' }),
        makeRegistro({ id: 'r2', alunoId: 'a1', data: '2026-09-04', status: 'presente' }),
        makeRegistro({ id: 'r3', alunoId: 'a1', data: '2026-09-06', status: 'falta' }),
        makeRegistro({ id: 'r4', alunoId: 'a2', data: '2026-09-03', status: 'presente' }),
      ],
    });

    const { container } = render(<RelatoriosView data={data} />);
    const tela = getScreenSection(container);

    // 3 presenças × valores mistos: Rodrigo 2×100=200, Ana 1×150=150 → R$ 350,00
    expect(within(tela).getByText(/R\$\s*350,00/)).toBeTruthy();

    // Cards de overview existem
    expect(within(tela).getByText('Presenças')).toBeTruthy();
    expect(within(tela).getByText('Faltas')).toBeTruthy();
    expect(within(tela).getByText('Reposições')).toBeTruthy();
  });
});

describe('RelatoriosView — navegação de período (mês anterior)', () => {
  it('ao navegar para o mês anterior, exibe dados estritamente daquele intervalo', () => {
    const data = makeData({
      alunos: [makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 })],
      registros: [
        makeRegistro({ id: 'r1', alunoId: 'a1', data: '2026-09-10', status: 'presente' }),
        makeRegistro({ id: 'r2', alunoId: 'a1', data: '2026-08-15', status: 'presente' }),
        makeRegistro({ id: 'r3', alunoId: 'a1', data: '2026-08-20', status: 'presente' }),
      ],
    });

    const { container } = render(<RelatoriosView data={data} />);

    // Setembro: 1 presença → R$ 100,00
    const tela = getScreenSection(container);
    expect(within(tela).getAllByText(/R\$\s*100,00/).length).toBeGreaterThanOrEqual(1);

    // Navega para Agosto
    fireEvent.click(screen.getByText('Anterior'));

    // Agosto: 2 presenças → R$ 200,00
    const telaAtualizada = getScreenSection(container);
    expect(within(telaAtualizada).getAllByText(/R\$\s*200,00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Agosto de 2026/i)).toBeTruthy();
  });
});

describe('RelatoriosView — detalhamento por aluno', () => {
  it('card do aluno exibe nome, quantidade de aulas e subtotal calculado', () => {
    const data = makeData({
      alunos: [makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 150 })],
      registros: [
        makeRegistro({ id: 'r1', alunoId: 'a1', data: '2026-09-02', status: 'presente' }),
        makeRegistro({ id: 'r2', alunoId: 'a1', data: '2026-09-04', status: 'presente' }),
        makeRegistro({ id: 'r3', alunoId: 'a1', data: '2026-09-06', status: 'presente' }),
      ],
    });

    const { container } = render(<RelatoriosView data={data} />);
    const tela = getScreenSection(container);

    // Nome do aluno aparece no card
    expect(within(tela).getByText('Rodrigo')).toBeTruthy();
    // 3 presenças × R$ 150 = R$ 450,00
    expect(within(tela).getAllByText(/R\$\s*450,00/).length).toBeGreaterThanOrEqual(1);
    // "3 / 8 aulas (38%)"
    expect(within(tela).getByText(/3\s*\/\s*8 aulas/)).toBeTruthy();
  });
});

describe('RelatoriosView — filtro de alunos', () => {
  it('selecionar aluno filtra a visão para exibir apenas seus dados', () => {
    const data = makeData({
      alunos: [
        makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 }),
        makeAluno({ id: 'a2', nome: 'Ana', plano: 4, valorAula: 200 }),
      ],
      registros: [
        makeRegistro({ id: 'r1', alunoId: 'a1', data: '2026-09-02', status: 'presente' }),
        makeRegistro({ id: 'r2', alunoId: 'a2', data: '2026-09-03', status: 'presente' }),
      ],
    });

    render(<RelatoriosView data={data} />);

    expect(screen.getByText(/Nenhum aluno selecionado/)).toBeTruthy();

    // Filtra por Ana — chips de filtro
    const filterChips = screen.getAllByRole('button', { name: 'Ana' });
    fireEvent.click(filterChips[0]);

    expect(screen.getByText(/1 aluno selecionado/)).toBeTruthy();
  });
});

describe('RelatoriosView — diferenciação de faltas', () => {
  it('falta do professor não gera cobrança (faturamento = 0)', () => {
    const data = makeData({
      alunos: [makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 })],
      registros: [
        makeRegistro({ id: 'r1', alunoId: 'a1', data: '2026-09-02', status: 'falta', faltaProfessor: true }),
      ],
    });

    const { container } = render(<RelatoriosView data={data} />);
    const tela = getScreenSection(container);

    // Faturamento deve ser R$ 0,00
    expect(within(tela).getAllByText(/R\$\s*0,00/).length).toBeGreaterThanOrEqual(1);
  });

  it('falta não avisada é contabilizada como presença/cobrança no faturamento', () => {
    const data = makeData({
      alunos: [makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 })],
      registros: [
        makeRegistro({
          id: 'r1',
          alunoId: 'a1',
          data: '2026-09-02',
          status: 'presente',
          faltaTipo: 'nao_avisada',
        }),
      ],
    });

    const { container } = render(<RelatoriosView data={data} />);
    const tela = getScreenSection(container);

    // Fatura R$ 100,00 (presença cobrada)
    expect(within(tela).getAllByText(/R\$\s*100,00/).length).toBeGreaterThanOrEqual(1);
    // Indicação de falta(s) não avisada(s)
    expect(within(tela).getAllByText(/não avisada/).length).toBeGreaterThanOrEqual(1);
  });
});

describe('RelatoriosView — extrato itemizado (seleção individual)', () => {
  it('ao selecionar um aluno, exibe o histórico inline de aulas do período', () => {
    const data = makeData({
      alunos: [makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 })],
      registros: [
        makeRegistro({ id: 'r1', alunoId: 'a1', data: '2026-09-02', horario: '07:00', status: 'presente' }),
        makeRegistro({ id: 'r2', alunoId: 'a1', data: '2026-09-04', horario: '07:00', status: 'falta' }),
      ],
    });

    render(<RelatoriosView data={data} />);

    // Seleciona Rodrigo no filtro
    const filterChips = screen.getAllByRole('button', { name: 'Rodrigo' });
    fireEvent.click(filterChips[0]);

    // Histórico inline mostra situações
    expect(screen.getAllByText('Presença').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Falta').length).toBeGreaterThanOrEqual(1);
  });
});

describe('RelatoriosView — ação de impressão', () => {
  it('clicar em "Gerar PDF" dispara window.print()', () => {
    const data = makeData({ alunos: [makeAluno()] });

    render(<RelatoriosView data={data} />);

    fireEvent.click(screen.getByRole('button', { name: /Gerar PDF/ }));

    expect(window.print).toHaveBeenCalledTimes(1);
  });
});

describe('RelatoriosView — comportamento defensivo (sem aulas)', () => {
  it('aluno sem registros no período é renderizado limpo sem NaN ou quebra', () => {
    const data = makeData({
      alunos: [makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 })],
      registros: [],
    });

    const { container } = render(<RelatoriosView data={data} />);
    const tela = getScreenSection(container);

    expect(within(tela).getAllByText('Rodrigo').length).toBeGreaterThanOrEqual(1);
    // Faturamento R$ 0,00
    expect(within(tela).getAllByText(/R\$\s*0,00/).length).toBeGreaterThanOrEqual(1);
    // Nenhum NaN no DOM
    const relatorio = container.querySelector('#relatorio-print')!;
    expect(relatorio.textContent).not.toContain('NaN');
    // "0 / 8 aulas"
    expect(within(tela).getByText(/0\s*\/\s*8 aulas/)).toBeTruthy();
  });

  it('lista vazia de alunos renderiza sem erros', () => {
    const data = makeData({ alunos: [], registros: [] });

    const { container } = render(<RelatoriosView data={data} />);

    expect(container.querySelector('#relatorio-print')).toBeTruthy();
    expect(screen.getByText('Relatório')).toBeTruthy();
    // Faturamento R$ 0,00 aparece em pelo menos um lugar
    expect(screen.getAllByText(/R\$\s*0,00/).length).toBeGreaterThanOrEqual(1);
  });
});

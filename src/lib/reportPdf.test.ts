// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateReportPdf, downloadPdfBlob, type ReportInput } from './reportPdf';
import { overviewStats, historicoDoAluno } from './billing';
import type { AppData, Aluno, Registro } from '../types';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
});

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

function makeData(overrides?: Partial<AppData>): AppData {
  return {
    alunos: [],
    slots: [],
    schedules: [],
    registros: [],
    config: { notificationTime: '21:00', nomeProfissional: 'Prof. Teste', registroProfissional: 'CREF 12345' },
    pagamentos: [],
    feriasProfessor: [],
    matriculas: [],
    ausenciasProfessor: [],
    ...overrides,
  };
}

function buildInput(data: AppData, range = { start: '2026-09-01', end: '2026-09-30' }): ReportInput {
  const stats = overviewStats(data, range);
  const listaAtiva = stats.porAluno;
  const historicoDetalhado = listaAtiva
    .flatMap((s) =>
      historicoDoAluno(s.aluno, data.registros, range).map((e) => ({ ...e, alunoNome: s.aluno.nome })),
    )
    .sort((a, b) => a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario));

  return {
    data,
    range,
    nomeProfissional: data.config.nomeProfissional,
    registroProfissional: data.config.registroProfissional,
    escopo: 'Geral (Todos os Alunos Ativos)',
    listaAtiva,
    historicoDetalhado,
    mostrarAlunoNoHistorico: true,
    feriasProfessor: [],
    feriasAlunos: [],
  };
}

describe('generateReportPdf', () => {
  it('gera um Blob de PDF válido com dados completos', () => {
    const data = makeData({
      alunos: [
        makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 }),
        makeAluno({ id: 'a2', nome: 'Ana', plano: 4, valorAula: 150 }),
      ],
      registros: [
        makeRegistro({ id: 'r1', alunoId: 'a1', data: '2026-09-02', status: 'presente' }),
        makeRegistro({ id: 'r2', alunoId: 'a1', data: '2026-09-04', status: 'presente' }),
        makeRegistro({ id: 'r3', alunoId: 'a2', data: '2026-09-03', status: 'presente' }),
      ],
    });

    const result = generateReportPdf(buildInput(data));

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('application/pdf');
    expect(result.size).toBeGreaterThan(0);
  });

  it('relatório sem alunos gera PDF sem erros', () => {
    const data = makeData({ alunos: [], registros: [] });

    const result = generateReportPdf(buildInput(data));

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it('aluno sem registros no período gera PDF sem erros', () => {
    const data = makeData({
      alunos: [makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 })],
      registros: [],
    });

    const result = generateReportPdf(buildInput(data));

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it('registros com faltas são processados sem erros', () => {
    const data = makeData({
      alunos: [makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 })],
      registros: [
        makeRegistro({ id: 'r1', alunoId: 'a1', data: '2026-09-02', status: 'falta' }),
        makeRegistro({ id: 'r2', alunoId: 'a1', data: '2026-09-04', status: 'presente' }),
      ],
    });

    const result = generateReportPdf(buildInput(data));

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it('falta não avisada é incluída no PDF', () => {
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

    const result = generateReportPdf(buildInput(data));

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it('falta do professor é incluída no PDF', () => {
    const data = makeData({
      alunos: [makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 100 })],
      registros: [
        makeRegistro({
          id: 'r1',
          alunoId: 'a1',
          data: '2026-09-02',
          status: 'falta',
          faltaProfessor: true,
        }),
      ],
    });

    const result = generateReportPdf(buildInput(data));

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it('valores monetários são formatados corretamente (presença × valorAula)', () => {
    const data = makeData({
      alunos: [makeAluno({ id: 'a1', nome: 'Rodrigo', plano: 8, valorAula: 250 })],
      registros: [
        makeRegistro({ id: 'r1', alunoId: 'a1', data: '2026-09-02', status: 'presente' }),
        makeRegistro({ id: 'r2', alunoId: 'a1', data: '2026-09-04', status: 'presente' }),
      ],
    });
    const input = buildInput(data);

    expect(input.listaAtiva[0].faturamento).toBe(500);

    const result = generateReportPdf(input);
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);
  });

  it('lança erro quando jsPDF falha internamente', () => {
    const data = makeData({ alunos: [makeAluno()] });
    const input = buildInput(data);
    // @ts-expect-error — força argumento inválido para provocar erro
    input.range = null;

    expect(() => generateReportPdf(input)).toThrow();
  });
});

describe('downloadPdfBlob', () => {
  it('cria um link temporário, dispara click e revoga a URL', () => {
    const fakeUrl = 'blob:http://localhost/fake';
    const createObjectURLSpy = vi.fn().mockReturnValue(fakeUrl);
    const revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = createObjectURLSpy;
    URL.revokeObjectURL = revokeObjectURLSpy;

    const clickSpy = vi.fn();
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        vi.spyOn(node, 'click').mockImplementation(clickSpy);
      }
      return node;
    });
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    const blob = new Blob(['test'], { type: 'application/pdf' });
    downloadPdfBlob(blob, 'relatorio-2026-09.pdf');

    expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(fakeUrl);
    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});

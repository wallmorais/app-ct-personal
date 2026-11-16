import { describe, expect, it } from 'vitest';
import { fetchAllPages, isRemoteEmpty, type PageResult, type RemoteCollectionCounts } from './supabaseRepo';

function emptyCounts(): RemoteCollectionCounts {
  return {
    alunos: 0,
    slots: 0,
    schedules: 0,
    registros: 0,
    pagamentos: 0,
    ferias: 0,
    matriculas: 0,
    ausencias: 0,
    hasConfig: false,
  };
}

describe('isRemoteEmpty', () => {
  it('todas as coleções vazias + sem config → true', () => {
    expect(isRemoteEmpty(emptyCounts())).toBe(true);
  });

  it('somente alunos → false', () => {
    expect(isRemoteEmpty({ ...emptyCounts(), alunos: 1 })).toBe(false);
  });

  it('somente slots → false', () => {
    expect(isRemoteEmpty({ ...emptyCounts(), slots: 1 })).toBe(false);
  });

  it('somente schedules → false', () => {
    expect(isRemoteEmpty({ ...emptyCounts(), schedules: 2 })).toBe(false);
  });

  it('somente registros → false', () => {
    expect(isRemoteEmpty({ ...emptyCounts(), registros: 1 })).toBe(false);
  });

  it('somente pagamentos → false', () => {
    expect(isRemoteEmpty({ ...emptyCounts(), pagamentos: 3 })).toBe(false);
  });

  it('somente férias do professor → false', () => {
    expect(isRemoteEmpty({ ...emptyCounts(), ferias: 1 })).toBe(false);
  });

  it('somente matrículas → false', () => {
    expect(isRemoteEmpty({ ...emptyCounts(), matriculas: 1 })).toBe(false);
  });

  it('somente ausências do professor → false', () => {
    expect(isRemoteEmpty({ ...emptyCounts(), ausencias: 1 })).toBe(false);
  });

  it('somente config → false', () => {
    expect(isRemoteEmpty({ ...emptyCounts(), hasConfig: true })).toBe(false);
  });

  it('combinação de coleções → false', () => {
    expect(isRemoteEmpty({ ...emptyCounts(), alunos: 2, registros: 5, ferias: 1 })).toBe(false);
  });
});

/**
 * Simula o PostgREST: devolve a fatia pedida de `total` linhas, respeitando um
 * teto de linhas por requisição (`serverCap`), e sempre informa o total exato.
 */
function fakeServer(total: number, serverCap: number) {
  const all = Array.from({ length: total }, (_, i) => i);
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number): Promise<PageResult<number>> => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + serverCap);
    return { data: all.slice(from, end), error: null, count: total };
  };
  return { all, calls, fetchPage };
}

describe('fetchAllPages', () => {
  it('tabela vazia → lista vazia em uma requisição', async () => {
    const { calls, fetchPage } = fakeServer(0, 1000);
    expect(await fetchAllPages(fetchPage)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('menos de uma página → uma requisição só', async () => {
    const { all, calls, fetchPage } = fakeServer(777, 1000);
    expect(await fetchAllPages(fetchPage)).toEqual(all);
    expect(calls).toEqual([[0, 999]]);
  });

  it('exatamente 1000 linhas → não perde nem duplica', async () => {
    const { all, calls, fetchPage } = fakeServer(1000, 1000);
    expect(await fetchAllPages(fetchPage)).toEqual(all);
    expect(calls).toHaveLength(1);
  });

  it('mais de 1000 linhas → busca todas as páginas (regressão do truncamento)', async () => {
    const { all, calls, fetchPage } = fakeServer(2500, 1000);
    const rows = await fetchAllPages(fetchPage);
    expect(rows).toHaveLength(2500);
    expect(rows).toEqual(all);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('teto do servidor menor que a página → ainda assim lê tudo', async () => {
    const { all, fetchPage } = fakeServer(1200, 500);
    expect(await fetchAllPages(fetchPage)).toEqual(all);
  });

  it('erro em qualquer página → propaga, sem devolver dados parciais', async () => {
    const { fetchPage } = fakeServer(2500, 1000);
    const erro = new Error('timeout');
    const comFalha = async (from: number, to: number) =>
      from >= 1000 ? { data: null, error: erro, count: null } : fetchPage(from, to);
    await expect(fetchAllPages(comFalha)).rejects.toBe(erro);
  });

  it('servidor devolve menos linhas que o total informado → lança erro', async () => {
    const incompleto = async (from: number): Promise<PageResult<number>> => ({
      data: from === 0 ? [1, 2, 3] : [],
      error: null,
      count: 10,
    });
    await expect(fetchAllPages(incompleto)).rejects.toThrow('Leitura incompleta');
  });

  it('sem total informado → para na primeira página incompleta', async () => {
    const all = Array.from({ length: 5 }, (_, i) => i);
    const semCount = async (from: number, to: number): Promise<PageResult<number>> => ({
      data: all.slice(from, to + 1),
      error: null,
      count: null,
    });
    expect(await fetchAllPages(semCount, 2)).toEqual(all);
  });
});

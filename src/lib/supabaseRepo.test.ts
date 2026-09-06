import { describe, expect, it } from 'vitest';
import { isRemoteEmpty, type RemoteCollectionCounts } from './supabaseRepo';

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

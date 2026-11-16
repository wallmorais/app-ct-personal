// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { formatSyncLog, logSync, readSyncLog } from './syncLog';

beforeEach(() => localStorage.clear());

describe('syncLog', () => {
  it('vazio por padrão', () => {
    expect(readSyncLog()).toEqual([]);
    expect(formatSyncLog()).toBe('Registro de sincronização vazio.');
  });

  it('acrescenta eventos em ordem, com horário e detalhe opcional', () => {
    logSync('leitura_ok', 'alunos=3 registros=10', new Date('2026-11-16T10:00:00Z'));
    logSync('gravacao_ok', undefined, new Date('2026-11-16T10:01:00Z'));

    expect(readSyncLog()).toEqual([
      { at: '2026-11-16T10:00:00.000Z', event: 'leitura_ok', detail: 'alunos=3 registros=10' },
      { at: '2026-11-16T10:01:00.000Z', event: 'gravacao_ok' },
    ]);
    expect(formatSyncLog()).toBe(
      '2026-11-16T10:00:00.000Z  leitura_ok  alunos=3 registros=10\n2026-11-16T10:01:00.000Z  gravacao_ok',
    );
  });

  it('mantém só os 100 eventos mais recentes', () => {
    for (let i = 0; i < 130; i++) logSync('gravacao_ok', String(i));
    const log = readSyncLog();
    expect(log).toHaveLength(100);
    expect(log[0].detail).toBe('30');
    expect(log[99].detail).toBe('129');
  });

  it('conteúdo corrompido no armazenamento é tratado como vazio e não quebra a gravação', () => {
    localStorage.setItem('pt-control:sync-log', '{não é json');
    expect(readSyncLog()).toEqual([]);
    logSync('leitura_falhou', 'Failed to fetch');
    expect(readSyncLog()).toHaveLength(1);
  });
});

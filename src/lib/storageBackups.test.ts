// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createAutoBackup, listBackups, MAX_BACKUPS, runScheduledBackup } from './storage';
import { buildEmptyData } from './testFixtures';

const FOLDER_KEY = 'pt-control:app-backups';
const dia = (d: string) => new Date(`2026-${d}T12:00:00Z`);

function gravarBackups(datas: string[]) {
  const entries = datas.map((d) => ({
    name: `backup_data_2026-${d}.json`,
    createdAt: dia(d).toISOString(),
    data: buildEmptyData(),
  }));
  localStorage.setItem(FOLDER_KEY, JSON.stringify(entries));
}

const nomes = () => listBackups().map((b) => b.name);

beforeEach(() => localStorage.clear());

describe('backups automáticos — regra de retenção', () => {
  it('o limite é de 3 backups', () => {
    expect(MAX_BACKUPS).toBe(3);
  });

  it('ao criar o 4º backup, o mais antigo é descartado', () => {
    for (const d of ['07-06', '08-05', '08-26', '09-20']) createAutoBackup(buildEmptyData(), dia(d));

    expect(nomes()).toEqual([
      'backup_data_2026-09-20.json',
      'backup_data_2026-08-26.json',
      'backup_data_2026-08-05.json',
    ]);
  });

  it('aparelho que acumulou mais de 3 (regra antiga) é enxugado na leitura, mantendo os mais recentes', () => {
    gravarBackups(['11-16', '09-20', '08-26', '08-05', '07-06']);

    expect(nomes()).toEqual([
      'backup_data_2026-11-16.json',
      'backup_data_2026-09-20.json',
      'backup_data_2026-08-26.json',
    ]);
    // O descarte é gravado, não é só um filtro de exibição.
    expect(JSON.parse(localStorage.getItem(FOLDER_KEY)!)).toHaveLength(3);
  });

  it('mantém os mais recentes mesmo se estiverem fora de ordem no armazenamento', () => {
    gravarBackups(['07-06', '11-16', '08-05', '09-20']);

    expect(nomes()).toEqual([
      'backup_data_2026-11-16.json',
      'backup_data_2026-09-20.json',
      'backup_data_2026-08-05.json',
    ]);
  });

  it('com 3 ou menos, nada é descartado', () => {
    gravarBackups(['11-16', '09-20']);
    expect(nomes()).toHaveLength(2);
  });

  it('backup do mesmo dia substitui o anterior, sem ocupar outra vaga', () => {
    createAutoBackup(buildEmptyData(), dia('11-16'));
    createAutoBackup(buildEmptyData(), dia('11-16'));
    expect(nomes()).toEqual(['backup_data_2026-11-16.json']);
  });

  it('backup agendado respeita o intervalo de 15 dias', () => {
    expect(runScheduledBackup(buildEmptyData(), dia('11-01'))).not.toBeNull();
    expect(runScheduledBackup(buildEmptyData(), dia('11-10'))).toBeNull();
    expect(runScheduledBackup(buildEmptyData(), dia('11-16'))).not.toBeNull();
    expect(nomes()).toHaveLength(2);
  });
});

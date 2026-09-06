import { describe, expect, it } from 'vitest';
import { parseBackupPayload } from './storage';
import type { AppData } from '../types';

/** Backup completo, no formato da versão atual (todas as 9 chaves). */
function backupAtual(): Record<string, unknown> {
  return {
    alunos: [],
    slots: [],
    schedules: [],
    registros: [],
    pagamentos: [],
    feriasProfessor: [],
    matriculas: [],
    ausenciasProfessor: [],
    config: { notificationTime: '21:00', nomeProfissional: 'Wal', registroProfissional: 'Personal' },
  };
}

function parse(payload: unknown): AppData {
  return parseBackupPayload(JSON.stringify(payload));
}

/** As 9 coleções precisam existir como array após a normalização — é o que evita
 *  o crash em `for (const s of data.schedules)` (AgendaView/App). */
function esperaColecoesIntegras(data: AppData) {
  expect(Array.isArray(data.alunos)).toBe(true);
  expect(Array.isArray(data.slots)).toBe(true);
  expect(Array.isArray(data.schedules)).toBe(true);
  expect(Array.isArray(data.registros)).toBe(true);
  expect(Array.isArray(data.pagamentos)).toBe(true);
  expect(Array.isArray(data.feriasProfessor)).toBe(true);
  expect(Array.isArray(data.matriculas)).toBe(true);
  expect(Array.isArray(data.ausenciasProfessor)).toBe(true);
  expect(typeof data.config).toBe('object');
}

describe('parseBackupPayload — backups válidos', () => {
  it('backup da versão atual (9 chaves) é aceito sem alteração de conteúdo', () => {
    const data = parse(backupAtual());
    esperaColecoesIntegras(data);
    expect(data.config.nomeProfissional).toBe('Wal');
  });

  it('backup anterior a ausenciasProfessor (05/09/2026) é aceito e normalizado', () => {
    const antigo = backupAtual();
    delete antigo.ausenciasProfessor;
    const data = parse(antigo);
    esperaColecoesIntegras(data);
    expect(data.ausenciasProfessor).toEqual([]);
  });

  it('backup anterior a schedules (06/07/2026) é aceito e normalizado', () => {
    const antigo = backupAtual();
    delete antigo.schedules;
    delete antigo.ausenciasProfessor;
    const data = parse(antigo);
    esperaColecoesIntegras(data);
    expect(data.schedules).toEqual([]);
  });

  it('backup da primeira versão (só alunos/slots/registros/config) é aceito', () => {
    const data = parse({
      alunos: [],
      slots: [],
      registros: [],
      config: { notificationTime: '21:00' },
    });
    esperaColecoesIntegras(data);
    expect(data.config.registroProfissional).toBe('Personal Trainer');
  });

  it('backup com dados reais preserva o conteúdo das coleções', () => {
    const completo = backupAtual();
    completo.alunos = [
      { id: 'a1', nome: 'Rodrigo', telefone: '', plano: 12, valorAula: 100, observacoes: '' },
    ];
    completo.registros = [
      { id: 'r1', alunoId: 'a1', slotId: 's1', data: '2026-09-01', horario: '07:00', status: 'falta', faltaTipo: 'avisada' },
    ];
    const data = parse(completo);
    expect(data.alunos).toHaveLength(1);
    expect(data.registros[0].faltaTipo).toBe('avisada');
  });
});

describe('parseBackupPayload — migrações legadas aplicadas no import', () => {
  it('config.ferias (formato único) vira um período em feriasProfessor', () => {
    const antigo = backupAtual();
    delete antigo.feriasProfessor;
    antigo.config = { notificationTime: '21:00', ferias: { inicio: '2026-01-10', fim: '2026-01-20' } };
    const data = parse(antigo);
    expect(data.feriasProfessor).toHaveLength(1);
    expect(data.feriasProfessor[0].dataInicio).toBe('2026-01-10');
    expect(data.feriasProfessor[0].dataFim).toBe('2026-01-20');
  });

  it('slots com dias/alunoIds (legado) viram schedules individuais', () => {
    const antigo = backupAtual();
    delete antigo.schedules;
    antigo.slots = [{ id: 's1', horario: '07:00', dias: [1, 3], alunoIds: ['a1', 'a2'] }];
    const data = parse(antigo);
    expect(data.schedules).toHaveLength(2);
    expect(data.schedules.map((s) => s.alunoId).sort()).toEqual(['a1', 'a2']);
    expect(data.schedules[0].dias).toEqual([1, 3]);
  });

  it('aluno com dataAdesao ganha matrícula ATIVO quando matriculas está ausente', () => {
    const antigo = backupAtual();
    delete antigo.matriculas;
    antigo.alunos = [
      { id: 'a1', nome: 'Rodrigo', telefone: '', plano: 12, valorAula: 100, observacoes: '', dataAdesao: '2026-03-01' },
    ];
    const data = parse(antigo);
    expect(data.matriculas).toHaveLength(1);
    expect(data.matriculas[0]).toMatchObject({ alunoId: 'a1', dataInicio: '2026-03-01', tipo: 'ATIVO' });
  });
});

describe('parseBackupPayload — payloads inválidos são rejeitados', () => {
  it('rejeita JSON malformado', () => {
    expect(() => parseBackupPayload('{ isso não é json')).toThrow();
  });

  it('rejeita conteúdo que não é objeto', () => {
    expect(() => parseBackupPayload('[]')).toThrow(/não é um objeto/);
    expect(() => parseBackupPayload('"texto"')).toThrow(/não é um objeto/);
  });

  it.each(['alunos', 'slots', 'registros'])('rejeita backup sem a chave obrigatória "%s"', (chave) => {
    const invalido = backupAtual();
    delete invalido[chave];
    expect(() => parse(invalido)).toThrow(new RegExp(`"${chave}" ausente`));
  });

  it.each(['alunos', 'slots', 'registros'])('rejeita "%s" presente com tipo inválido', (chave) => {
    const invalido = backupAtual();
    invalido[chave] = 'não é uma lista';
    expect(() => parse(invalido)).toThrow(new RegExp(`"${chave}" ausente ou não é uma lista`));
  });

  it('rejeita backup sem config', () => {
    const invalido = backupAtual();
    delete invalido.config;
    expect(() => parse(invalido)).toThrow(/"config" ausente/);
  });

  it('rejeita config com tipo inválido', () => {
    const invalido = backupAtual();
    invalido.config = [];
    expect(() => parse(invalido)).toThrow(/"config" ausente ou não é um objeto/);
  });

  it.each(['schedules', 'pagamentos', 'feriasProfessor', 'matriculas', 'ausenciasProfessor'])(
    'rejeita a coleção opcional "%s" quando presente com tipo inválido',
    (chave) => {
      const invalido = backupAtual();
      invalido[chave] = { nao: 'é lista' };
      expect(() => parse(invalido)).toThrow(new RegExp(`"${chave}" não é uma lista`));
    },
  );
});

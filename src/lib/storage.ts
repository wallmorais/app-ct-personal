import type { AppData } from '../types';
import { buildSeedData } from './seed';
import { isSupabaseConfigured } from './supabase';

const STORAGE_KEY = 'pt-control:data';

export function emptyAppData(): AppData {
  return {
    alunos: [],
    slots: [],
    schedules: [],
    registros: [],
    pagamentos: [],
    feriasProfessor: [],
    matriculas: [],
    ausenciasProfessor: [],
    config: {
      notificationTime: '21:00',
      nomeProfissional: '',
      registroProfissional: 'Personal Trainer',
    },
  };
}

/**
 * Estado inicial quando não há nada no localStorage.
 * - Com Supabase configurado (produção): base VAZIA. Os dados reais vêm do
 *   Supabase por usuário; jamais usamos dados de demonstração aqui, senão eles
 *   contaminariam a conta de cada professor.
 * - Sem Supabase (offline/dev): usa o seed apenas para demonstração local.
 */
function initialData(): AppData {
  return isSupabaseConfigured ? emptyAppData() : buildSeedData();
}

export function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = initialData();
    saveData(initial);
    return initial;
  }
  try {
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed.alunos || !parsed.slots || !parsed.registros || !parsed.config) {
      throw new Error('formato inválido');
    }
    return normalizeAppData(parsed);
  } catch {
    const initial = initialData();
    saveData(initial);
    return initial;
  }
}

/**
 * Preenche as coleções introduzidas em versões posteriores e aplica as migrações
 * de formatos legados. Compartilhada por `loadData` (cache local) e por
 * `parseBackupPayload` (arquivo de backup), para que um backup antigo — exportado
 * antes de `schedules`/`pagamentos`/`matriculas`/`feriasProfessor`/`ausenciasProfessor`
 * existirem — seja lido exatamente como um localStorage da mesma época.
 *
 * Muta e devolve o próprio objeto recebido.
 */
export function normalizeAppData(parsed: AppData): AppData {
  parsed.config.nomeProfissional ??= '';
  parsed.config.registroProfissional ??= 'Personal Trainer';
  parsed.pagamentos ??= [];
  parsed.feriasProfessor ??= [];
  parsed.matriculas ??= [];
  parsed.schedules ??= [];
  parsed.ausenciasProfessor ??= [];

  // Migração: ferias única → array de períodos
  if (parsed.config.ferias && parsed.feriasProfessor.length === 0) {
    parsed.feriasProfessor.push({
      id: crypto.randomUUID(),
      dataInicio: parsed.config.ferias.inicio,
      dataFim: parsed.config.ferias.fim,
      createdAt: new Date().toISOString(),
    });
    parsed.config.ferias = undefined;
  }

  // Migração: slots com dias/alunoIds → schedules individuais
  if (parsed.schedules.length === 0 && parsed.slots.some((s: any) => s.alunoIds?.length)) {
    for (const slot of parsed.slots) {
      const oldDias = (slot as any).dias as number[] | undefined;
      const oldAlunoIds = (slot as any).alunoIds as string[] | undefined;
      if (!oldDias?.length || !oldAlunoIds?.length) continue;
      for (const alunoId of oldAlunoIds) {
        parsed.schedules.push({
          id: crypto.randomUUID(),
          alunoId,
          slotId: slot.id,
          dias: [...oldDias] as import('../types').DiaSemana[],
        });
      }
    }
    for (const slot of parsed.slots) {
      delete (slot as any).dias;
      delete (slot as any).alunoIds;
    }
  }

  // Migração: registros com reposição sem reposicaoStatus
  for (const reg of parsed.registros) {
    if (reg.reposicaoData && !reg.reposicaoStatus) {
      if (reg.status === 'presente') reg.reposicaoStatus = 'concluida';
      else if (reg.status === 'falta' && reg.reposicaoData) reg.reposicaoStatus = 'nao_compareceu';
      else reg.reposicaoStatus = 'pendente';
    }
  }

  // Migração: dataAdesao → matrícula ATIVO
  for (const aluno of parsed.alunos) {
    if (aluno.dataAdesao && !parsed.matriculas.some((m) => m.alunoId === aluno.id)) {
      parsed.matriculas.push({
        id: crypto.randomUUID(),
        alunoId: aluno.id,
        dataInicio: aluno.dataAdesao,
        tipo: 'ATIVO',
        createdAt: new Date().toISOString(),
      });
    }
  }

  return parsed;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Chaves presentes desde a primeira versão — um backup sem elas não é recuperável. */
const CHAVES_OBRIGATORIAS = ['alunos', 'slots', 'registros'] as const;
/** Coleções introduzidas depois — podem faltar legitimamente em backups antigos. */
const COLECOES_OPCIONAIS = [
  'schedules',
  'pagamentos',
  'feriasProfessor',
  'matriculas',
  'ausenciasProfessor',
] as const;

/**
 * Valida e normaliza o conteúdo de um arquivo de backup.
 *
 * A validação é mais estrita que a de `loadData` porque o resultado vai direto
 * para o estado da aplicação: uma coleção ausente ou com tipo errado quebraria a
 * renderização (`for (const s of data.schedules)` em AgendaView/App, por exemplo)
 * antes mesmo de o guard da RPC `persist_app_data` ser acionado no sync.
 *
 * Coleções introduzidas em versões posteriores podem faltar — backups antigos são
 * legítimos e recebem o mesmo tratamento do localStorage da época (ver
 * `normalizeAppData`). Presentes com tipo inválido, porém, são rejeitadas.
 */
export function parseBackupPayload(raw: string): AppData {
  const parsed = JSON.parse(raw) as AppData;
  if (!isPlainObject(parsed)) {
    throw new Error('Arquivo de backup inválido: conteúdo não é um objeto');
  }
  const registro = parsed as unknown as Record<string, unknown>;

  for (const chave of CHAVES_OBRIGATORIAS) {
    if (!Array.isArray(registro[chave])) {
      throw new Error(`Arquivo de backup inválido: "${chave}" ausente ou não é uma lista`);
    }
  }
  if (!isPlainObject(registro.config)) {
    throw new Error('Arquivo de backup inválido: "config" ausente ou não é um objeto');
  }
  for (const chave of COLECOES_OPCIONAIS) {
    if (registro[chave] !== undefined && !Array.isArray(registro[chave])) {
      throw new Error(`Arquivo de backup inválido: "${chave}" não é uma lista`);
    }
  }

  return normalizeAppData(parsed);
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportData(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `pt-control-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
 * BACKUP AUTOMÁTICO A CADA 15 DIAS
 * ============================================================
 *
 * Em um back-end (Node), aqui você usaria `fs`:
 *   - garantir a pasta:  if (!fs.existsSync('/app-backups')) fs.mkdirSync(...)
 *   - salvar o arquivo:  fs.writeFileSync(`/app-backups/${nome}`, json)
 *   - agendar:           node-cron / setInterval no processo do servidor.
 *
 * No NAVEGADOR não há acesso ao disco, então a "pasta /app-backups" é
 * representada por um namespace dedicado no localStorage (BACKUP_FOLDER_KEY),
 * que é criado automaticamente se não existir. Cada backup vira uma entrada
 * com nome `backup_data_YYYY-MM-DD.json` e o conteúdo exato do JSON principal.
 */

const BACKUP_FOLDER_KEY = 'pt-control:app-backups'; // equivale à pasta /app-backups
const BACKUP_META_KEY = 'pt-control:backup-meta';
const BACKUP_INTERVAL_DAYS = 15;
const MAX_BACKUPS = 12; // mantém os 12 mais recentes (~6 meses)

export interface BackupEntry {
  name: string; // backup_data_YYYY-MM-DD.json
  createdAt: string; // ISO timestamp
  data: AppData;
}

interface BackupMeta {
  lastBackupAt: string | null; // ISO
}

/** Lê a "pasta" de backups, criando-a (vazia) automaticamente se não existir. */
export function listBackups(): BackupEntry[] {
  const raw = localStorage.getItem(BACKUP_FOLDER_KEY);
  if (raw === null) {
    localStorage.setItem(BACKUP_FOLDER_KEY, JSON.stringify([])); // cria a pasta
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as BackupEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readBackupMeta(): BackupMeta {
  try {
    const raw = localStorage.getItem(BACKUP_META_KEY);
    if (raw) return JSON.parse(raw) as BackupMeta;
  } catch {
    /* ignore */
  }
  return { lastBackupAt: null };
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

/** Cria uma cópia timestampada do JSON principal dentro da "pasta" de backups. */
export function createAutoBackup(data: AppData, now: Date = new Date()): BackupEntry {
  const stamp = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const entry: BackupEntry = {
    name: `backup_data_${stamp}.json`,
    createdAt: now.toISOString(),
    data,
  };

  const backups = listBackups().filter((b) => b.name !== entry.name); // sobrescreve o do mesmo dia
  const updated = [entry, ...backups].slice(0, MAX_BACKUPS);
  localStorage.setItem(BACKUP_FOLDER_KEY, JSON.stringify(updated));
  localStorage.setItem(BACKUP_META_KEY, JSON.stringify({ lastBackupAt: now.toISOString() }));

  return entry;
}

/**
 * Rotina executada na abertura do app: se passaram >= 15 dias desde o último
 * backup (ou nunca houve um), gera um novo automaticamente.
 * @returns o backup criado, ou null se ainda não era hora.
 */
export function runScheduledBackup(data: AppData, now: Date = new Date()): BackupEntry | null {
  const { lastBackupAt } = readBackupMeta();
  if (lastBackupAt) {
    const last = new Date(lastBackupAt);
    if (daysBetween(now, last) < BACKUP_INTERVAL_DAYS) return null;
  }
  return createAutoBackup(data, now);
}

/** Próxima data prevista de backup automático (para exibir na tela). */
export function nextBackupDate(now: Date = new Date()): Date {
  const { lastBackupAt } = readBackupMeta();
  const base = lastBackupAt ? new Date(lastBackupAt) : now;
  return new Date(base.getTime() + BACKUP_INTERVAL_DAYS * 86_400_000);
}

/** Baixa um backup específico como arquivo .json. */
export function downloadBackup(entry: BackupEntry): void {
  const blob = new Blob([JSON.stringify(entry.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = entry.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function deleteBackup(name: string): void {
  const updated = listBackups().filter((b) => b.name !== name);
  localStorage.setItem(BACKUP_FOLDER_KEY, JSON.stringify(updated));
}

export function importData(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseBackupPayload(reader.result as string);
        saveData(parsed);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

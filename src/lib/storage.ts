import type { AppData } from '../types';
import { buildSeedData } from './seed';

const STORAGE_KEY = 'pt-control:data';

export function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = buildSeedData();
    saveData(seeded);
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed.alunos || !parsed.slots || !parsed.registros || !parsed.config) {
      throw new Error('formato inválido');
    }
    return parsed;
  } catch {
    const seeded = buildSeedData();
    saveData(seeded);
    return seeded;
  }
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
        const parsed = JSON.parse(reader.result as string) as AppData;
        if (!parsed.alunos || !parsed.slots || !parsed.registros || !parsed.config) {
          throw new Error('Arquivo de backup inválido');
        }
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

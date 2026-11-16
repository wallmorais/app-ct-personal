/**
 * Registro de sincronização — histórico curto dos eventos de leitura/gravação no
 * Supabase, guardado no próprio aparelho.
 *
 * Existe para diagnóstico: como o app não mostra mais um aviso a cada
 * salvamento, este registro é o que permite reconstituir o que aconteceu quando
 * alguém relata um problema ("não salvou", "sumiu uma aula"). O usuário copia o
 * conteúdo pelo menu da conta e envia para o suporte.
 *
 * Guarda apenas eventos, horários, contagens e mensagens de erro — nunca nomes
 * de alunos ou qualquer dado cadastral.
 */

const STORAGE_KEY = 'pt-control:sync-log';
const MAX_ENTRIES = 100;

export type SyncLogEvent =
  | 'leitura_ok'
  | 'leitura_falhou'
  | 'gravacao_ok'
  | 'gravacao_falhou'
  | 'conflito_detectado'
  | 'conflito_manteve_aparelho'
  | 'conflito_usou_servidor';

export interface SyncLogEntry {
  /** ISO timestamp */
  at: string;
  event: SyncLogEvent;
  detail?: string;
}

export function readSyncLog(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncLogEntry[]) : [];
  } catch {
    return [];
  }
}

/** Acrescenta um evento, mantendo só os MAX_ENTRIES mais recentes. Nunca lança. */
export function logSync(event: SyncLogEvent, detail?: string, now: Date = new Date()): void {
  try {
    const entry: SyncLogEntry = { at: now.toISOString(), event };
    if (detail) entry.detail = detail;
    const updated = [...readSyncLog(), entry].slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    /* registro é melhor-esforço: sem espaço ou sem acesso, segue sem ele */
  }
}

/** Texto legível do registro (mais recente por último), para copiar e enviar. */
export function formatSyncLog(entries: SyncLogEntry[] = readSyncLog()): string {
  if (entries.length === 0) return 'Registro de sincronização vazio.';
  return entries.map((e) => `${e.at}  ${e.event}${e.detail ? `  ${e.detail}` : ''}`).join('\n');
}

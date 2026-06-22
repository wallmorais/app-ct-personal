import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Bell, Download, Upload, BellRing, ShieldCheck, Archive, Trash2, HardDriveDownload, User } from 'lucide-react';
import type { AppData } from '../types';
import {
  exportData,
  importData,
  listBackups,
  createAutoBackup,
  downloadBackup,
  deleteBackup,
  nextBackupDate,
  type BackupEntry,
} from '../lib/storage';
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '../lib/notifications';
import Toast, { type ToastState } from './Toast';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  pendingToday: number;
  onTestNotification: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}

export default function ConfigView({ data, setData, pendingToday, onTestNotification }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    getNotificationPermission(),
  );
  const [backups, setBackups] = useState<BackupEntry[]>(() => listBackups());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [backupParaExcluir, setBackupParaExcluir] = useState<string | null>(null);

  useEffect(() => {
    setBackups(listBackups());
  }, [data]);

  function handleTimeChange(value: string) {
    setData((prev) => ({ ...prev, config: { ...prev.config, notificationTime: value } }));
  }

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'denied') {
      setToast({
        type: 'error',
        message:
          'As notificações estão bloqueadas. Habilite nas configurações do navegador/site para receber o lembrete.',
      });
    }
  }

  function handleManualBackup() {
    const entry = createAutoBackup(data);
    setBackups(listBackups());
    setToast({ type: 'success', message: `Backup criado: ${entry.name}` });
  }

  function handleDeleteBackup(name: string) {
    deleteBackup(name);
    setBackups(listBackups());
    setBackupParaExcluir(null);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importData(file);
      setData(imported);
      setToast({ type: 'success', message: 'Backup importado com sucesso!' });
    } catch (err) {
      setToast({
        type: 'error',
        message: 'Não foi possível importar o arquivo. Verifique se é um backup válido.',
      });
    } finally {
      e.target.value = '';
    }
  }

  const proximoBackup = nextBackupDate();

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">Configurações</h2>

      {/* ============ PERFIL PROFISSIONAL ============ */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-electric">
          <User size={18} />
          <h3 className="text-sm font-semibold">Perfil profissional</h3>
        </div>
        <p className="text-xs text-base-muted">
          Aparece no cabeçalho e na assinatura do relatório em PDF.
        </p>
        <div>
          <label htmlFor="config-nome">Nome</label>
          <input
            id="config-nome"
            type="text"
            value={data.config.nomeProfissional}
            onChange={(e) =>
              setData((prev) => ({
                ...prev,
                config: { ...prev.config, nomeProfissional: e.target.value },
              }))
            }
            placeholder="Seu nome completo"
          />
        </div>
        <div>
          <label htmlFor="config-registro">Registro / Certificação</label>
          <input
            id="config-registro"
            type="text"
            value={data.config.registroProfissional}
            onChange={(e) =>
              setData((prev) => ({
                ...prev,
                config: { ...prev.config, registroProfissional: e.target.value },
              }))
            }
            placeholder="Ex: Personal Trainer • CREF 000000"
          />
        </div>
      </section>

      {/* ============ LEMBRETE DIÁRIO ============ */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-electric">
          <Bell size={18} />
          <h3 className="text-sm font-semibold">Lembrete diário</h3>
        </div>
        <p className="text-xs text-base-muted">
          No horário definido, o app verifica as aulas de hoje sem check-in de presença e dispara uma notificação.
        </p>
        <div>
          <label htmlFor="notification-time">Horário do lembrete</label>
          <input
            id="notification-time"
            type="time"
            value={data.config.notificationTime}
            onChange={(e) => handleTimeChange(e.target.value)}
          />
        </div>

        <div className="bg-base-surface border border-base-border rounded-xl px-3 py-2.5 text-xs text-base-muted">
          Hoje há <span className="font-semibold text-white">{pendingToday}</span>{' '}
          {pendingToday === 1 ? 'aula' : 'aulas'} sem check-in.
        </div>

        {/* Permissão de notificação do sistema */}
        {permission === 'granted' ? (
          <div className="flex items-center gap-2 text-xs text-emerald">
            <ShieldCheck size={15} />
            Notificações do sistema ativadas.
          </div>
        ) : permission === 'unsupported' ? (
          <p className="text-xs text-base-muted">
            Este navegador não suporta notificações do sistema — o lembrete aparece dentro do app.
          </p>
        ) : (
          <button
            onClick={handleEnableNotifications}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-base-surface border border-base-border text-sm font-semibold active:bg-white/5"
          >
            <Bell size={16} />
            Ativar notificações do sistema
          </button>
        )}

        <button
          onClick={onTestNotification}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-electric text-white text-sm font-semibold active:bg-electric/80"
        >
          <BellRing size={17} />
          Testar notificação agora
        </button>
      </section>

      {/* ============ BACKUP AUTOMÁTICO ============ */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-electric">
          <Archive size={18} />
          <h3 className="text-sm font-semibold">Backups automáticos</h3>
        </div>
        <p className="text-xs text-base-muted">
          A cada 15 dias o app guarda automaticamente uma cópia dos seus dados. Próximo backup previsto:{' '}
          <span className="font-semibold text-white">{formatDate(proximoBackup)}</span>.
        </p>

        <button
          onClick={handleManualBackup}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-base-surface border border-base-border text-sm font-semibold active:bg-white/5"
        >
          <Archive size={16} />
          Gerar backup agora
        </button>

        {backups.length === 0 ? (
          <p className="text-xs text-base-muted text-center py-2">Nenhum backup gerado ainda.</p>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <div
                key={b.name}
                className="flex items-center gap-2 bg-base-surface border border-base-border rounded-xl px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{b.name}</p>
                  <p className="text-[11px] text-base-muted">{formatDateTime(b.createdAt)}</p>
                </div>
                <button
                  onClick={() => downloadBackup(b)}
                  aria-label="Baixar backup"
                  className="w-9 h-9 rounded-lg bg-base-card text-electric flex items-center justify-center active:bg-white/5 shrink-0"
                >
                  <HardDriveDownload size={16} />
                </button>
                <button
                  onClick={() => setBackupParaExcluir(b.name)}
                  aria-label="Excluir backup"
                  className="w-9 h-9 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center active:bg-red-500/20 shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ============ BACKUP MANUAL (EXPORT/IMPORT) ============ */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">Backup manual</h3>
        <p className="text-xs text-base-muted">
          Exporte para guardar fora do aparelho, ou importe para restaurar / migrar para outro dispositivo.
        </p>

        <button
          onClick={() => exportData(data)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald text-black text-sm font-semibold active:bg-emerald/80"
        >
          <Download size={17} />
          Exportar backup (JSON)
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-base-surface border border-base-border text-sm font-semibold active:bg-white/5"
        >
          <Upload size={17} />
          Importar backup (JSON)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleImport}
        />
      </section>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      {backupParaExcluir && (
        <ConfirmDialog
          title="Excluir backup"
          message={`Excluir o backup ${backupParaExcluir}?`}
          onCancel={() => setBackupParaExcluir(null)}
          onConfirm={() => handleDeleteBackup(backupParaExcluir)}
        />
      )}
    </div>
  );
}

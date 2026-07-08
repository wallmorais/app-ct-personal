import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Bell, Download, Upload, BellRing, ShieldCheck, Archive, Trash2, HardDriveDownload, User, LogOut, Sun, Moon, Monitor, Palmtree, Plus, Pencil, Mail, Lock, Loader2, CheckCircle2, MapPin, Phone } from 'lucide-react';
import { supabase, isSupabaseConfigured, traduzErroAuth } from '../lib/supabase';
import type { AppData, Profile, ProfessorVacation } from '../types';
import type { ThemePref } from '../lib/theme';
import { updateProfile } from '../lib/supabaseRepo';
import { findOverlappingVacation } from '../lib/periods';
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
  themePref: ThemePref;
  onChangeTheme: (pref: ThemePref) => void;
  profile: Profile | null;
  onProfileChange: (p: Profile | null) => void;
  session: Session | null;
}

const TEMA_OPCOES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}

function FeriasSection({ data, setData }: { data: AppData; setData: Props['setData'] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [conflito, setConflito] = useState<ProfessorVacation | null>(null);

  const sorted = [...data.feriasProfessor].sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));

  function openNew() {
    setEditingId(null);
    setInicio('');
    setFim('');
    setObs('');
    setErro('');
    setFormOpen(true);
  }

  function openEdit(v: ProfessorVacation) {
    setEditingId(v.id);
    setInicio(v.dataInicio);
    setFim(v.dataFim);
    setObs(v.observacao ?? '');
    setErro('');
    setFormOpen(true);
  }

  function handleSave() {
    if (!inicio || !fim) { setErro('Preencha início e término.'); return; }
    if (fim < inicio) { setErro('Término deve ser após o início.'); return; }
    const overlap = findOverlappingVacation(data.feriasProfessor, inicio, fim, editingId ?? undefined);
    if (overlap) {
      setConflito(overlap);
      return;
    }
    commitSave();
  }

  function commitSave(removeConflictId?: string) {
    setData((prev) => {
      let feriasProfessor = removeConflictId
        ? prev.feriasProfessor.filter((v) => v.id !== removeConflictId)
        : prev.feriasProfessor;

      if (editingId) {
        feriasProfessor = feriasProfessor.map((v) =>
          v.id === editingId ? { ...v, dataInicio: inicio, dataFim: fim, observacao: obs.trim() || undefined } : v,
        );
      } else {
        const newVacation: ProfessorVacation = {
          id: crypto.randomUUID(),
          dataInicio: inicio,
          dataFim: fim,
          observacao: obs.trim() || undefined,
          createdAt: new Date().toISOString(),
        };
        feriasProfessor = [...feriasProfessor, newVacation];
      }
      return { ...prev, feriasProfessor };
    });
    setFormOpen(false);
    setConflito(null);
  }

  function handleDelete(id: string) {
    setData((prev) => ({ ...prev, feriasProfessor: prev.feriasProfessor.filter((v) => v.id !== id) }));
    setConfirmDelete(null);
  }

  function fmtDate(iso: string) {
    return new Date(iso + 'T12:00').toLocaleDateString('pt-BR');
  }

  return (
    <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-electric">
          <Palmtree size={18} />
          <h3 className="text-sm font-semibold">Férias do Professor</h3>
        </div>
        <button onClick={openNew} className="flex items-center gap-1 text-xs font-semibold text-emerald active:opacity-70">
          <Plus size={14} /> Adicionar
        </button>
      </div>
      <p className="text-xs text-base-muted">
        Durante férias, a agenda indica visualmente e aulas não geram faltas nem reposições. O histórico é preservado.
      </p>

      {formOpen && (
        <div className="bg-base-surface border border-base-border rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ferias-inicio">Início</label>
              <input id="ferias-inicio" type="date" value={inicio} onChange={(e) => { setInicio(e.target.value); setErro(''); }} />
            </div>
            <div>
              <label htmlFor="ferias-fim">Término</label>
              <input id="ferias-fim" type="date" value={fim} min={inicio} onChange={(e) => { setFim(e.target.value); setErro(''); }} />
            </div>
          </div>
          <div>
            <label htmlFor="ferias-obs">Observação (opcional)</label>
            <input id="ferias-obs" type="text" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: Viagem, descanso..." />
          </div>
          {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
          <div className="flex gap-2">
            <button onClick={() => setFormOpen(false)} className="flex-1 py-2 rounded-xl bg-base-card border border-base-border text-xs font-semibold active:bg-base-hover/5">
              Cancelar
            </button>
            <button onClick={handleSave} className="flex-1 py-2 rounded-xl bg-emerald text-black text-xs font-semibold active:bg-emerald/80">
              Salvar
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !formOpen && (
        <p className="text-xs text-base-muted text-center py-2">Nenhum período de férias cadastrado.</p>
      )}

      {sorted.map((v) => (
        <div key={v.id} className="flex items-center justify-between bg-blue-500/10 border border-blue-500/25 rounded-xl px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
              {fmtDate(v.dataInicio)} a {fmtDate(v.dataFim)}
            </p>
            {v.observacao && <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70">{v.observacao}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button onClick={() => openEdit(v)} className="w-7 h-7 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400 active:bg-blue-500/20" aria-label="Editar">
              <Pencil size={13} />
            </button>
            <button onClick={() => setConfirmDelete(v.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 active:bg-red-500/20" aria-label="Excluir">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {confirmDelete && (
        <ConfirmDialog
          title="Excluir período de férias"
          message="Deseja excluir este período de férias? Isso afetará apenas a contabilização futura."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}

      {conflito && (
        <ConfirmDialog
          title="Período sobreposto"
          message="Já existe um período de férias que coincide com as datas informadas. Deseja substituir o período existente?"
          confirmLabel="Substituir"
          onCancel={() => setConflito(null)}
          onConfirm={() => commitSave(conflito.id)}
        />
      )}
    </section>
  );
}

function ContaSection({ profile, onProfileChange, session }: { profile: Profile | null; onProfileChange: (p: Profile | null) => void; session: Session | null }) {
  const [editingProfile, setEditingProfile] = useState(false);
  const [nome, setNome] = useState(profile?.nome ?? '');
  const [telefone, setTelefone] = useState(profile?.telefone ?? '');
  const [cidade, setCidade] = useState(profile?.cidade ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleSaveProfile() {
    if (!profile) return;
    setSaving(true);
    setMsg(null);
    try {
      const updated = { ...profile, nome: nome.trim(), telefone: telefone.trim(), cidade: cidade.trim() };
      await updateProfile(updated);
      onProfileChange(updated);
      setEditingProfile(false);
      setMsg({ type: 'ok', text: 'Perfil atualizado.' });
    } catch {
      setMsg({ type: 'err', text: 'Erro ao salvar perfil.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    setPwMsg(null);
    if (newPassword.length < 6) { setPwMsg({ type: 'err', text: 'Mínimo 6 caracteres.' }); return; }
    if (newPassword !== confirmPw) { setPwMsg({ type: 'err', text: 'As senhas não coincidem.' }); return; }
    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { setPwMsg({ type: 'err', text: traduzErroAuth(error.message) }); }
      else {
        setPwMsg({ type: 'ok', text: 'Senha alterada com sucesso.' });
        setNewPassword('');
        setConfirmPw('');
        setChangingPassword(false);
      }
    } catch {
      setPwMsg({ type: 'err', text: 'Erro de conexão.' });
    } finally {
      setPwLoading(false);
    }
  }

  async function handleChangeEmail() {
    setEmailMsg(null);
    const trimmed = newEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailMsg({ type: 'err', text: 'E-mail inválido.' });
      return;
    }
    setEmailLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) { setEmailMsg({ type: 'err', text: traduzErroAuth(error.message) }); }
      else {
        setEmailMsg({ type: 'ok', text: 'Confira sua caixa de entrada para confirmar o novo e-mail.' });
        setNewEmail('');
        setChangingEmail(false);
      }
    } catch {
      setEmailMsg({ type: 'err', text: 'Erro de conexão.' });
    } finally {
      setEmailLoading(false);
    }
  }

  const userEmail = session?.user?.email ?? '';
  const initials = (profile?.nome || userEmail).slice(0, 2).toUpperCase();

  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-base-muted px-1">Conta</p>

      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-emerald/20 flex items-center justify-center text-emerald text-sm font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{profile?.nome || 'Sem nome'}</p>
            <p className="text-xs text-base-muted truncate">{userEmail}</p>
          </div>
          {!editingProfile && (
            <button onClick={() => { setEditingProfile(true); setMsg(null); }} className="text-xs font-semibold text-emerald active:opacity-70 shrink-0">
              Editar
            </button>
          )}
        </div>

        {editingProfile && profile && (
          <div className="space-y-2 pt-1">
            <div>
              <label htmlFor="profile-nome">Nome</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none" aria-hidden="true" />
                <input id="profile-nome" type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="pl-9" placeholder="Seu nome" />
              </div>
            </div>
            <div>
              <label htmlFor="profile-telefone">Telefone</label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none" aria-hidden="true" />
                <input id="profile-telefone" type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} className="pl-9" placeholder="(11) 99999-0000" />
              </div>
            </div>
            <div>
              <label htmlFor="profile-cidade">Cidade</label>
              <div className="relative">
                <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none" aria-hidden="true" />
                <input id="profile-cidade" type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} className="pl-9" placeholder="São Paulo" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingProfile(false)} className="flex-1 py-2 rounded-xl bg-base-card border border-base-border text-xs font-semibold active:bg-base-hover/5">
                Cancelar
              </button>
              <button onClick={handleSaveProfile} disabled={saving} className="flex-1 py-2 rounded-xl bg-emerald text-black text-xs font-semibold active:bg-emerald/80 disabled:opacity-60 flex items-center justify-center gap-1.5">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        )}

        {!editingProfile && profile && (profile.telefone || profile.cidade) && (
          <div className="text-xs text-base-muted space-y-0.5 pt-1">
            {profile.telefone && <p className="flex items-center gap-1.5"><Phone size={12} /> {profile.telefone}</p>}
            {profile.cidade && <p className="flex items-center gap-1.5"><MapPin size={12} /> {profile.cidade}</p>}
          </div>
        )}

        {msg && (
          <p className={`text-xs px-3 py-2 rounded-xl ${msg.type === 'ok' ? 'text-emerald bg-emerald/10 border border-emerald/20' : 'text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20'}`}>
            {msg.type === 'ok' && <CheckCircle2 size={13} className="inline mr-1 -mt-0.5" />}
            {msg.text}
          </p>
        )}
      </section>

      {/* Alterar senha */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <button
          onClick={() => { setChangingPassword(!changingPassword); setPwMsg(null); }}
          className="w-full flex items-center gap-2 text-left"
        >
          <Lock size={16} className="text-electric shrink-0" />
          <span className="text-sm font-semibold flex-1">Alterar senha</span>
          <span className="text-xs text-base-muted">{changingPassword ? '▲' : '▼'}</span>
        </button>
        {changingPassword && (
          <div className="space-y-2 pt-1">
            <div>
              <label htmlFor="new-pw">Nova senha</label>
              <input id="new-pw" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label htmlFor="confirm-pw">Confirmar</label>
              <input id="confirm-pw" type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Repita a nova senha" />
            </div>
            <button onClick={handleChangePassword} disabled={pwLoading} className="w-full py-2 rounded-xl bg-emerald text-black text-xs font-semibold active:bg-emerald/80 disabled:opacity-60 flex items-center justify-center gap-1.5">
              {pwLoading && <Loader2 size={14} className="animate-spin" />}
              Salvar nova senha
            </button>
          </div>
        )}
        {pwMsg && (
          <p className={`text-xs px-3 py-2 rounded-xl ${pwMsg.type === 'ok' ? 'text-emerald bg-emerald/10 border border-emerald/20' : 'text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20'}`}>
            {pwMsg.text}
          </p>
        )}
      </section>

      {/* Alterar e-mail */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <button
          onClick={() => { setChangingEmail(!changingEmail); setEmailMsg(null); }}
          className="w-full flex items-center gap-2 text-left"
        >
          <Mail size={16} className="text-electric shrink-0" />
          <span className="text-sm font-semibold flex-1">Alterar e-mail</span>
          <span className="text-xs text-base-muted">{changingEmail ? '▲' : '▼'}</span>
        </button>
        <p className="text-xs text-base-muted">Atual: {userEmail}</p>
        {changingEmail && (
          <div className="space-y-2 pt-1">
            <div>
              <label htmlFor="new-email">Novo e-mail</label>
              <input id="new-email" type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="novo@email.com" />
            </div>
            <button onClick={handleChangeEmail} disabled={emailLoading} className="w-full py-2 rounded-xl bg-emerald text-black text-xs font-semibold active:bg-emerald/80 disabled:opacity-60 flex items-center justify-center gap-1.5">
              {emailLoading && <Loader2 size={14} className="animate-spin" />}
              Alterar e-mail
            </button>
          </div>
        )}
        {emailMsg && (
          <p className={`text-xs px-3 py-2 rounded-xl ${emailMsg.type === 'ok' ? 'text-emerald bg-emerald/10 border border-emerald/20' : 'text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20'}`}>
            {emailMsg.text}
          </p>
        )}
      </section>

      {/* Sair */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4">
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-semibold active:bg-red-500/20"
        >
          <LogOut size={17} />
          Sair da conta
        </button>
      </section>
    </>
  );
}

export default function ConfigView({
  data,
  setData,
  pendingToday,
  onTestNotification,
  themePref,
  onChangeTheme,
  profile,
  onProfileChange,
  session,
}: Props) {
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

      {/* ═══════════ GRUPO: PROFESSOR ═══════════ */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-base-muted px-1">Professor</p>

      {/* Perfil profissional */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-electric">
          <User size={18} />
          <h3 className="text-sm font-semibold">Dados do professor</h3>
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

      {/* Férias do professor */}
      <FeriasSection data={data} setData={setData} />

      {/* ═══════════ GRUPO: AGENDA ═══════════ */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-base-muted px-1 pt-2">Agenda</p>

      {/* Lembrete diário */}
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
          Hoje há <span className="font-semibold text-base-fg">{pendingToday}</span>{' '}
          {pendingToday === 1 ? 'aula' : 'aulas'} sem check-in.
        </div>

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
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-base-surface border border-base-border text-sm font-semibold active:bg-base-hover/5"
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

      {/* ═══════════ GRUPO: SISTEMA ═══════════ */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-base-muted px-1 pt-2">Sistema</p>

      {/* Aparência */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-electric">
          <Sun size={18} />
          <h3 className="text-sm font-semibold">Aparência</h3>
        </div>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema do aplicativo">
          {TEMA_OPCOES.map(({ value, label, icon: Icon }) => {
            const ativo = themePref === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={ativo}
                onClick={() => onChangeTheme(value)}
                className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-colors ${
                  ativo
                    ? 'bg-emerald/10 border-emerald text-emerald'
                    : 'bg-base-surface border-base-border text-base-muted active:bg-base-hover/5'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Backup automático */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-electric">
          <Archive size={18} />
          <h3 className="text-sm font-semibold">Backups automáticos</h3>
        </div>
        <p className="text-xs text-base-muted">
          A cada 15 dias o app guarda automaticamente uma cópia dos seus dados. Próximo backup previsto:{' '}
          <span className="font-semibold text-base-fg">{formatDate(proximoBackup)}</span>.
        </p>

        <button
          onClick={handleManualBackup}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-base-surface border border-base-border text-sm font-semibold active:bg-base-hover/5"
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
                  className="w-9 h-9 rounded-lg bg-base-card text-electric flex items-center justify-center active:bg-base-hover/5 shrink-0"
                >
                  <HardDriveDownload size={16} />
                </button>
                <button
                  onClick={() => setBackupParaExcluir(b.name)}
                  aria-label="Excluir backup"
                  className="w-9 h-9 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center active:bg-red-500/20 shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Exportar / Importar */}
      <section className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-electric">
          <Download size={18} />
          <h3 className="text-sm font-semibold">Exportar / Importar</h3>
        </div>
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
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-base-surface border border-base-border text-sm font-semibold active:bg-base-hover/5"
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

      {/* ═══════════ GRUPO: CONTA ═══════════ */}
      {isSupabaseConfigured && session && (
        <ContaSection profile={profile} onProfileChange={onProfileChange} session={session} />
      )}

      {/* ═══════════ SOBRE ═══════════ */}
      <footer className="text-center text-xs text-base-muted pt-2 pb-4 space-y-0.5">
        <p className="font-semibold text-base-fg">PT.Control</p>
        <p>Versão 1.0.0</p>
        <p>© {new Date().getFullYear()} PT.Control · Desenvolvido por Wal Morais</p>
      </footer>

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

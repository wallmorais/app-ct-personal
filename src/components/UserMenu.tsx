import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  CloudOff,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import type { Profile, ViewName } from '../types';
import { supabase } from '../lib/supabase';
import type { ThemePref } from '../lib/theme';
import { formatSyncLog } from '../lib/syncLog';

export type SyncStatus = 'idle' | 'syncing' | 'saved' | 'error' | 'offline';

interface Props {
  profile: Profile | null;
  email: string;
  onNavigate: (view: ViewName) => void;
  /**
   * 'sidebar' (desktop): botão largo no rodapé da barra lateral, menu abre para cima.
   * 'header' (celular/tablet): só o avatar no topo, menu abre como painel inferior.
   */
  variant: 'sidebar' | 'header';
  themePref: ThemePref;
  onChangeTheme: (pref: ThemePref) => void;
  syncStatus: SyncStatus;
  /** Horário (ISO) do último salvamento confirmado pelo servidor nesta sessão. */
  lastSavedAt: string | null;
}

const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

/** Iniciais do primeiro e do último nome ("Alessandra Alves" → "AA"). */
export function initialsOf(nome: string | undefined, email: string): string {
  const parts = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Texto do estado de sincronização — sempre em palavras, nunca só por cor. */
export function syncStatusLabel(status: SyncStatus, lastSavedAt: string | null): string {
  if (status === 'syncing') return 'Salvando…';
  if (status === 'error') return 'Erro ao salvar';
  if (status === 'offline') return 'Sem conexão com o servidor';
  return lastSavedAt ? `Tudo salvo · ${formatHora(lastSavedAt)}` : 'Tudo salvo';
}

export default function UserMenu({
  profile,
  email,
  onNavigate,
  variant,
  themePref,
  onChangeTheme,
  syncStatus,
  lastSavedAt,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'erro' | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const displayName = profile?.nome?.trim() || email.split('@')[0];
  const initials = initialsOf(profile?.nome, email);
  const statusText = syncStatusLabel(syncStatus, lastSavedAt);
  const hasProblem = syncStatus === 'error' || syncStatus === 'offline';

  function close(returnFocus = true) {
    setOpen(false);
    setConfirmingLogout(false);
    setCopied(null);
    if (returnFocus) buttonRef.current?.focus();
  }

  function menuItems(): HTMLElement[] {
    return Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? []);
  }

  // Ao abrir, o foco vai para o primeiro item (navegação por teclado/leitor de tela).
  useEffect(() => {
    if (open) menuItems()[0]?.focus();
  }, [open]);

  // Fecha ao clicar/tocar fora.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // No celular o menu é um painel sobre a página: trava a rolagem do fundo.
  useEffect(() => {
    if (!open || variant !== 'header') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, variant]);

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      // Menu não prende o Tab: sair dele fecha.
      close(false);
      return;
    }
    const items = menuItems();
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  }

  function onButtonKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
    }
  }

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(formatSyncLog());
      setCopied('ok');
    } catch {
      setCopied('erro');
    }
  }

  async function handleLogout() {
    close(false);
    await supabase.auth.signOut();
  }

  const itemClass =
    'w-full flex items-center gap-3 px-4 min-h-[44px] text-sm text-left text-base-fg hover:bg-base-hover/5 focus-visible:bg-base-hover/5 transition-colors';

  const panel = (
    <div
      ref={panelRef}
      id={menuId}
      role="menu"
      aria-label="Menu da conta"
      onKeyDown={onPanelKeyDown}
      className={
        variant === 'sidebar'
          ? 'user-menu-pop absolute bottom-full left-0 mb-2 w-72 bg-base-card border border-base-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden z-50'
          : 'user-menu-sheet relative w-full sm:max-w-md bg-base-card border border-base-border rounded-t-2xl sm:rounded-2xl shadow-xl shadow-black/30 overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0'
      }
    >
      {/* Identificação */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-base-border">
        <div
          aria-hidden="true"
          className="w-10 h-10 rounded-full bg-emerald/15 flex items-center justify-center text-emerald text-sm font-bold shrink-0"
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-base-fg truncate">{displayName}</p>
          <p className="text-xs text-base-muted truncate">{email}</p>
        </div>
        {variant === 'header' && (
          <button
            onClick={() => close()}
            aria-label="Fechar menu"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-base-muted active:bg-base-hover/10"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Estado do salvamento */}
      <div className="px-4 py-3 border-b border-base-border">
        <div className="flex items-center gap-2.5 text-sm" role="status">
          <SyncStatusIcon status={syncStatus} />
          <span className={hasProblem ? 'font-medium text-base-fg' : 'text-base-muted'}>{statusText}</span>
        </div>
        {syncStatus === 'offline' && (
          <p className="mt-1.5 text-xs text-base-muted">
            As alterações ficam guardadas neste aparelho e são enviadas quando a conexão voltar.
          </p>
        )}
        {syncStatus === 'error' && (
          <p className="mt-1.5 text-xs text-base-muted">
            A última alteração não chegou ao servidor. Use “Tentar de novo” no aviso da tela.
          </p>
        )}
      </div>

      {/* Tema */}
      <div className="px-4 py-3 border-b border-base-border">
        <p id={`${menuId}-tema`} className="text-xs font-medium text-base-muted mb-2">
          Tema
        </p>
        <div role="group" aria-labelledby={`${menuId}-tema`} className="grid grid-cols-3 gap-1.5">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = themePref === value;
            return (
              <button
                key={value}
                data-menu-item
                role="menuitemradio"
                aria-checked={active}
                onClick={() => onChangeTheme(value)}
                className={`flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl border text-xs font-medium transition-colors ${
                  active
                    ? 'border-emerald bg-emerald/10 text-emerald'
                    : 'border-base-border text-base-muted hover:bg-base-hover/5 hover:text-base-fg'
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ações */}
      <div className="py-1.5">
        <button
          data-menu-item
          role="menuitem"
          onClick={() => {
            onNavigate('config');
            close(false);
          }}
          className={itemClass}
        >
          <Settings size={17} className="text-base-muted shrink-0" aria-hidden="true" />
          Configurações e perfil
        </button>
        <button data-menu-item role="menuitem" onClick={copyLog} className={itemClass}>
          <ClipboardCopy size={17} className="text-base-muted shrink-0" aria-hidden="true" />
          <span className="flex-1">Copiar registro de sincronização</span>
          {copied === 'ok' && <Check size={16} className="text-emerald shrink-0" aria-hidden="true" />}
        </button>
        <p className="sr-only" role="status">
          {copied === 'ok' ? 'Registro copiado.' : copied === 'erro' ? 'Não foi possível copiar o registro.' : ''}
        </p>
        {copied === 'erro' && (
          <p className="px-4 pb-2 text-xs text-red-600 dark:text-red-400">Não foi possível copiar neste navegador.</p>
        )}
      </div>

      {/* Sair — pede confirmação, para um toque acidental não deslogar */}
      <div className="border-t border-base-border py-1.5">
        {confirmingLogout ? (
          <div className="px-4 py-2.5 space-y-2.5">
            <p className="text-sm text-base-fg">Sair da conta neste aparelho?</p>
            <div className="flex gap-2">
              <button
                data-menu-item
                role="menuitem"
                onClick={() => setConfirmingLogout(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-base-surface border border-base-border text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                data-menu-item
                role="menuitem"
                onClick={handleLogout}
                className="flex-1 min-h-[44px] rounded-xl bg-red-600 text-white text-sm font-semibold active:bg-red-700"
              >
                Sair
              </button>
            </div>
          </div>
        ) : (
          <button
            data-menu-item
            role="menuitem"
            onClick={() => setConfirmingLogout(true)}
            className={`${itemClass} !text-red-600 dark:!text-red-400`}
          >
            <LogOut size={17} className="shrink-0" aria-hidden="true" />
            Sair da conta
          </button>
        )}
      </div>
    </div>
  );

  const Chevron = open ? ChevronDown : ChevronUp;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onButtonKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={hasProblem ? `Menu da conta de ${displayName}. ${statusText}` : `Menu da conta de ${displayName}`}
        className={
          variant === 'sidebar'
            ? 'w-full flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-base-hover/5 transition-colors'
            : 'flex items-center justify-center w-11 h-11 rounded-full active:bg-base-hover/10 transition-colors'
        }
      >
        <span className="relative shrink-0">
          <span className="w-8 h-8 rounded-full bg-emerald/15 flex items-center justify-center text-emerald text-xs font-bold">
            {initials}
          </span>
          <AvatarStatusDot status={syncStatus} />
        </span>
        {variant === 'sidebar' && (
          <>
            <span className="min-w-0 flex-1 text-left text-sm font-medium text-base-fg truncate">{displayName}</span>
            <Chevron size={16} className="text-base-muted shrink-0" aria-hidden="true" />
          </>
        )}
      </button>

      {open &&
        (variant === 'sidebar'
          ? panel
          : // Portal: o cabeçalho usa backdrop-blur, que prenderia um `fixed` dentro dele.
            createPortal(
              <div className="no-print fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
                <div className="user-menu-backdrop absolute inset-0 bg-black/50" aria-hidden="true" />
                {panel}
              </div>,
              document.body,
            ))}
    </div>
  );
}

function SyncStatusIcon({ status }: { status: SyncStatus }) {
  if (status === 'syncing') return <Loader2 size={16} className="text-base-muted animate-spin shrink-0" aria-hidden="true" />;
  if (status === 'error') return <AlertTriangle size={16} className="text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />;
  if (status === 'offline') return <CloudOff size={16} className="text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />;
  return <Check size={16} className="text-emerald shrink-0" aria-hidden="true" />;
}

/** Ponto discreto no avatar: só aparece enquanto salva ou quando há problema. */
function AvatarStatusDot({ status }: { status: SyncStatus }) {
  if (status === 'idle' || status === 'saved') return null;
  const color =
    status === 'error' ? 'bg-red-500' : status === 'offline' ? 'bg-amber-500' : 'bg-emerald animate-pulse';
  return (
    <span
      aria-hidden="true"
      className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-base-surface ${color}`}
    />
  );
}

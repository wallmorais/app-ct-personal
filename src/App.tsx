import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppData, Profile, StatusAula, ViewName } from './types';
import { loadData, saveData, runScheduledBackup, emptyAppData } from './lib/storage';
import { fetchAppData, persistAppData, fetchProfile } from './lib/supabaseRepo';
import { sendReminderNotification } from './lib/notifications';
import { currentTimeHHMM, todayDow, todayISO } from './lib/date';
import { isProfessorOnVacation, isStudentActiveOnDate } from './lib/periods';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { getThemePref, applyTheme, setThemePref, type ThemePref } from './lib/theme';
import BottomNav from './components/BottomNav';
import SidebarNav from './components/SidebarNav';
import AlertBanner from './components/AlertBanner';
import AgendaView from './components/AgendaView';
import ReposicoesView from './components/ReposicoesView';
import AlunosView from './components/AlunosView';
import RelatoriosView from './components/RelatoriosView';
import ConfigView from './components/ConfigView';
import AuthView from './components/AuthView';
import ResetPasswordView from './components/ResetPasswordView';
import { Logo } from './components/Logo';
import UserMenu from './components/UserMenu';

export default function App() {
  const [session, setSession] = useState<Session | null | 'loading'>('loading');
  const [isRecovery, setIsRecovery] = useState(false);
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<ViewName>('hoje');
  const [forceAlert, setForceAlert] = useState(false);
  const [themePref, setThemePrefState] = useState<ThemePref>(() => getThemePref());
  const [remoteReady, setRemoteReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const syncedUserIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<number | undefined>(undefined);
  const pendingDataRef = useRef<{ userId: string; data: AppData } | null>(null);

  // Aplica o tema escolhido e, no modo "sistema", reage à troca do SO.
  useEffect(() => {
    applyTheme(themePref);
    if (themePref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themePref]);

  function changeTheme(pref: ThemePref) {
    setThemePrefState(pref);
    setThemePref(pref);
  }

  // Sessão do Supabase: carrega a atual e escuta mudanças (login/logout/recovery).
  useEffect(() => {
    // Sem credenciais configuradas, libera o app direto (modo offline/dev).
    if (!isSupabaseConfigured) {
      setSession(null);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setIsRecovery(event === 'PASSWORD_RECOVERY');
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Cache local sempre atualizado primeiro (para offline/reload instantâneo).
    saveData(data);
    if (!isSupabaseConfigured || !remoteReady) return;
    if (typeof session !== 'object' || !session) return;
    const userId = session.user.id;
    pendingDataRef.current = { userId, data };
    setSyncStatus('syncing');
    window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      const snapshot = data;
      persistAppData(userId, snapshot)
        .then(() => {
          // Só limpa o pendente se nada novo entrou depois deste snapshot.
          if (pendingDataRef.current?.data === snapshot) pendingDataRef.current = null;
          setSyncStatus('saved');
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[PT.Control] ❌ Falha ao sincronizar com Supabase:', err?.message ?? err);
          setSyncStatus('error');
        });
    }, 500);
    return () => window.clearTimeout(persistTimerRef.current);
  }, [data, remoteReady, session]);

  // Flush pendente ao fechar/recarregar a aba — garante que o último estado
  // chegue ao Supabase mesmo que o debounce ainda não tenha disparado.
  // Usa fetch com keepalive: o navegador conclui a requisição mesmo após o
  // unload da página (o supabase.rpc normal seria abortado).
  useEffect(() => {
    function flushBeforeUnload() {
      const pending = pendingDataRef.current;
      if (!pending || typeof session !== 'object' || !session) return;
      pendingDataRef.current = null;
      window.clearTimeout(persistTimerRef.current);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/persist_app_data`;
      fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ payload: pending.data }),
      }).catch(() => {});
    }
    window.addEventListener('pagehide', flushBeforeUnload);
    window.addEventListener('beforeunload', flushBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', flushBeforeUnload);
      window.removeEventListener('beforeunload', flushBeforeUnload);
    };
  }, [session]);

  // Ao autenticar, busca o AppData do Supabase (fonte de verdade) uma vez por sessão.
  // Se o Supabase estiver vazio e existirem dados locais, faz o upload inicial (migração).
  useEffect(() => {
    if (!isSupabaseConfigured || typeof session !== 'object' || !session) return;
    const userId = session.user.id;
    if (syncedUserIdRef.current === userId) return;
    syncedUserIdRef.current = userId;
    setRemoteReady(false);

    Promise.all([
      fetchAppData(userId),
      fetchProfile(userId),
    ])
      .then(async ([remote, prof]) => {
        setProfile(prof);
        if (remote) {
          // Supabase é a fonte de verdade: sempre usa os dados do banco.
          console.info('[PT.Control] 🔵 Usando dados do Supabase (fonte de verdade).');
          setData(remote);
        } else {
          const local = loadData();
          const hasLocalData = local.alunos.length > 0 || local.registros.length > 0;
          if (hasLocalData) {
            // Primeiro acesso com dados locais pendentes → sobe para o banco.
            console.info('[PT.Control] ⬆️ Enviando dados locais para o Supabase (migração inicial).');
            await persistAppData(userId, local);
            setData(local);
          } else {
            console.info('[PT.Control] 🆕 Conta nova — iniciando base vazia.');
            setData(emptyAppData());
          }
        }
        setRemoteReady(true);
      })
      .catch((err) => {
        // Sem conexão / Supabase indisponível: cai para o cache local.
        // eslint-disable-next-line no-console
        console.error('[PT.Control] ⚠️ Falha ao carregar do Supabase, usando cache local:', err?.message ?? err);
        setSyncStatus('error');
        setRemoteReady(true);
      });
  }, [session]);

  // Backup automático a cada 15 dias: roda na abertura do app.
  useEffect(() => {
    const criado = runScheduledBackup(loadData());
    if (criado) {
      // eslint-disable-next-line no-console
      console.info(`[PT.Control] Backup automático criado: ${criado.name}`);
    }
  }, []);

  const pendingToday = useMemo(() => {
    const dow = todayDow();
    const today = todayISO();
    if (isProfessorOnVacation(data, today)) return 0;
    let count = 0;
    for (const schedule of data.schedules) {
      if (!schedule.dias.includes(dow)) continue;
      if (!isStudentActiveOnDate(data, schedule.alunoId, today)) continue;
      const reg = data.registros.find(
        (r) => r.alunoId === schedule.alunoId && r.slotId === schedule.slotId && r.data === today,
      );
      if (!reg || reg.status === 'pendente') count++;
    }
    for (const reg of data.registros) {
      if (reg.reposicaoData === today && reg.reposicaoStatus === 'pendente') count++;
    }
    return count;
  }, [data]);

  const showAlert = useMemo(() => {
    if (pendingToday === 0) return false;
    if (forceAlert) return true;
    return currentTimeHHMM() >= data.config.notificationTime;
  }, [pendingToday, forceAlert, data.config.notificationTime]);

  // Rotina diária do "Lembrete diário": no horário configurado, verifica as
  // aulas de hoje sem check-in e dispara a notificação do sistema, se houver.
  const lastNotifiedRef = useRef<string>('');
  useEffect(() => {
    const notificationTime = data.config.notificationTime;

    function checkAndNotify() {
      const today = todayISO();
      if (lastNotifiedRef.current === today) return; // já notificou hoje
      if (currentTimeHHMM() >= notificationTime && pendingToday > 0) {
        sendReminderNotification(pendingToday);
        lastNotifiedRef.current = today;
      }
    }

    checkAndNotify(); // confere imediatamente ao abrir/alterar
    const id = window.setInterval(checkAndNotify, 60_000); // reavalia a cada minuto
    return () => window.clearInterval(id);
  }, [data.config.notificationTime, pendingToday]);

  function updateRegistro(
    alunoId: string,
    slotId: string,
    dataAula: string,
    horario: string,
    status: StatusAula,
    reposicao?: { data: string; horario: string; excecao?: ('ferias_professor' | 'ferias_aluno')[]; reposicaoStatus?: import('./types').StatusReposicao },
    faltaObservacao?: string,
  ) {
    setData((prev) => {
      const existing = prev.registros.find(
        (r) => r.alunoId === alunoId && r.slotId === slotId && r.data === dataAula,
      );
      const observacao = status === 'falta' ? faltaObservacao?.trim() || undefined : undefined;
      const excecao = reposicao?.excecao?.length ? reposicao.excecao : undefined;

      const reposicaoStatus = reposicao ? (reposicao.reposicaoStatus ?? 'pendente') : undefined;

      if (existing) {
        return {
          ...prev,
          registros: prev.registros.map((r) =>
            r.id === existing.id
              ? {
                  ...r,
                  status,
                  reposicaoData: reposicao?.data,
                  reposicaoHorario: reposicao?.horario,
                  reposicaoStatus,
                  reposicaoExcecao: excecao,
                  faltaObservacao: observacao,
                }
              : r,
          ),
        };
      }

      return {
        ...prev,
        registros: [
          ...prev.registros,
          {
            id: crypto.randomUUID(),
            alunoId,
            slotId,
            data: dataAula,
            horario,
            status,
            reposicaoData: reposicao?.data,
            reposicaoHorario: reposicao?.horario,
            reposicaoStatus,
            reposicaoExcecao: excecao,
            faltaObservacao: observacao,
          },
        ],
      };
    });
  }

  // Carregando a sessão inicial do Supabase.
  if (session === 'loading') {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-base-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Fluxo de redefinição de senha (link do e-mail).
  if (isRecovery) return <ResetPasswordView />;

  // Rotas privadas: com Supabase configurado, exige login. Sem configuração,
  // o app abre direto (modo offline/dev), sem trancar o acesso.
  if (isSupabaseConfigured && !session) return <AuthView />;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base-bg flex lg:flex-row">
      <SyncIndicator status={syncStatus} onRetry={() => setData((d) => ({ ...d }))} />
      <div className="no-print">
        <SidebarNav
          view={view}
          onChange={setView}
          profile={profile}
          email={typeof session === 'object' && session ? session.user.email ?? '' : ''}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="lg:hidden no-print sticky top-0 z-20 bg-base-bg/95 backdrop-blur border-b border-base-border px-[max(1rem,env(safe-area-inset-left))] py-2.5"
          style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))' }}
        >
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Logo variant="light" height={40} />
            {isSupabaseConfigured && typeof session === 'object' && session && (
              <UserMenu
                profile={profile}
                email={session.user.email ?? ''}
                onNavigate={setView}
              />
            )}
          </div>
        </header>

        {showAlert && (
          <div className="no-print">
            <AlertBanner pendingCount={pendingToday} onDismiss={() => setForceAlert(false)} />
          </div>
        )}

        <main className="flex-1 px-[max(1rem,env(safe-area-inset-left))] pt-4 lg:pt-8 pb-28 lg:pb-10 max-w-md sm:max-w-2xl lg:max-w-4xl w-full mx-auto">
          {view === 'hoje' && <AgendaView data={data} onUpdateRegistro={updateRegistro} />}
          {view === 'reposicoes' && <ReposicoesView data={data} onUpdateRegistro={updateRegistro} />}
          {view === 'alunos' && <AlunosView data={data} setData={setData} />}
          {view === 'relatorios' && <RelatoriosView data={data} profile={profile} />}
          {view === 'config' && (
            <ConfigView
              data={data}
              setData={setData}
              pendingToday={pendingToday}
              onTestNotification={() => setForceAlert(true)}
              themePref={themePref}
              onChangeTheme={changeTheme}
              profile={profile}
              onProfileChange={setProfile}
              session={typeof session === 'object' ? session : null}
            />
          )}
        </main>

        <div className="no-print">
          <BottomNav view={view} onChange={setView} />
        </div>
      </div>
    </div>
  );
}

// Indicador de sincronização com o Supabase. Fica escondido quando ocioso ou
// logo após salvar; só chama atenção enquanto salva ou quando falha (com botão
// para tentar de novo). É a garantia visual de que os dados chegaram ao banco.
function SyncIndicator({
  status,
  onRetry,
}: {
  status: 'idle' | 'syncing' | 'saved' | 'error';
  onRetry: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === 'saved') {
      setVisible(true);
      const id = window.setTimeout(() => setVisible(false), 1800);
      return () => window.clearTimeout(id);
    }
    setVisible(status === 'syncing' || status === 'error');
  }, [status]);

  if (!visible) return null;

  const base =
    'no-print fixed z-50 bottom-24 lg:bottom-6 right-4 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium shadow-lg';

  if (status === 'error') {
    return (
      <div className={`${base} bg-red-600 text-white`} role="alert">
        <span>Erro ao salvar</span>
        <button onClick={onRetry} className="underline font-semibold">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (status === 'saved') {
    return (
      <div className={`${base} bg-emerald text-black`} role="status">
        Salvo ✓
      </div>
    );
  }

  return (
    <div className={`${base} bg-base-card border border-base-border text-base-fg`} role="status">
      <span className="w-3 h-3 border-2 border-emerald border-t-transparent rounded-full animate-spin" />
      Salvando…
    </div>
  );
}

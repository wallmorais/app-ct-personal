import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppData, Profile, StatusAula, ViewName } from './types';
import {
  loadData,
  saveData,
  runScheduledBackup,
  emptyAppData,
  markOfflineEdits,
  hasOfflineEdits,
  clearOfflineEdits,
} from './lib/storage';
import { fetchAppData, persistAppData, fetchProfile } from './lib/supabaseRepo';
import { sendReminderNotification } from './lib/notifications';
import { currentTimeHHMM, todayDow, todayISO } from './lib/date';
import { isProfessorOnVacation, isStudentActiveOnDate, computeUpdatedRegistro } from './lib/periods';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { getThemePref, applyTheme, setThemePref, type ThemePref } from './lib/theme';
import BottomNav from './components/BottomNav';
import SidebarNav from './components/SidebarNav';
import AlertBanner from './components/AlertBanner';
const AgendaView = lazy(() => import('./components/AgendaView'));
const ReposicoesView = lazy(() => import('./components/ReposicoesView'));
const AlunosView = lazy(() => import('./components/AlunosView'));
const RelatoriosView = lazy(() => import('./components/RelatoriosView'));
const ConfigView = lazy(() => import('./components/ConfigView'));
import AuthView from './components/AuthView';
import ResetPasswordView from './components/ResetPasswordView';
import { Logo } from './components/Logo';
import UserMenu, { type SyncStatus } from './components/UserMenu';
import { logSync } from './lib/syncLog';

export default function App() {
  const [session, setSession] = useState<Session | null | 'loading'>('loading');
  const [isRecovery, setIsRecovery] = useState(false);
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<ViewName>('hoje');
  const [forceAlert, setForceAlert] = useState(false);
  const [themePref, setThemePrefState] = useState<ThemePref>(() => getThemePref());
  const [remoteReady, setRemoteReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  // true enquanto a leitura inicial do Supabase não deu certo: o app roda com o
  // cache local e NÃO envia nada ao servidor (ver loadRemote).
  const [loadFailed, setLoadFailed] = useState(false);
  // Leitura deu certo depois de uma falha, mas houve alterações offline neste
  // aparelho: o usuário precisa escolher qual versão manter.
  const [conflict, setConflict] = useState<{ remote: AppData } | null>(null);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const syncedUserIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<number | undefined>(undefined);
  const pendingDataRef = useRef<{ userId: string; data: AppData } | null>(null);
  // Sempre aponta para o `data` mais recente (lido dentro de callbacks assíncronos).
  const dataRef = useRef(data);
  dataRef.current = data;
  // `data` no início da leitura remota da sessão — base para saber se o usuário
  // alterou algo enquanto a leitura falhava.
  const loadBaselineRef = useRef<AppData | null>(null);
  const loadHadFailureRef = useRef(false);
  const loadInFlightRef = useRef(false);

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
    // Alteração feita enquanto a leitura do servidor falhava: deixa marcado
    // (inclusive para depois de fechar o app) que há mudanças só neste aparelho.
    if (loadHadFailureRef.current && data !== loadBaselineRef.current && syncedUserIdRef.current) {
      markOfflineEdits(syncedUserIdRef.current);
    }
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
          setSyncErrorMessage(null);
          setLastSavedAt(new Date().toISOString());
          setSyncStatus('saved');
          logSync('gravacao_ok', `alunos=${snapshot.alunos.length} registros=${snapshot.registros.length}`);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Erro Supabase:', err);
          // eslint-disable-next-line no-console
          console.error('Detalhes:', {
            message: err?.message,
            details: err?.details,
            hint: err?.hint,
            code: err?.code,
          });
          setSyncErrorMessage(err?.message || 'Erro ao salvar');
          setSyncStatus('error');
          logSync('gravacao_falhou', [err?.code, err?.message].filter(Boolean).join(' ') || 'erro desconhecido');
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

  // Lê o AppData do Supabase (fonte de verdade) e só então libera a sincronização.
  //
  // Se a leitura falhar, a sincronização fica BLOQUEADA (remoteReady=false): o
  // app segue com o cache local, mas nada é enviado. Antes, a falha liberava o
  // envio e o cache local — possivelmente antigo — era gravado por cima do
  // banco pela RPC persist_app_data (que apaga e reinsere tudo).
  //
  // Quando uma nova tentativa dá certo depois de uma falha:
  //   - sem alterações offline → usa os dados do servidor, como sempre;
  //   - com alterações offline e servidor com dados → pergunta ao usuário.
  const loadRemote = useCallback(async (userId: string) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    try {
      const [remote, prof] = await Promise.all([fetchAppData(userId), fetchProfile(userId)]);
      if (syncedUserIdRef.current !== userId) return; // sessão trocou no meio
      setProfile(prof);

      const editedOffline =
        hasOfflineEdits(userId) ||
        (loadHadFailureRef.current && dataRef.current !== loadBaselineRef.current);
      loadHadFailureRef.current = false;
      setLoadFailed(false);
      setSyncStatus('idle');
      logSync(
        'leitura_ok',
        remote ? `alunos=${remote.alunos.length} registros=${remote.registros.length}` : 'servidor vazio',
      );

      if (remote && editedOffline) {
        // eslint-disable-next-line no-console
        console.info('[PT.Control] ⚠️ Alterações offline + dados no servidor — aguardando escolha do usuário.');
        logSync('conflito_detectado');
        setConflict({ remote });
        return; // remoteReady continua false até o usuário decidir
      }

      if (remote) {
        // Supabase é a fonte de verdade: sempre usa os dados do banco.
        console.info('[PT.Control] 🔵 Usando dados do Supabase (fonte de verdade).');
        setData(remote);
      } else {
        // Servidor vazio: não há o que conflitar, o estado local é o que vale.
        const local = dataRef.current;
        const hasLocalData = local.alunos.length > 0 || local.registros.length > 0;
        if (hasLocalData) {
          // Primeiro acesso com dados locais pendentes → sobe para o banco.
          console.info('[PT.Control] ⬆️ Enviando dados locais para o Supabase (migração inicial).');
          await persistAppData(userId, local);
        } else {
          console.info('[PT.Control] 🆕 Conta nova — iniciando base vazia.');
          setData(emptyAppData());
        }
      }
      clearOfflineEdits();
      setRemoteReady(true);
    } catch (err) {
      if (syncedUserIdRef.current !== userId) return;
      // Sem conexão / Supabase indisponível: segue no cache local, SEM sincronizar.
      // eslint-disable-next-line no-console
      console.error(
        '[PT.Control] ⚠️ Falha ao carregar do Supabase, usando cache local (sincronização pausada):',
        (err as { message?: string })?.message ?? err,
      );
      logSync('leitura_falhou', String((err as { message?: string })?.message ?? err));
      loadHadFailureRef.current = true;
      setLoadFailed(true);
      setSyncStatus('offline');
    } finally {
      loadInFlightRef.current = false;
    }
  }, []);

  // Ao autenticar, dispara a leitura uma vez por sessão/usuário.
  useEffect(() => {
    if (!isSupabaseConfigured || typeof session !== 'object' || !session) return;
    const userId = session.user.id;
    if (syncedUserIdRef.current === userId) return;
    syncedUserIdRef.current = userId;
    setRemoteReady(false);
    setLoadFailed(false);
    setConflict(null);
    loadBaselineRef.current = dataRef.current;
    loadHadFailureRef.current = false;
    loadInFlightRef.current = false;
    void loadRemote(userId);
  }, [session, loadRemote]);

  function retryLoad() {
    if (syncedUserIdRef.current) void loadRemote(syncedUserIdRef.current);
  }

  // Enquanto a leitura estiver falhando, tenta de novo sozinho: quando a rede
  // volta, quando o app volta para a frente e a cada 30 s.
  useEffect(() => {
    if (!loadFailed) return;
    const retry = () => {
      if (syncedUserIdRef.current) void loadRemote(syncedUserIdRef.current);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') retry();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(retry, 30_000);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(id);
    };
  }, [loadFailed, loadRemote]);

  // Resolução do conflito: só aqui a sincronização é liberada.
  function keepLocalData() {
    logSync('conflito_manteve_aparelho');
    clearOfflineEdits();
    setConflict(null);
    setRemoteReady(true); // o efeito de persistência envia o estado deste aparelho
  }

  function useServerData() {
    if (conflict) setData(conflict.remote);
    logSync('conflito_usou_servidor');
    clearOfflineEdits();
    setConflict(null);
    setRemoteReady(true);
  }

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
        void sendReminderNotification(pendingToday);
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
    reposicao?: { data: string; horario: string; excecao?: ('ferias_professor' | 'ferias_aluno' | 'conflito_horario')[]; reposicaoStatus?: import('./types').StatusReposicao },
    faltaObservacao?: string,
    faltaTipo?: import('./types').TipoFalta,
  ) {
    setData((prev) => {
      const existing = prev.registros.find(
        (r) => r.alunoId === alunoId && r.slotId === slotId && r.data === dataAula,
      );
      const updated = computeUpdatedRegistro(existing, {
        alunoId,
        slotId,
        dataAula,
        horario,
        status,
        reposicao,
        faltaObservacao,
        faltaTipo,
      });

      if (existing) {
        return {
          ...prev,
          registros: prev.registros.map((r) => (r.id === existing.id ? updated : r)),
        };
      }

      return { ...prev, registros: [...prev.registros, updated] };
    });
  }

  // Estado de sincronização exibido ao usuário. Um salvamento normal leva uma
  // fração de segundo e não precisa de aviso: "salvando" só aparece se demorar
  // mais que SLOW_SAVE_MS. Erro e falta de conexão aparecem na hora.
  const [slowSave, setSlowSave] = useState(false);
  useEffect(() => {
    if (syncStatus !== 'syncing') {
      setSlowSave(false);
      return;
    }
    const id = window.setTimeout(() => setSlowSave(true), SLOW_SAVE_MS);
    return () => window.clearTimeout(id);
  }, [syncStatus]);
  const shownSyncStatus: SyncStatus = syncStatus === 'syncing' && !slowSave ? 'idle' : syncStatus;

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

  const loggedSession = isSupabaseConfigured && typeof session === 'object' ? session : null;
  const userMenu = (variant: 'sidebar' | 'header') =>
    loggedSession && (
      <UserMenu
        variant={variant}
        profile={profile}
        email={loggedSession.user.email ?? ''}
        onNavigate={setView}
        themePref={themePref}
        onChangeTheme={changeTheme}
        syncStatus={shownSyncStatus}
        lastSavedAt={lastSavedAt}
      />
    );

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base-bg flex lg:flex-row">
      <SyncIndicator
        status={shownSyncStatus}
        errorMessage={syncErrorMessage}
        onRetry={syncStatus === 'offline' ? retryLoad : () => setData((d) => ({ ...d }))}
      />
      {conflict && <SyncConflictDialog onKeepLocal={keepLocalData} onUseServer={useServerData} />}
      <div className="no-print">
        <SidebarNav view={view} onChange={setView} footer={userMenu('sidebar')} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="lg:hidden no-print sticky top-0 z-20 bg-base-bg/95 backdrop-blur border-b border-base-border px-[max(1rem,env(safe-area-inset-left))] py-2.5"
          style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))' }}
        >
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Logo variant="light" height={40} />
            {userMenu('header')}
          </div>
        </header>

        {showAlert && (
          <div className="no-print">
            <AlertBanner pendingCount={pendingToday} onDismiss={() => setForceAlert(false)} />
          </div>
        )}

        <main className="flex-1 px-[max(1rem,env(safe-area-inset-left))] pt-4 lg:pt-8 pb-28 lg:pb-10 max-w-md sm:max-w-2xl lg:max-w-4xl w-full mx-auto">
          <Suspense fallback={<ViewLoadingFallback />}>
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
          </Suspense>
        </main>

        <div className="no-print">
          <BottomNav view={view} onChange={setView} />
        </div>
      </div>
    </div>
  );
}

// Exibido quando a leitura do servidor volta a funcionar depois de o usuário
// ter alterado dados offline. Não tem "fechar": as duas versões divergem e uma
// delas será descartada, então a escolha precisa ser explícita.
function SyncConflictDialog({ onKeepLocal, onUseServer }: { onKeepLocal: () => void; onUseServer: () => void }) {
  return (
    <div
      className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="sync-conflict-title"
    >
      <div className="w-full max-w-sm bg-base-card border border-base-border rounded-2xl p-5 space-y-4">
        <h2 id="sync-conflict-title" className="text-base font-semibold text-base-fg">
          Qual versão dos dados manter?
        </h2>
        <p className="text-sm text-base-muted">
          Você fez alterações neste aparelho enquanto ele estava sem conexão com o servidor. O servidor também tem
          dados salvos, que podem ser mais recentes se você usou outro aparelho.
        </p>
        <p className="text-sm text-base-muted">A versão que você não escolher será descartada.</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onKeepLocal}
            className="w-full py-2.5 rounded-xl bg-emerald text-black text-sm font-semibold active:opacity-80"
          >
            Manter as deste aparelho
          </button>
          <button
            onClick={onUseServer}
            className="w-full py-2.5 rounded-xl bg-base-surface border border-base-border text-sm font-semibold active:bg-base-hover/5"
          >
            Usar as do servidor
          </button>
        </div>
      </div>
    </div>
  );
}

// Fallback do Suspense enquanto o chunk da view (code-split) é baixado.
// Mesmo spinner já usado no loading da sessão, sem ocupar a tela toda.
function ViewLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-emerald border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Um salvamento que passa disso é considerado lento e ganha aviso de "Salvando…".
const SLOW_SAVE_MS = 2500;

// Aviso flutuante de sincronização. Fica invisível quando tudo corre bem — o
// salvamento é automático e o estado normal aparece discretamente no menu da
// conta. Só chama atenção quando o usuário precisa saber de algo: salvamento
// lento, erro ao salvar (com botão para tentar de novo) ou sem conexão.
function SyncIndicator({
  status,
  errorMessage,
  onRetry,
}: {
  status: SyncStatus;
  errorMessage?: string | null;
  onRetry: () => void;
}) {
  const base =
    'no-print fixed z-50 bottom-24 lg:bottom-6 right-4 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium shadow-lg';

  if (status === 'offline') {
    return (
      <div className={`${base} bg-amber-500 text-black max-w-[calc(100vw-2rem)]`} role="alert">
        <span>Sem conexão com o servidor — alterações ficam só neste aparelho</span>
        <button onClick={onRetry} className="underline font-semibold whitespace-nowrap">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={`${base} bg-red-600 text-white`} role="alert" title={errorMessage ?? undefined}>
        <span>Erro ao salvar</span>
        <button onClick={onRetry} className="underline font-semibold">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (status === 'syncing') {
    return (
      <div className={`${base} bg-base-card border border-base-border text-base-fg`} role="status">
        <span className="w-3 h-3 border-2 border-emerald border-t-transparent rounded-full animate-spin" />
        Salvando…
      </div>
    );
  }

  return null;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, StatusAula, ViewName } from './types';
import { loadData, saveData, runScheduledBackup } from './lib/storage';
import { sendReminderNotification } from './lib/notifications';
import { currentTimeHHMM, todayDow, todayISO } from './lib/date';
import BottomNav from './components/BottomNav';
import AlertBanner from './components/AlertBanner';
import AgendaView from './components/AgendaView';
import AlunosView from './components/AlunosView';
import RelatoriosView from './components/RelatoriosView';
import ConfigView from './components/ConfigView';
import { Logo } from './components/Logo';

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<ViewName>('agenda');
  const [forceAlert, setForceAlert] = useState(false);

  useEffect(() => {
    saveData(data);
  }, [data]);

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
    let count = 0;
    for (const slot of data.slots) {
      if (!slot.dias.includes(dow)) continue;
      for (const alunoId of slot.alunoIds) {
        const reg = data.registros.find(
          (r) => r.alunoId === alunoId && r.slotId === slot.id && r.data === today,
        );
        if (!reg || reg.status === 'pendente') count++;
      }
    }
    for (const reg of data.registros) {
      if (reg.reposicaoData === today && reg.status === 'reposicao') count++;
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
    reposicao?: { data: string; horario: string },
  ) {
    setData((prev) => {
      const existing = prev.registros.find(
        (r) => r.alunoId === alunoId && r.slotId === slotId && r.data === dataAula,
      );

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
          },
        ],
      };
    });
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base-bg flex flex-col">
      <header
        className="no-print sticky top-0 z-20 bg-base-bg/95 backdrop-blur border-b border-base-border px-[max(1rem,env(safe-area-inset-left))] py-2.5"
        style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))' }}
      >
        <div className="max-w-2xl mx-auto">
          <Logo variant="light" height={40} />
        </div>
      </header>

      {showAlert && (
        <div className="no-print">
          <AlertBanner pendingCount={pendingToday} onDismiss={() => setForceAlert(false)} />
        </div>
      )}

      <main className="flex-1 px-[max(1rem,env(safe-area-inset-left))] pt-4 pb-28 max-w-md sm:max-w-2xl w-full mx-auto">
        {view === 'agenda' && <AgendaView data={data} onUpdateRegistro={updateRegistro} />}
        {view === 'alunos' && <AlunosView data={data} setData={setData} />}
        {view === 'relatorios' && <RelatoriosView data={data} />}
        {view === 'config' && (
          <ConfigView
            data={data}
            setData={setData}
            pendingToday={pendingToday}
            onTestNotification={() => setForceAlert(true)}
          />
        )}
      </main>

      <div className="no-print">
        <BottomNav view={view} onChange={setView} />
      </div>
    </div>
  );
}

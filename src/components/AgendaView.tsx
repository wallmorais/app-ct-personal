import { useMemo, useState } from 'react';
import { Check, X, RotateCw, Clock, ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
import type { AppData, AulaSlot, Registro, StatusAula } from '../types';
import {
  ORDEM_SEMANA,
  DIA_LABELS,
  addDays,
  dowOf,
  formatDateLabel,
  formatDateShort,
  startOfMonth,
  startOfWeek,
  shiftMonth,
  todayISO,
} from '../lib/date';
import ReposicaoModal from './ReposicaoModal';
import FaltaModal from './FaltaModal';
import MonthlyCalendar from './MonthlyCalendar';

interface Props {
  data: AppData;
  onUpdateRegistro: (
    alunoId: string,
    slotId: string,
    data: string,
    horario: string,
    status: StatusAula,
    reposicao?: { data: string; horario: string },
    faltaObservacao?: string,
  ) => void;
}

interface AgendaItem {
  alunoId: string;
  slot: AulaSlot;
  kind: 'regular' | 'reposicao';
  registro?: Registro;
}

interface ModalState {
  alunoId: string;
  alunoNome: string;
  slotId: string;
  origData: string;
  origHorario: string;
  initialData?: string;
  initialHorario?: string;
  allowRemove: boolean;
}

interface FaltaModalState {
  alunoId: string;
  alunoNome: string;
  slotId: string;
  data: string;
  horario: string;
  /** Quando true, esta falta é sobre a aula de reposição (não a aula regular). */
  reposicao?: { data: string; horario: string };
}

const STATUS_STYLES: Record<StatusAula, string> = {
  pendente: 'border-base-border',
  presente: 'border-emerald/60',
  falta: 'border-red-500/60',
  reposicao: 'border-amber-500/60',
};

export default function AgendaView({ data, onUpdateRegistro }: Props) {
  const [viewMode, setViewMode] = useState<'dia' | 'mes'>('dia');
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [monthCursor, setMonthCursor] = useState(startOfMonth(todayISO()));
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [faltaModalState, setFaltaModalState] = useState<FaltaModalState | null>(null);

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);

  const weekDays = useMemo(() => {
    const today = todayISO();
    return ORDEM_SEMANA.map((dow, idx) => {
      const dateISO = addDays(weekStart, idx);
      return { dow, dateISO, active: dateISO === selectedDate, isToday: dateISO === today };
    });
  }, [weekStart, selectedDate]);

  const cards = useMemo(() => {
    const dow = dowOf(selectedDate);
    const map = new Map<string, AgendaItem[]>();

    for (const slot of data.slots) {
      if (!slot.dias.includes(dow)) continue;
      for (const alunoId of slot.alunoIds) {
        const registro = data.registros.find(
          (r) => r.alunoId === alunoId && r.slotId === slot.id && r.data === selectedDate,
        );
        const list = map.get(slot.horario) ?? [];
        list.push({ alunoId, slot, kind: 'regular', registro });
        map.set(slot.horario, list);
      }
    }

    for (const registro of data.registros) {
      if (registro.reposicaoData !== selectedDate || !registro.reposicaoHorario) continue;
      const slot = data.slots.find((s) => s.id === registro.slotId);
      if (!slot) continue;
      const list = map.get(registro.reposicaoHorario) ?? [];
      list.push({ alunoId: registro.alunoId, slot, kind: 'reposicao', registro });
      map.set(registro.reposicaoHorario, list);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data.slots, data.registros, selectedDate]);

  function handleStatus(alunoId: string, slot: AulaSlot, status: StatusAula) {
    if (status === 'reposicao') {
      const aluno = data.alunos.find((a) => a.id === alunoId);
      setModalState({
        alunoId,
        alunoNome: aluno?.nome ?? '',
        slotId: slot.id,
        origData: selectedDate,
        origHorario: slot.horario,
        allowRemove: false,
      });
      return;
    }

    const current = data.registros.find(
      (r) => r.alunoId === alunoId && r.slotId === slot.id && r.data === selectedDate,
    );

    if (status === 'falta' && current?.status !== 'falta') {
      const aluno = data.alunos.find((a) => a.id === alunoId);
      setFaltaModalState({
        alunoId,
        alunoNome: aluno?.nome ?? '',
        slotId: slot.id,
        data: selectedDate,
        horario: slot.horario,
      });
      return;
    }

    const next = current?.status === status ? 'pendente' : status;
    onUpdateRegistro(alunoId, slot.id, selectedDate, slot.horario, next);
  }

  function handleReposicaoStatus(registro: Registro, status: StatusAula) {
    if (status === 'falta' && registro.status !== 'falta') {
      const aluno = data.alunos.find((a) => a.id === registro.alunoId);
      setFaltaModalState({
        alunoId: registro.alunoId,
        alunoNome: aluno?.nome ?? '',
        slotId: registro.slotId,
        data: registro.data,
        horario: registro.horario,
        reposicao: { data: registro.reposicaoData!, horario: registro.reposicaoHorario! },
      });
      return;
    }

    const next = registro.status === status ? 'reposicao' : status;
    onUpdateRegistro(registro.alunoId, registro.slotId, registro.data, registro.horario, next, {
      data: registro.reposicaoData!,
      horario: registro.reposicaoHorario!,
    });
  }

  function handleReagendar(registro: Registro) {
    const aluno = data.alunos.find((a) => a.id === registro.alunoId);
    setModalState({
      alunoId: registro.alunoId,
      alunoNome: aluno?.nome ?? '',
      slotId: registro.slotId,
      origData: registro.data,
      origHorario: registro.horario,
      initialData: registro.reposicaoData,
      initialHorario: registro.reposicaoHorario,
      allowRemove: true,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 bg-base-surface border border-base-border rounded-xl p-1">
        <button
          onClick={() => setViewMode('dia')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
            viewMode === 'dia' ? 'bg-emerald text-black' : 'text-base-muted active:bg-base-hover/5'
          }`}
        >
          <Clock size={15} />
          Dia
        </button>
        <button
          onClick={() => {
            setMonthCursor(startOfMonth(selectedDate));
            setViewMode('mes');
          }}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
            viewMode === 'mes' ? 'bg-emerald text-black' : 'text-base-muted active:bg-base-hover/5'
          }`}
        >
          <CalendarRange size={15} />
          Mês
        </button>
      </div>

      {viewMode === 'mes' && (
        <MonthlyCalendar
          data={data}
          monthCursor={monthCursor}
          selectedDate={selectedDate}
          onChangeMonth={(dir) => setMonthCursor((m) => shiftMonth(m, dir === 'next' ? 1 : -1))}
          onSelectDate={(iso) => {
            setSelectedDate(iso);
            setViewMode('dia');
          }}
        />
      )}

      {viewMode === 'dia' && (
        <>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedDate((d) => addDays(d, -7))}
              aria-label="Semana anterior"
              className="w-9 h-9 rounded-full bg-base-surface border border-base-border flex items-center justify-center active:bg-base-hover/5"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setSelectedDate(todayISO())}
              className="text-xs font-semibold text-emerald px-3 py-1.5 rounded-full bg-emerald/10 active:bg-emerald/20"
            >
              Hoje
            </button>
            <button
              onClick={() => setSelectedDate((d) => addDays(d, 7))}
              aria-label="Próxima semana"
              className="w-9 h-9 rounded-full bg-base-surface border border-base-border flex items-center justify-center active:bg-base-hover/5"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(({ dow, dateISO, active, isToday }) => (
              <button
                key={dateISO}
                onClick={() => setSelectedDate(dateISO)}
                className={`flex flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-emerald text-black border-emerald'
                    : 'bg-base-surface text-base-muted border-base-border active:bg-base-hover/5'
                }`}
              >
                <span>{DIA_LABELS[dow]}</span>
                <span>{formatDateShort(dateISO).slice(0, 2)}</span>
                <span className={isToday ? (active ? 'text-black/60' : 'text-emerald') : 'invisible'}>•</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-base-muted text-sm">
            <Clock size={15} />
            <span>{formatDateLabel(selectedDate)}</span>
          </div>

          {cards.length === 0 && (
            <div className="text-center py-16 space-y-2">
              <CalendarRange size={36} className="mx-auto text-base-muted opacity-30" aria-hidden="true" />
              <p className="text-base-muted text-sm font-medium">Nenhuma aula para este dia</p>
              <p className="text-xs text-base-muted/60">Selecione outro dia ou cadastre alunos com horários.</p>
            </div>
          )}

          <div className="space-y-3">
            {cards.map(([horario, items]) => (
              <div key={horario} className="bg-base-card border border-base-border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl font-bold tabular-nums">{horario}</span>
                </div>

                <div className="space-y-2">
                  {items.map((item) => {
                    const aluno = data.alunos.find((a) => a.id === item.alunoId);
                    if (!aluno) return null;

                    if (item.kind === 'reposicao' && item.registro) {
                      const registro = item.registro;
                      const status = registro.status;
                      return (
                        <div
                          key={`${registro.id}-reposicao`}
                          className={`flex items-center justify-between gap-2 rounded-xl border bg-base-surface px-3 py-2.5 ${STATUS_STYLES[status]}`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm truncate">{aluno.nome}</p>
                              <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                Reposição
                              </span>
                            </div>
                            <p className="text-[11px] text-base-muted mt-0.5">
                              Origem: {formatDateLabel(registro.data)} às {registro.horario}
                            </p>
                            {status === 'falta' && registro.faltaObservacao && (
                              <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                                Obs.: {registro.faltaObservacao}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              aria-label="Reposição concluída"
                              onClick={() => handleReposicaoStatus(registro, 'presente')}
                              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                                status === 'presente'
                                  ? 'bg-emerald text-black'
                                  : 'bg-emerald/10 text-emerald active:bg-emerald/20'
                              }`}
                            >
                              <Check size={18} strokeWidth={2.5} />
                            </button>
                            <button
                              aria-label="Reposição não compareceu"
                              onClick={() => handleReposicaoStatus(registro, 'falta')}
                              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                                status === 'falta'
                                  ? 'bg-red-500 text-white'
                                  : 'bg-red-500/10 text-red-600 dark:text-red-400 active:bg-red-500/20'
                              }`}
                            >
                              <X size={18} strokeWidth={2.5} />
                            </button>
                            <button
                              aria-label="Reagendar reposição"
                              onClick={() => handleReagendar(registro)}
                              className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-600 dark:text-amber-400 active:bg-amber-500/20"
                            >
                              <RotateCw size={18} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const status: StatusAula = item.registro?.status ?? 'pendente';
                    return (
                      <div
                        key={`${item.slot.id}-${item.alunoId}`}
                        className={`flex items-center justify-between gap-2 rounded-xl border bg-base-surface px-3 py-2.5 ${STATUS_STYLES[status]}`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{aluno.nome}</p>
                          {status === 'reposicao' && item.registro?.reposicaoData && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                              Reposição agendada: {formatDateLabel(item.registro.reposicaoData)} às{' '}
                              {item.registro.reposicaoHorario}
                            </p>
                          )}
                          {status === 'falta' && item.registro?.faltaObservacao && (
                            <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                              Obs.: {item.registro.faltaObservacao}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            aria-label="Presença confirmada"
                            onClick={() => handleStatus(item.alunoId, item.slot, 'presente')}
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                              status === 'presente'
                                ? 'bg-emerald text-black'
                                : 'bg-emerald/10 text-emerald active:bg-emerald/20'
                            }`}
                          >
                            <Check size={18} strokeWidth={2.5} />
                          </button>
                          <button
                            aria-label="Falta"
                            onClick={() => handleStatus(item.alunoId, item.slot, 'falta')}
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                              status === 'falta'
                                ? 'bg-red-500 text-white'
                                : 'bg-red-500/10 text-red-600 dark:text-red-400 active:bg-red-500/20'
                            }`}
                          >
                            <X size={18} strokeWidth={2.5} />
                          </button>
                          <button
                            aria-label="Reposição"
                            onClick={() => handleStatus(item.alunoId, item.slot, 'reposicao')}
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                              status === 'reposicao'
                                ? 'bg-amber-500 text-black'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 active:bg-amber-500/20'
                            }`}
                          >
                            <RotateCw size={18} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {modalState && (
        <ReposicaoModal
          alunoNome={modalState.alunoNome}
          origData={modalState.origData}
          origHorario={modalState.origHorario}
          initialData={modalState.initialData}
          initialHorario={modalState.initialHorario}
          onClose={() => setModalState(null)}
          onRemove={
            modalState.allowRemove
              ? () => {
                  onUpdateRegistro(
                    modalState.alunoId,
                    modalState.slotId,
                    modalState.origData,
                    modalState.origHorario,
                    'pendente',
                  );
                  setModalState(null);
                }
              : undefined
          }
          onConfirm={(reposicaoData, reposicaoHorario) => {
            onUpdateRegistro(
              modalState.alunoId,
              modalState.slotId,
              modalState.origData,
              modalState.origHorario,
              'reposicao',
              { data: reposicaoData, horario: reposicaoHorario },
            );
            setModalState(null);
          }}
        />
      )}

      {faltaModalState && (
        <FaltaModal
          alunoNome={faltaModalState.alunoNome}
          onClose={() => setFaltaModalState(null)}
          onConfirm={(observacao) => {
            onUpdateRegistro(
              faltaModalState.alunoId,
              faltaModalState.slotId,
              faltaModalState.data,
              faltaModalState.horario,
              'falta',
              faltaModalState.reposicao,
              observacao,
            );
            setFaltaModalState(null);
          }}
        />
      )}
    </div>
  );
}

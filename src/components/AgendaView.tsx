import { useMemo, useState } from 'react';
import { Check, X, RotateCw, ChevronLeft, ChevronRight, CalendarRange, AlertTriangle } from 'lucide-react';
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

interface FlatCard {
  horario: string;
  item: AgendaItem;
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
  reposicao?: { data: string; horario: string };
}

const STATUS_LABEL: Record<StatusAula, string> = {
  pendente: 'Pendente',
  presente: 'Presente',
  falta: 'Falta',
  reposicao: 'Reposição agendada',
};

const STATUS_BADGE: Record<StatusAula, string> = {
  pendente: 'text-base-muted bg-base-surface border-base-border',
  presente: 'text-emerald bg-emerald/10 border-emerald/40',
  falta: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30',
  reposicao: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
};

const STATUS_CARD_BORDER: Record<StatusAula, string> = {
  pendente: 'border-base-border',
  presente: 'border-emerald/30',
  falta: 'border-red-500/30',
  reposicao: 'border-amber-500/30',
};

interface StatCardProps {
  label: string;
  value: number;
  color?: 'default' | 'green' | 'red' | 'amber';
}

function StatCard({ label, value, color = 'default' }: StatCardProps) {
  const valueColor =
    color === 'green' ? 'text-emerald' :
    color === 'red' ? 'text-red-500 dark:text-red-400' :
    color === 'amber' ? 'text-amber-500 dark:text-amber-400' :
    'text-base-fg';

  return (
    <div className="bg-base-card border border-base-border rounded-2xl p-3 text-center">
      <p className={`text-2xl font-bold tabular-nums leading-tight ${valueColor}`}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-base-muted mt-1 leading-tight">{label}</p>
    </div>
  );
}

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

  // Agrupa por horário (Map), depois achata em lista individual por aluno
  const flatCards = useMemo<FlatCard[]>(() => {
    const dow = dowOf(selectedDate);
    const result: FlatCard[] = [];

    for (const slot of data.slots) {
      if (!slot.dias.includes(dow)) continue;
      for (const alunoId of slot.alunoIds) {
        const registro = data.registros.find(
          (r) => r.alunoId === alunoId && r.slotId === slot.id && r.data === selectedDate,
        );
        result.push({ horario: slot.horario, item: { alunoId, slot, kind: 'regular', registro } });
      }
    }

    for (const registro of data.registros) {
      if (registro.reposicaoData !== selectedDate || !registro.reposicaoHorario) continue;
      const slot = data.slots.find((s) => s.id === registro.slotId);
      if (!slot) continue;
      result.push({
        horario: registro.reposicaoHorario,
        item: { alunoId: registro.alunoId, slot, kind: 'reposicao', registro },
      });
    }

    return result.sort((a, b) => a.horario.localeCompare(b.horario));
  }, [data.slots, data.registros, selectedDate]);

  // Stats do dia selecionado
  const stats = useMemo(() => {
    let presentes = 0, faltas = 0, reposPendentes = 0;
    for (const { item } of flatCards) {
      const s = item.registro?.status ?? 'pendente';
      if (s === 'presente') presentes++;
      else if (s === 'falta') faltas++;
      else if (s === 'reposicao') reposPendentes++;
    }
    const pendentes = flatCards.length - presentes - faltas - reposPendentes;
    return { total: flatCards.length, presentes, faltas, reposPendentes, pendentes };
  }, [flatCards]);

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
      {/* Toggle dia / mês */}
      <div className="grid grid-cols-2 gap-2 bg-base-surface border border-base-border rounded-xl p-1">
        <button
          onClick={() => setViewMode('dia')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
            viewMode === 'dia' ? 'bg-emerald text-black' : 'text-base-muted active:bg-base-hover/5'
          }`}
        >
          Hoje
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

      {/* Calendário mensal */}
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

      {/* View diária */}
      {viewMode === 'dia' && (
        <>
          {/* Navegação de semana */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setSelectedDate((d) => addDays(d, -7))}
              aria-label="Semana anterior"
              className="w-9 h-9 rounded-full bg-base-surface border border-base-border flex items-center justify-center active:bg-base-hover/5 shrink-0"
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
              className="w-9 h-9 rounded-full bg-base-surface border border-base-border flex items-center justify-center active:bg-base-hover/5 shrink-0"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Strip de dias da semana */}
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(({ dow, dateISO, active, isToday }) => (
              <button
                key={dateISO}
                onClick={() => setSelectedDate(dateISO)}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-emerald text-black border-emerald'
                    : 'bg-base-surface text-base-muted border-base-border active:bg-base-hover/5'
                }`}
              >
                <span className="text-[10px] font-medium opacity-80">{DIA_LABELS[dow]}</span>
                <span className="text-sm font-bold">{formatDateShort(dateISO).slice(0, 2)}</span>
                <span className={`text-[8px] leading-none ${isToday ? (active ? 'text-black/60' : 'text-emerald') : 'invisible'}`}>●</span>
              </button>
            ))}
          </div>

          {/* Data selecionada */}
          <p className="text-sm font-semibold text-base-muted px-1">{formatDateLabel(selectedDate)}</p>

          {/* Stats do dia */}
          <div className="grid grid-cols-4 gap-2">
            <StatCard label="Aulas de hoje" value={stats.total} />
            <StatCard label="Presenças" value={stats.presentes} color="green" />
            <StatCard label="Faltas" value={stats.faltas} color="red" />
            <StatCard label="Repos." value={stats.reposPendentes} color="amber" />
          </div>

          {/* Alerta de pendentes */}
          {stats.pendentes > 0 && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-2xl px-4 py-3">
              <AlertTriangle size={18} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                Você possui {stats.pendentes} {stats.pendentes === 1 ? 'aula' : 'aulas'} de hoje sem confirmação.
                Revise antes de encerrar o dia.
              </p>
            </div>
          )}

          {/* Empty state */}
          {flatCards.length === 0 && (
            <div className="text-center py-16 space-y-2">
              <CalendarRange size={36} className="mx-auto text-base-muted opacity-30" aria-hidden="true" />
              <p className="text-base-muted text-sm font-medium">Nenhuma aula para este dia</p>
              <p className="text-xs text-base-muted/60">Selecione outro dia ou cadastre alunos com horários.</p>
            </div>
          )}

          {/* Cards individuais por aluno */}
          <div className="space-y-3">
            {flatCards.map(({ horario, item }) => {
              const aluno = data.alunos.find((a) => a.id === item.alunoId);
              if (!aluno) return null;

              if (item.kind === 'reposicao' && item.registro) {
                const registro = item.registro;
                const status = registro.status;

                return (
                  <div
                    key={`${registro.id}-rep`}
                    className={`bg-base-card border rounded-2xl p-4 space-y-3 ${STATUS_CARD_BORDER[status]}`}
                  >
                    {/* Cabeçalho do card */}
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-base-surface border border-base-border flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold tabular-nums">{horario}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-base">{aluno.nome}</p>
                          <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                            Reposição
                          </span>
                        </div>
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mt-1 ${STATUS_BADGE[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                        {status === 'falta' && registro.faltaObservacao && (
                          <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                            Obs.: {registro.faltaObservacao}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Botões de ação */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        aria-label="Reposição concluída"
                        onClick={() => handleReposicaoStatus(registro, 'presente')}
                        className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                          status === 'presente'
                            ? 'bg-emerald text-black border-emerald'
                            : 'border-emerald/50 text-emerald active:bg-emerald/10'
                        }`}
                      >
                        <Check size={14} strokeWidth={2.5} />
                        Presente
                      </button>
                      <button
                        aria-label="Reposição não compareceu"
                        onClick={() => handleReposicaoStatus(registro, 'falta')}
                        className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                          status === 'falta'
                            ? 'bg-red-500 text-white border-red-500'
                            : 'border-red-500/50 text-red-600 dark:text-red-400 active:bg-red-500/10'
                        }`}
                      >
                        <X size={14} strokeWidth={2.5} />
                        Falta
                      </button>
                      <button
                        aria-label="Reagendar reposição"
                        onClick={() => handleReagendar(registro)}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-amber-500/50 text-amber-600 dark:text-amber-400 text-xs font-semibold active:bg-amber-500/10"
                      >
                        <RotateCw size={14} strokeWidth={2.5} />
                        Reagendar
                      </button>
                    </div>
                  </div>
                );
              }

              // Card de aula regular
              const status: StatusAula = item.registro?.status ?? 'pendente';
              return (
                <div
                  key={`${item.slot.id}-${item.alunoId}`}
                  className={`bg-base-card border rounded-2xl p-4 space-y-3 ${STATUS_CARD_BORDER[status]}`}
                >
                  {/* Cabeçalho do card */}
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-base-surface border border-base-border flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold tabular-nums">{horario}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-base">{aluno.nome}</p>
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mt-1 ${STATUS_BADGE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                      {status === 'reposicao' && item.registro?.reposicaoData && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                          Reposição: {formatDateLabel(item.registro.reposicaoData)} às {item.registro.reposicaoHorario}
                        </p>
                      )}
                      {status === 'falta' && item.registro?.faltaObservacao && (
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                          Obs.: {item.registro.faltaObservacao}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Botões de ação */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      aria-label="Presença confirmada"
                      onClick={() => handleStatus(item.alunoId, item.slot, 'presente')}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                        status === 'presente'
                          ? 'bg-emerald text-black border-emerald'
                          : 'border-emerald/50 text-emerald active:bg-emerald/10'
                      }`}
                    >
                      <Check size={14} strokeWidth={2.5} />
                      Presente
                    </button>
                    <button
                      aria-label="Agendar reposição"
                      onClick={() => handleStatus(item.alunoId, item.slot, 'reposicao')}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                        status === 'reposicao'
                          ? 'bg-amber-500 text-black border-amber-500'
                          : 'border-amber-500/50 text-amber-600 dark:text-amber-400 active:bg-amber-500/10'
                      }`}
                    >
                      <RotateCw size={14} strokeWidth={2.5} />
                      Reposição
                    </button>
                    <button
                      aria-label="Marcar falta"
                      onClick={() => handleStatus(item.alunoId, item.slot, 'falta')}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                        status === 'falta'
                          ? 'bg-red-500 text-white border-red-500'
                          : 'border-red-500/50 text-red-600 dark:text-red-400 active:bg-red-500/10'
                      }`}
                    >
                      <X size={14} strokeWidth={2.5} />
                      Falta
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal de reposição */}
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

      {/* Modal de falta */}
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

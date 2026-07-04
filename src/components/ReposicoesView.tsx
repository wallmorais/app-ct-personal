import { useMemo, useState } from 'react';
import { RotateCw, Check, X, Clock, CalendarDays, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppData, Registro, StatusAula } from '../types';
import { formatDateLabel, todayISO, startOfMonth, shiftMonth, addDays, monthLabel } from '../lib/date';
import ReposicaoModal from './ReposicaoModal';
import FaltaModal from './FaltaModal';

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

type FiltroStatus = 'todas' | 'pendentes' | 'concluidas' | 'faltas';

interface ReposicaoItem {
  registro: Registro;
  alunoNome: string;
}

interface ModalState {
  alunoId: string;
  alunoNome: string;
  slotId: string;
  origData: string;
  origHorario: string;
  initialData: string;
  initialHorario: string;
}

interface FaltaModalState {
  alunoId: string;
  alunoNome: string;
  slotId: string;
  data: string;
  horario: string;
  reposicao: { data: string; horario: string };
}

const FILTROS: { key: FiltroStatus; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'concluidas', label: 'Concluídas' },
  { key: 'faltas', label: 'Faltas' },
];

function statusDaReposicao(r: Registro): 'pendente' | 'concluida' | 'falta' | 'vencida' {
  if (r.status === 'presente') return 'concluida';
  if (r.status === 'falta' && r.reposicaoData) return 'falta';
  if (r.reposicaoData && r.reposicaoData < todayISO() && r.status === 'reposicao') return 'vencida';
  return 'pendente';
}

function statusLabel(s: ReturnType<typeof statusDaReposicao>): string {
  switch (s) {
    case 'concluida': return 'Concluída';
    case 'falta': return 'Faltou';
    case 'vencida': return 'Vencida';
    default: return 'Pendente';
  }
}

function statusBadgeClass(s: ReturnType<typeof statusDaReposicao>): string {
  switch (s) {
    case 'concluida': return 'text-emerald bg-emerald/10 border-emerald/40';
    case 'falta': return 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30';
    case 'vencida': return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30';
    default: return 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30';
  }
}

function statusCardBorder(s: ReturnType<typeof statusDaReposicao>): string {
  switch (s) {
    case 'concluida': return 'border-emerald/30';
    case 'falta': return 'border-red-500/30';
    case 'vencida': return 'border-amber-500/30';
    default: return 'border-blue-500/30';
  }
}

export default function ReposicoesView({ data, onUpdateRegistro }: Props) {
  const [filtro, setFiltro] = useState<FiltroStatus>('todas');
  const [mesCursor, setMesCursor] = useState(() => startOfMonth(todayISO()));
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [faltaModalState, setFaltaModalState] = useState<FaltaModalState | null>(null);

  const mesInicio = mesCursor;
  const mesFim = addDays(shiftMonth(mesCursor, 1), -1);

  const reposicoes = useMemo<ReposicaoItem[]>(() => {
    const items: ReposicaoItem[] = [];
    for (const r of data.registros) {
      if (!r.reposicaoData || !r.reposicaoHorario) continue;
      if (r.reposicaoData < mesInicio || r.reposicaoData > mesFim) continue;
      const aluno = data.alunos.find((a) => a.id === r.alunoId);
      if (!aluno) continue;
      items.push({ registro: r, alunoNome: aluno.nome });
    }
    items.sort((a, b) => {
      const da = a.registro.reposicaoData!;
      const db = b.registro.reposicaoData!;
      return db.localeCompare(da) || b.registro.reposicaoHorario!.localeCompare(a.registro.reposicaoHorario!);
    });
    return items;
  }, [data.registros, data.alunos, mesInicio, mesFim]);

  const filtradas = useMemo(() => {
    if (filtro === 'todas') return reposicoes;
    return reposicoes.filter((item) => {
      const s = statusDaReposicao(item.registro);
      if (filtro === 'pendentes') return s === 'pendente' || s === 'vencida';
      if (filtro === 'concluidas') return s === 'concluida';
      if (filtro === 'faltas') return s === 'falta';
      return true;
    });
  }, [reposicoes, filtro]);

  const contagens = useMemo(() => {
    let pendentes = 0, concluidas = 0, faltas = 0;
    for (const item of reposicoes) {
      const s = statusDaReposicao(item.registro);
      if (s === 'pendente' || s === 'vencida') pendentes++;
      else if (s === 'concluida') concluidas++;
      else if (s === 'falta') faltas++;
    }
    return { total: reposicoes.length, pendentes, concluidas, faltas };
  }, [reposicoes]);

  function handlePresente(r: Registro) {
    const next = r.status === 'presente' ? 'reposicao' : 'presente';
    onUpdateRegistro(r.alunoId, r.slotId, r.data, r.horario, next, {
      data: r.reposicaoData!,
      horario: r.reposicaoHorario!,
    });
  }

  function handleFalta(r: Registro) {
    if (r.status !== 'falta') {
      const aluno = data.alunos.find((a) => a.id === r.alunoId);
      setFaltaModalState({
        alunoId: r.alunoId,
        alunoNome: aluno?.nome ?? '',
        slotId: r.slotId,
        data: r.data,
        horario: r.horario,
        reposicao: { data: r.reposicaoData!, horario: r.reposicaoHorario! },
      });
      return;
    }
    onUpdateRegistro(r.alunoId, r.slotId, r.data, r.horario, 'reposicao', {
      data: r.reposicaoData!,
      horario: r.reposicaoHorario!,
    });
  }

  function handleReagendar(r: Registro) {
    const aluno = data.alunos.find((a) => a.id === r.alunoId);
    setModalState({
      alunoId: r.alunoId,
      alunoNome: aluno?.nome ?? '',
      slotId: r.slotId,
      origData: r.data,
      origHorario: r.horario,
      initialData: r.reposicaoData!,
      initialHorario: r.reposicaoHorario!,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Reposições</h2>
          <p className="text-sm text-base-muted">{contagens.total} {contagens.total === 1 ? 'reposição' : 'reposições'}</p>
        </div>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setMesCursor((m) => shiftMonth(m, -1))}
          aria-label="Mês anterior"
          className="w-9 h-9 rounded-full bg-base-surface border border-base-border flex items-center justify-center active:bg-base-hover/5 shrink-0"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => setMesCursor(startOfMonth(todayISO()))}
          className="text-sm font-semibold text-base-fg"
        >
          {monthLabel(mesCursor)}
        </button>
        <button
          onClick={() => setMesCursor((m) => shiftMonth(m, 1))}
          aria-label="Próximo mês"
          className="w-9 h-9 rounded-full bg-base-surface border border-base-border flex items-center justify-center active:bg-base-hover/5 shrink-0"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-base-card border border-base-border rounded-2xl p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-blue-500 dark:text-blue-400">{contagens.pendentes}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-base-muted mt-1">Pendentes</p>
        </div>
        <div className="bg-base-card border border-base-border rounded-2xl p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-emerald">{contagens.concluidas}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-base-muted mt-1">Concluídas</p>
        </div>
        <div className="bg-base-card border border-base-border rounded-2xl p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-red-500 dark:text-red-400">{contagens.faltas}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-base-muted mt-1">Faltas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-base-muted shrink-0" />
        <div className="flex gap-1.5 flex-wrap">
          {FILTROS.map((f) => {
            const active = filtro === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-emerald text-black border-emerald'
                    : 'bg-base-surface text-base-muted border-base-border active:bg-base-hover/5'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {filtradas.length === 0 && (
        <div className="text-center py-16 space-y-2">
          <RotateCw size={36} className="mx-auto text-base-muted opacity-30" aria-hidden="true" />
          <p className="text-base-muted text-sm font-medium">
            {reposicoes.length === 0
              ? 'Nenhuma reposição registrada'
              : 'Nenhuma reposição neste filtro'}
          </p>
          <p className="text-xs text-base-muted/60">
            {reposicoes.length === 0
              ? 'Reposições aparecem aqui quando agendadas na aba Hoje.'
              : 'Tente outro filtro para ver mais resultados.'}
          </p>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {filtradas.map(({ registro: r, alunoNome }) => {
          const status = statusDaReposicao(r);
          const isFinal = status === 'concluida' || status === 'falta';

          return (
            <div
              key={r.id}
              className={`bg-base-card border rounded-2xl p-4 space-y-3 ${statusCardBorder(status)}`}
            >
              {/* Cabeçalho */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <RotateCw size={16} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-base">{alunoNome}</p>
                  <span className={`inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border mt-0.5 ${statusBadgeClass(status)}`}>
                    {statusLabel(status)}
                  </span>
                </div>
              </div>

              {/* Detalhes */}
              <div className="grid grid-cols-2 gap-2 text-xs text-base-muted">
                <div className="flex items-center gap-1.5 bg-base-surface border border-base-border rounded-xl px-3 py-2">
                  <CalendarDays size={13} className="shrink-0 opacity-60" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide opacity-60">Aula original</p>
                    <p className="font-semibold text-base-fg">{formatDateLabel(r.data)} • {r.horario}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-base-surface border border-base-border rounded-xl px-3 py-2">
                  <Clock size={13} className="shrink-0 opacity-60" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide opacity-60">Reposição</p>
                    <p className="font-semibold text-base-fg">{formatDateLabel(r.reposicaoData!)} • {r.reposicaoHorario}</p>
                  </div>
                </div>
              </div>

              {r.faltaObservacao && (
                <p className="text-[11px] text-red-600 dark:text-red-400 px-1">Obs.: {r.faltaObservacao}</p>
              )}

              {/* Ações */}
              {!isFinal && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handlePresente(r)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                      r.status === 'presente'
                        ? 'bg-emerald text-black border-emerald'
                        : 'border-emerald/50 text-emerald active:bg-emerald/10'
                    }`}
                  >
                    <Check size={14} strokeWidth={2.5} />
                    Presente
                  </button>
                  <button
                    onClick={() => handleFalta(r)}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-500/50 text-red-600 dark:text-red-400 text-xs font-semibold active:bg-red-500/10"
                  >
                    <X size={14} strokeWidth={2.5} />
                    Falta
                  </button>
                  <button
                    onClick={() => handleReagendar(r)}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-amber-500/50 text-amber-600 dark:text-amber-400 text-xs font-semibold active:bg-amber-500/10"
                  >
                    <RotateCw size={14} strokeWidth={2.5} />
                    Reagendar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de reagendamento */}
      {modalState && (
        <ReposicaoModal
          alunoNome={modalState.alunoNome}
          origData={modalState.origData}
          origHorario={modalState.origHorario}
          initialData={modalState.initialData}
          initialHorario={modalState.initialHorario}
          onClose={() => setModalState(null)}
          onRemove={() => {
            onUpdateRegistro(
              modalState.alunoId,
              modalState.slotId,
              modalState.origData,
              modalState.origHorario,
              'pendente',
            );
            setModalState(null);
          }}
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
